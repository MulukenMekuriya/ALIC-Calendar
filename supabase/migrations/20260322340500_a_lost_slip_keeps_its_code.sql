-- =====================================================
-- A lost slip is reprinted with the code it already had
-- =====================================================
--
-- 20260321001700 made a reprint ROTATE the code, and said why: the old slip
-- dies, so paper dropped in the car park is worthless. That was right when the
-- child wore a tag NUMBER and only the parent held the code.
--
-- 20260321000200 then printed the code on the child's tag too, at the ministry
-- lead's request. From then on a rotation killed the code on every tag already
-- worn in a classroom: the parent walked away with a slip that matched none of
-- their children, and the teacher at the door held a tag the desk refused.
-- Replacing one lost piece of paper broke every piece that was not lost.
--
-- So a reprint now prints the code the family already has. Nothing else about
-- it changes: it still finds the family the same way, still refuses once
-- everyone has gone home, still writes the audit row and still texts the code.
--
-- THE CODE IS KEPT, NOT ONLY HASHED. kids_check_in_secrets held HMACs alone, so
-- a code could be checked but never read back - the only reason a reprint had
-- to mint a new one. check_in_children now writes the code and the QR token
-- beside their hashes, and the hashes still do all the matching at pickup.
--
-- What that costs, stated rather than hidden:
--
--   * The table holds live codes in the clear. It is closed to every role but
--     service_role (REVOKE ALL, RLS on, no policies) and is read only by
--     SECURITY DEFINER functions. The hash was never much of a wall against
--     someone already inside the database: the pepper lives in the same
--     database, and four characters from a 22-glyph alphabet is 234,256
--     guesses. The token is long, but the code alone collects a child, so
--     hiding the token at rest protects nothing the code does not.
--
--   * A lost slip found later still works. That is what "the same code" means,
--     and it gives away no more than the child's own tag already does. What
--     stands between a stranger and a child is at the door: the named
--     collector for a restricted child, "who is collecting?", and the audit.
--
-- A BATCH CHECKED IN BEFORE THIS MIGRATION has no code on file, and nothing can
-- recover one from an HMAC. A reprint for it still rotates, exactly as before.
-- On 8 October 2026 production had no live codes and no open session, so
-- pushed outside a service this never happens.
--
-- A KEPT CODE IS CHECKED BEFORE IT IS REUSED. If anything ever rotates the hash
-- and forgets the copy, printing the copy would hand a parent a dead slip. The
-- reprint reuses only a code and token whose hashes still match, and rotates
-- otherwise.

ALTER TABLE church.kids_check_in_secrets
  ADD COLUMN IF NOT EXISTS pickup_code TEXT,
  ADD COLUMN IF NOT EXISTS pickup_token TEXT;

COMMENT ON COLUMN church.kids_check_in_secrets.pickup_code IS
  'The code itself, kept so a lost slip reprints with the code already on the '
  'child''s tag. NULL for batches checked in before 20260322340500. Matching '
  'at pickup still uses code_hash.';
COMMENT ON COLUMN church.kids_check_in_secrets.pickup_token IS
  'The QR token itself, kept for the same reason as pickup_code.';

-- ---------------------------------------------------------- check-in

