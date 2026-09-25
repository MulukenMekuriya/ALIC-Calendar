-- =====================================================
-- A child with no consent is not turned away
-- =====================================================
--
-- The consent gate, inside check_in_children at last. It adds ONE more
-- refusal code to the mechanism 20260322200200 already built for holds and
-- proved with the sibling test, which is much cheaper and much safer than
-- inventing one here.
--
-- IT REFUSES NOBODY TODAY. kids_consent_gate returns allow = false only when
-- the policy is 'block' AND enforce_from has arrived. Both branches are in
-- 'warn' with no date, so this ships inert: every child is checked in exactly
-- as they are now, and the only visible change is that an accepted row can
-- carry a note saying the form is still wanted. The day it starts refusing is
-- a date somebody sets, months ahead, and it switches itself.
--
-- A REFUSAL IS DATA, NEVER A RAISE. Every other refusal in this function is a
-- RAISE, which aborts the transaction and would destroy the batch, the pickup
-- secret, the audit rows and EVERY SIBLING ALREADY INSERTED. On the first
-- enforced Sunday most families will have at least one unsigned child; a
-- RAISE would send them away with nothing rather than with two labels and an
-- apology.
--
-- A HOLD OUTRANKS PAPERWORK. A kids admin decided this child stays with their
-- parents this morning. Telling the family instead that a form is missing
-- would send them to the desk to fix the wrong thing.
--
-- WHY JSONB MAPS AND NOT PARALLEL ARRAYS. Three reasons can now refuse a
-- child, so the code has to travel per child. Arrays running alongside
-- _child_person_ids are exactly where this goes wrong silently: in plpgsql
-- `anyarray || NULL::anyelement` and `|| NULL::anyarray` do different things,
-- and a misaligned array refuses the wrong sibling with no error anywhere.
--
-- The whole of the rest of the function is UNCHANGED, character for
-- character, and was taken from the live definition rather than retyped -
-- including the comment explaining why _idx advances for every child whether
-- refused or not, which is the other way this could silently misplace
-- siblings.

-- ---------------------------------------------------------------------------
-- What a refused family is told
-- ---------------------------------------------------------------------------
--
-- One function, two callers - the all-refused branch and the partial one - so
-- the two can never drift into saying different things about the same code.
--
-- Each message names the remedy. A desk that says only "refused" leaves a
-- parent standing there with nothing to do about it, which is the failure
-- this copy exists to prevent.
CREATE OR REPLACE FUNCTION church.kids_refusal_message(
  _first_name TEXT,
  _code       TEXT
)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = church, public
AS $$
  SELECT CASE _code
    WHEN 'check_in_held' THEN
      coalesce(_first_name, 'This child')
      || ' stays with you for this service. Please speak with a Kids '
      || 'Ministry leader.'
    WHEN 'consent_no_guardian' THEN
      'We need a parent or guardian on file for '
      || coalesce(_first_name, 'this child')
      || ' before they can go to a classroom. Please see a Kids Ministry '
      || 'leader - it only takes a moment.'
    WHEN 'consent_not_on_file' THEN
      'We need the consent form for ' || coalesce(_first_name, 'this child')
      || ' before they can go to a classroom. It takes a couple of minutes '
      || 'here at the desk, and a leader can let you through today if that is '
      || 'difficult this morning.'
    ELSE
      coalesce(_first_name, 'This child')
      || ' cannot be checked in just now. Please speak with a Kids Ministry '
      || 'leader.'
  END
$$;

GRANT EXECUTE ON FUNCTION church.kids_refusal_message(TEXT, TEXT) TO authenticated;

-- Adding an output column is a new signature, so DROP then CREATE.
DROP FUNCTION IF EXISTS church.check_in_children(UUID, UUID[], UUID[], TEXT, TEXT, UUID, BOOLEAN, TEXT);

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
  -- whatever may have been printed) and hand back a fresh, valid one.
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
      INSERT INTO church.kids_check_in_secrets
        (batch_id, kids_session_id, code_hash, token_hash, expires_at)
      VALUES (_batch, _kids_session_id,
              church.hash_pickup(_code), church.hash_pickup(_token),
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
  -- Still the only moment the code can be sent: it is hashed with a Vault
  -- pepper on the way into kids_check_in_secrets and never stored. Never
  -- raises — a failed text must not roll back a completed check-in.
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

NOTIFY pgrst, 'reload schema';