-- Unchanged from 20260322210900 except that it keeps the code and token it
-- mints, on the first call and on a replay. Same signature and same columns,
-- so CREATE OR REPLACE keeps its grants.
CREATE OR REPLACE FUNCTION church.check_in_children(_kids_session_id uuid, _child_person_ids uuid[], _room_ids uuid[] DEFAULT NULL::uuid[], _shift_token text DEFAULT NULL::text, _client_batch_key text DEFAULT NULL::text, _dropped_off_by_person_id uuid DEFAULT NULL::uuid, _override_capacity boolean DEFAULT false, _assignment_reason text DEFAULT NULL::text)
 RETURNS TABLE(
  batch_id UUID, pickup_code TEXT, pickup_token TEXT, check_in_id UUID,
  child_person_id UUID, child_name TEXT, room_id UUID, room_name TEXT,
  tag_number INTEGER, allergy_label TEXT, has_restriction BOOLEAN,
  guardian_phone TEXT, refused BOOLEAN, refusal_code TEXT, refusal_message TEXT,
  -- Sixteenth column, new here. A WARNING, not a refusal: in warn mode a
  -- child with no consent form is checked in normally and this says so, so
  -- the desk can mention it while the parent is still standing there.
  -- Refusal columns mean "this child was not checked in" and must not be
  -- borrowed to carry a note.
  consent_state TEXT)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  a  church.resolved_actor;
  ks church.kids_sessions%ROWTYPE;
  ke church.kids_events%ROWTYPE;
  _batch UUID;
  _code TEXT;
  _token TEXT;
  _existing church.kids_check_in_batches%ROWTYPE;
  _child UUID;
  _idx INTEGER := 0;
  -- child id -> refusal code, and child id -> consent state.
  --
  -- JSONB maps rather than arrays running alongside _child_person_ids. Three
  -- reasons can now refuse a child, so the code has to travel per child, and
  -- parallel arrays are exactly where this goes wrong silently: in plpgsql
  -- `anyarray || NULL::anyelement` and `|| NULL::anyarray` do different
  -- things, and a misaligned array would refuse the wrong sibling with no
  -- error anywhere.
  _refusals JSONB := '{}'::jsonb;
  _states   JSONB := '{}'::jsonb;
  _hold church.kids_check_in_holds%ROWTYPE;
  _gate RECORD;
  _mode TEXT;
  _n INTEGER;
  _i INTEGER;
  _room UUID;
  _tries INTEGER := 0;
  _household UUID;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted_to_check_in' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ks FROM church.kids_sessions
   WHERE id = _kids_session_id AND organization_id = a.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF ks.status <> 'open' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  -- No clock gate here. `status = 'open'`, checked immediately above, IS the
  -- gate: a session is open because the scheduler opened it or a leader did,
  -- and either way somebody has decided children may be checked in.
  --
  -- The window on kids_events governs when a session opens and closes by
  -- itself. Enforcing it a second time here meant a leader who opened a
  -- session deliberately — for a midweek programme, a delayed start, or simply
  -- to try the desk before Sunday — got `outside_check_in_window` and could
  -- check nobody in, with an open session on screen telling them they could.
  -- A session left open too long is handled by auto-close, not by refusing the
  -- volunteer standing in front of a parent.
  SELECT * INTO ke FROM church.kids_events WHERE id = ks.kids_event_id;

  IF _child_person_ids IS NULL OR array_length(_child_person_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_children_supplied';
  END IF;

  -- Idempotent retry after a lost response. The children are already checked
  -- in, so do NOT check them in again; rotate the credential (invalidating
  -- whatever may have been printed) and hand back a fresh, valid one. The
  -- kept copy rotates with it, or a later reprint would find a code that no
  -- longer matches its hash and have to mint another.
  IF _client_batch_key IS NOT NULL THEN
    SELECT * INTO _existing FROM church.kids_check_in_batches
     WHERE kids_session_id = _kids_session_id AND client_batch_key = _client_batch_key;

    -- Replay ONLY while the batch still has a child in a room. The key exists
    -- so a lost response cannot check the same children in twice; it is not a
    -- claim that this family can never check in again. Matching on the key
    -- alone meant a family returning later got a rotated code for children who
    -- were already checked OUT — the screen said success, a label printed, and
    -- the code on it resolved to nothing.
    IF FOUND AND NOT church.kids_batch_is_replayable(_existing.id) THEN
      -- The key is unique per session, so simply declining to replay would
      -- collide on the insert below and the family could not check in at all.
      -- Retire the spent batch's key instead: it only needs to be reserved
      -- while that batch is live, and the old value is kept, suffixed, so the
      -- morning's history is still readable.
      UPDATE church.kids_check_in_batches
         SET client_batch_key = client_batch_key || ':done:' || _existing.id
       WHERE id = _existing.id;
      _existing := NULL;
    END IF;

    IF _existing.id IS NOT NULL THEN
      _code := church.generate_pickup_code();
      _token := encode(gen_random_bytes(16), 'base64');
      UPDATE church.kids_check_in_secrets
         SET code_hash = church.hash_pickup(_code),
             token_hash = church.hash_pickup(_token),
             pickup_code = _code,
             pickup_token = _token,
             attempts = 0, locked_until = NULL, rotated_at = now(),
             -- Rotating a code that was already consumed leaves the parent
             -- holding a label that resolves to nothing.
             consumed_at = NULL
       -- Qualified: batch_id is also a RETURNS TABLE output parameter, and an
       -- unqualified reference here is ambiguous to plpgsql.
       WHERE kids_check_in_secrets.batch_id = _existing.id;

      -- Sixteen columns, matching the widened RETURNS TABLE. A replay reports
      -- what was already written, and nothing in it was refused - the refusal
      -- happens on the FIRST call, before the batch exists.
      --
      -- This branch is the reason the idempotency key exists, and it is the
      -- one a signature change is most likely to miss: plpgsql validates
      -- RETURN QUERY arity at EXECUTION, not at CREATE, so a short select list
      -- here applies cleanly and then throws 42804 only on a retry after a
      -- lost response - with the batch already committed, the children already
      -- in rooms, and a pickup code nobody has seen.
      RETURN QUERY
      SELECT _existing.id, _code, _token, ci.id, ci.child_person_id,
             ci.label_child_name, ci.room_id, ci.label_room_name, ci.tag_number,
             ci.label_allergy_short, ci.has_pickup_restriction,
             church.household_contact_phone(ci.household_id),
             false, NULL::TEXT, NULL::TEXT, NULL::TEXT
      FROM church.kids_check_ins ci
      WHERE ci.batch_id = _existing.id
      ORDER BY ci.tag_number;
      RETURN;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- Pass 1: who may not be checked in this morning
  -- ---------------------------------------------------------------------
  --
  -- A refusal is returned as DATA, never raised. Every other refusal in this
  -- function is a RAISE, which aborts the transaction and would destroy the
  -- batch, the pickup secret, the audit rows and EVERY SIBLING ALREADY
  -- INSERTED. A family of three with one held child must leave the desk with
  -- two labels and an apology, not with nothing.
  --
  -- Placed AFTER the idempotent-replay branch on purpose. A replay is a report
  -- of what was already written; refusing one would leave a family holding a
  -- printed label for children who are physically in rooms, with a rotated
  -- code that resolves to nothing.
  --
  -- Placed BEFORE the batch insert on purpose too: if every child is held,
  -- there is no batch, no secret, no code minted and no SMS queued. Nothing to
  -- print and nothing to lose.
  _n := coalesce(array_length(_child_person_ids, 1), 0);

  -- Read once. With consent switched off there is no reason to ask the gate
  -- anything at all, and this is the Sunday morning path.
  SELECT p.mode INTO _mode FROM church.kids_consent_policy p
   WHERE p.organization_id = a.organization_id;

  FOR _i IN 1.._n LOOP
    -- A HOLD OUTRANKS PAPERWORK. A kids admin decided this child stays with
    -- their parents this morning; being told instead that a form is missing
    -- would send the family to the desk to fix the wrong thing.
    _hold := church.kids_live_hold_for(_child_person_ids[_i], _kids_session_id);
    IF _hold.id IS NOT NULL THEN
      _refusals := _refusals
        || jsonb_build_object(_child_person_ids[_i]::TEXT, 'check_in_held');
      PERFORM church.kids_serve_hold(_hold.id, _kids_session_id, a.actor_name);
      CONTINUE;
    END IF;

    CONTINUE WHEN coalesce(_mode, 'warn') = 'off';

    SELECT * INTO _gate
      FROM church.kids_consent_gate(_child_person_ids[_i], _kids_session_id);

    -- The note, whether or not it refuses. Covered children say nothing.
    IF _gate.state NOT IN ('covered', 'covered_elsewhere') THEN
      _states := _states
        || jsonb_build_object(_child_person_ids[_i]::TEXT, _gate.state);
    END IF;

    -- allow is false ONLY when the policy is enforcing and the date has
    -- arrived. In warn mode, and before the date, this never fires - which is
    -- what lets this migration ship today without turning anybody away.
    IF NOT _gate.allow THEN
      _refusals := _refusals
        || jsonb_build_object(_child_person_ids[_i]::TEXT,
                              coalesce(_gate.refusal_code, 'consent_not_on_file'));
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM jsonb_object_keys(_refusals)) = _n AND _n > 0 THEN
    -- Everyone was held. Nothing is written at all.
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::UUID, p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
           NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, false, NULL::TEXT,
           true,
           _refusals->>p.id::TEXT,
           church.kids_refusal_message(
             coalesce(p.preferred_name, p.first_name), _refusals->>p.id::TEXT),
           _states->>p.id::TEXT
    FROM church.people p WHERE _refusals ? p.id::TEXT;
    RETURN;
  END IF;

  SELECT hm.household_id INTO _household
  FROM church.household_members hm
  WHERE hm.person_id = _child_person_ids[1]
    AND hm.end_date IS NULL AND hm.is_primary_household
  LIMIT 1;

  INSERT INTO church.kids_check_in_batches
    (organization_id, kids_session_id, household_id, client_batch_key,
     created_by_station_id, created_by_volunteer_id, created_by_name)
  VALUES (a.organization_id, _kids_session_id, _household, _client_batch_key,
          a.station_id, a.volunteer_id, a.actor_name)
  RETURNING id INTO _batch;

  -- Generate a code unique among the live codes for this session. Collision
  -- odds are ~1e-4 across a whole morning, but retry rather than trust that.
  _token := encode(gen_random_bytes(16), 'base64');
  LOOP
    _tries := _tries + 1;
    _code := church.generate_pickup_code();
    BEGIN
      -- Kept beside their hashes, so a lost slip can be reprinted with the
      -- code already on every child's tag. See the head of this migration.
      INSERT INTO church.kids_check_in_secrets
        (batch_id, kids_session_id, code_hash, token_hash,
         pickup_code, pickup_token, expires_at)
      VALUES (_batch, _kids_session_id,
              church.hash_pickup(_code), church.hash_pickup(_token),
              _code, _token,
              greatest(ks.ends_at
                        + make_interval(mins => coalesce(ke.auto_expire_minutes_after_end, 240)),
                       now()) + interval '4 hours');
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF _tries >= 10 THEN RAISE EXCEPTION 'could_not_allocate_pickup_code'; END IF;
    END;
  END LOOP;

  FOREACH _child IN ARRAY _child_person_ids LOOP
    -- _idx advances for EVERY child, held or not. _room_ids is POSITIONAL
    -- against _child_person_ids, so skipping the increment would put each
    -- remaining sibling in the previous sibling's classroom - silently, with
    -- no error, which is the worst kind of wrong this function could be.
    _idx := _idx + 1;
    CONTINUE WHEN _refusals ? _child::TEXT;
    _room := CASE WHEN _room_ids IS NULL THEN NULL ELSE _room_ids[_idx] END;
    PERFORM church.check_in_one_child(
      a, _kids_session_id, _batch, _child, _room,
      _dropped_off_by_person_id, _override_capacity, _assignment_reason);
  END LOOP;

  -- AFTER the children are inserted, not before. Queued any earlier the
  -- message named no children, because there were none on the batch yet.
  --
  -- Never raises — a failed text must not roll back a completed check-in.
  PERFORM church.queue_pickup_code_sms(_batch, _code);

  -- Accepted first, refused last, so the existing rows[0].pickup_code on the
  -- desk still finds a real code whenever at least one child got in. A refused
  -- row carries NO code: a held child's parent must never hold one.
  RETURN QUERY
  SELECT _batch, _code, _token, ci.id, ci.child_person_id,
         ci.label_child_name, ci.room_id, ci.label_room_name, ci.tag_number,
         ci.label_allergy_short, ci.has_pickup_restriction,
         church.household_contact_phone(ci.household_id),
         false, NULL::TEXT, NULL::TEXT,
         -- An accepted child can still carry a note: in warn mode they came
         -- in without a form, and the desk can say so while the parent is
         -- still there.
         _states->>ci.child_person_id::TEXT
  FROM church.kids_check_ins ci
  WHERE ci.batch_id = _batch

  UNION ALL

  SELECT _batch, NULL::TEXT, NULL::TEXT, NULL::UUID, p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, false, NULL::TEXT,
         true,
         _refusals->>p.id::TEXT,
         church.kids_refusal_message(
           coalesce(p.preferred_name, p.first_name), _refusals->>p.id::TEXT),
         _states->>p.id::TEXT
  FROM church.people p WHERE _refusals ? p.id::TEXT

  ORDER BY 13, 9;
END;
$function$;

GRANT EXECUTE ON FUNCTION church.check_in_children(
  UUID, UUID[], UUID[], TEXT, TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------- reprint

/**
 * Reissue a family's pickup slip with the code they already have.
 *
 * The code on file is reused when its hash still matches, so the reprinted
 * slip matches the tags the children are wearing and the old slip keeps
 * working. A batch with no code on file - checked in before 20260322340500 -
 * rotates instead, as every reprint used to.
 *
 * Refuses once every child on the batch has gone home: there is nothing left to
 * collect, and a live credential for a finished batch would be a key to an
 * empty room.
 *
 * Same signature and the same columns as 20260321001700, so the desk and the
 * kiosk call it unchanged and CREATE OR REPLACE keeps its grants.
 */
CREATE OR REPLACE FUNCTION church.reprint_pickup_label(
  _batch_id UUID, _reason TEXT DEFAULT NULL, _shift_token TEXT DEFAULT NULL)
RETURNS TABLE (
  batch_id UUID,
  pickup_code TEXT,
  pickup_token TEXT,
  household_name TEXT,
  check_in_id UUID,
  child_name TEXT,
  room_name TEXT,
  tag_number INTEGER,
  allergy_label TEXT,
  guardian_phone TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a church.resolved_actor;
  b church.kids_check_in_batches%ROWTYPE;
  _code TEXT;
  _token TEXT;
  _kept BOOLEAN := false;
  _tries INTEGER := 0;
  _still_in INTEGER;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO b FROM church.kids_check_in_batches
   WHERE id = _batch_id AND organization_id = a.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch_not_found'; END IF;

  SELECT count(*) INTO _still_in
  FROM church.kids_check_ins ci
  WHERE ci.batch_id = _batch_id AND ci.status = 'checked_in';

  IF _still_in = 0 THEN
    RAISE EXCEPTION 'nobody_left_to_collect';
  END IF;

  -- The code on file, but only if it is still the live one. A copy whose hash
  -- no longer matches would print a slip that resolves to nothing.
  SELECT s.pickup_code, s.pickup_token INTO _code, _token
  FROM church.kids_check_in_secrets s
  WHERE s.batch_id = _batch_id
    AND s.pickup_code IS NOT NULL
    AND s.pickup_token IS NOT NULL
    AND s.code_hash = church.hash_pickup(s.pickup_code)
    AND s.token_hash = church.hash_pickup(s.pickup_token);
  _kept := FOUND;

  IF _kept THEN
    BEGIN
      UPDATE church.kids_check_in_secrets s
         SET attempts = 0,
             locked_until = NULL,
             -- As before: children are still in rooms, so the slip must work
             -- for them even if the secret was consumed and re-opened.
             consumed_at = NULL,
             expires_at = greatest(s.expires_at, now() + interval '4 hours')
       WHERE s.batch_id = _batch_id;
    EXCEPTION WHEN unique_violation THEN
      -- Re-opening a consumed secret collided with another family's live code.
      -- Two live batches cannot share one, so this one has to rotate.
      _kept := false;
    END;
  END IF;

  IF NOT _kept THEN
    _token := encode(gen_random_bytes(16), 'base64');
    LOOP
      _tries := _tries + 1;
      _code := church.generate_pickup_code();
      BEGIN
        UPDATE church.kids_check_in_secrets s
           SET code_hash = church.hash_pickup(_code),
               token_hash = church.hash_pickup(_token),
               pickup_code = _code,
               pickup_token = _token,
               attempts = 0,
               locked_until = NULL,
               rotated_at = now(),
               consumed_at = NULL,
               expires_at = greatest(s.expires_at, now() + interval '4 hours')
         WHERE s.batch_id = _batch_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF _tries >= 10 THEN RAISE EXCEPTION 'could_not_allocate_pickup_code'; END IF;
      END;
    END LOOP;
  END IF;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, batch_id, kids_session_id, station_id,
     volunteer_id, actor_auth_user_id, actor_name, detail)
  VALUES (a.organization_id, 'label_reprint', 'success', _batch_id,
          b.kids_session_id, a.station_id, a.volunteer_id, auth.uid(),
          a.actor_name,
          jsonb_build_object('reason', coalesce(_reason, 'not given'),
                             'children_still_in', _still_in,
                             'code_kept', _kept));

  PERFORM church.queue_pickup_code_sms(_batch_id, _code);

  RETURN QUERY
  SELECT _batch_id, _code, _token,
         coalesce(h.name, 'This family'),
         ci.id, ci.label_child_name, ci.label_room_name, ci.tag_number,
         ci.label_allergy_short,
         church.household_contact_phone(ci.household_id)
  FROM church.kids_check_ins ci
  LEFT JOIN church.households h ON h.id = b.household_id
  WHERE ci.batch_id = _batch_id
    AND ci.status = 'checked_in'
  ORDER BY ci.tag_number;
END;
$$;

REVOKE ALL ON FUNCTION church.reprint_pickup_label(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.reprint_pickup_label(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
