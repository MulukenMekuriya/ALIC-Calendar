-- =====================================================
-- A hold on the next check-in
-- =====================================================
--
-- A kids admin, looking at the late-collection queue, decides that a family
-- needs to keep their child with them next time. They give a reason, the
-- parent is told, and the next check-in is refused ONCE.
--
-- DISCRETIONARY, NEVER AUTOMATIC. There is no counter and no threshold. An
-- earlier design counted three strikes and raised a ban by itself; it was
-- dropped deliberately, because a counter decides on nobody's behalf and a
-- family has nobody to talk to about an arithmetic rule. This is a person
-- making a judgement and putting their name to it.
--
-- It is the first thing in this system that turns a child away, and keeping it
-- a human decision is what makes it defensible.

CREATE TABLE IF NOT EXISTS church.kids_check_in_holds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  child_person_id  UUID NOT NULL,

  reason           TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'manual',
  source_late_pickup_id UUID REFERENCES church.kids_late_pickups(id) ON DELETE SET NULL,

  raised_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_by_name   TEXT NOT NULL,
  raised_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,

  status           TEXT NOT NULL DEFAULT 'pending',

  serving_kids_session_id UUID REFERENCES church.kids_sessions(id) ON DELETE SET NULL,
  serving_session_date    DATE,
  serving_started_at      TIMESTAMPTZ,

  settled_at       TIMESTAMPTZ,
  lifted_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lifted_by_name   TEXT,
  lifted_reason    TEXT,

  parent_notified_at  TIMESTAMPTZ,
  leaders_notified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_kids_hold_child
    FOREIGN KEY (child_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE,

  CONSTRAINT chk_kids_hold_reason CHECK (length(btrim(reason)) >= 10),
  CONSTRAINT chk_kids_hold_source CHECK (source IN ('late_pickup', 'manual')),
  CONSTRAINT chk_kids_hold_status
    CHECK (status IN ('pending', 'serving', 'served', 'lifted', 'lapsed')),
  -- status and settled_at can never disagree about whether this is live.
  CONSTRAINT chk_kids_hold_settled
    CHECK ((settled_at IS NULL) = (status IN ('pending', 'serving'))),
  CONSTRAINT chk_kids_hold_serving
    CHECK (status <> 'serving'
           OR (serving_kids_session_id IS NOT NULL AND serving_session_date IS NOT NULL)),
  CONSTRAINT chk_kids_hold_lifted
    CHECK (status <> 'lifted'
           OR length(btrim(coalesce(lifted_reason, ''))) >= 5),
  CONSTRAINT chk_kids_hold_expires CHECK (expires_at > raised_at)
);

COMMENT ON TABLE church.kids_check_in_holds IS
  'A Kids Ministry admin has asked that this child stay with their parents for '
  'ONE service. Raised by hand, never by a counter. One live hold per child.';

COMMENT ON COLUMN church.kids_check_in_holds.expires_at IS
  'A hold raised in March that catches a family in August is a punishment '
  'nobody remembers deciding on. Sixty days, after which it lapses unserved. '
  'Enforcement tests this directly, so a lapsed hold stops biting even if the '
  'settling job never runs.';

COMMENT ON COLUMN church.kids_check_in_holds.serving_session_date IS
  'The Sunday that was sat out. The predicate is >= the session being checked '
  'into, so it covers the WHOLE DAY: a family refused at 9:00 and returning at '
  '11:00 has not yet sat one out.';

-- One live hold per child, so a second admin cannot stack a second Sunday
-- onto the same family.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kids_holds_one_live
  ON church.kids_check_in_holds (child_person_id) WHERE settled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kids_holds_live
  ON church.kids_check_in_holds (child_person_id) WHERE settled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_holds_org
  ON church.kids_check_in_holds (organization_id, raised_at DESC);

DROP TRIGGER IF EXISTS trg_kids_holds_updated_at ON church.kids_check_in_holds;
CREATE TRIGGER trg_kids_holds_updated_at
  BEFORE UPDATE ON church.kids_check_in_holds
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

ALTER TABLE church.kids_check_in_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids leaders can view check-in holds" ON church.kids_check_in_holds;
CREATE POLICY "Kids leaders can view check-in holds"
  ON church.kids_check_in_holds FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['kids_admin','kids_leader','leadership_viewer']::church.module_permission[])));

-- No write policy for anyone. kids_volunteer cannot read these at all: the
-- desk is told that check-in is not available and nothing about why, the same
-- posture kids_pickup_restrictions already takes.
GRANT SELECT ON church.kids_check_in_holds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.kids_check_in_holds TO service_role;

-- ---------------------------------------------------------------------------
-- Audit actions and the notification kinds
-- ---------------------------------------------------------------------------
ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS check_in_audit_action_check;
ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS chk_check_in_audit_action;
ALTER TABLE church.check_in_audit ADD CONSTRAINT chk_check_in_audit_action
  CHECK (action = ANY (ARRAY[
    'check_in', 'check_out', 'transfer', 'code_failed', 'override',
    'sensitive_viewed', 'restricted_pickup_attempt', 'restricted_pickup_override',
    'pin_failed', 'auto_expired', 'label_reprint', 'shift_opened', 'shift_closed',
    'visitor_registered',
    'late_pickup_recorded', 'late_pickup_notified', 'late_pickup_dismissed',
    -- new at 20260322200200
    'hold_raised', 'hold_lifted', 'hold_settled', 'check_in_held']));

ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind
  CHECK (kind IN (
    'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
    'kids_access_granted', 'kids_late_pickup',
    'kids_check_in_held',     -- the parent, when the hold is raised
    'kids_hold_presented'));  -- the leaders, when the family is at the desk now

-- ---------------------------------------------------------------------------
-- Is there a live hold that bites for THIS session?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_live_hold_for(
  _child_person_id UUID,
  _kids_session_id UUID
)
RETURNS church.kids_check_in_holds
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE h church.kids_check_in_holds%ROWTYPE; _sdate DATE;
BEGIN
  SELECT ks.session_date INTO _sdate
    FROM church.kids_sessions ks WHERE ks.id = _kids_session_id;

  SELECT * INTO h FROM church.kids_check_in_holds
   WHERE child_person_id = _child_person_id
     AND settled_at IS NULL
     -- Tested directly rather than trusting the settling job to have run.
     AND expires_at > now()
     -- Not yet served, or being served on this very day. The whole Sunday,
     -- not one service.
     AND (serving_session_date IS NULL OR serving_session_date >= _sdate)
   ORDER BY raised_at
   LIMIT 1;

  RETURN h;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_live_hold_for(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_live_hold_for(UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Raising one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_raise_check_in_hold(
  _child_person_id UUID,
  _reason TEXT,
  _source_late_pickup_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _org UUID; _actor TEXT; _id UUID; _child TEXT; _n INTEGER; _body TEXT; _ci UUID;
BEGIN
  SELECT p.organization_id, coalesce(p.preferred_name, p.first_name)
    INTO _org, _child
  FROM church.people p WHERE p.id = _child_person_id AND p.is_child;
  IF _org IS NULL THEN RAISE EXCEPTION 'child_not_found'; END IF;

  -- kids_admin ALONE. Turning a child away is a director's call, not a team
  -- lead's, and assert_kids_leader would admit leadership_viewer as well.
  IF NOT church.has_permission_in_org(
       _org, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Holding a child out of check-in is a Kids Ministry director action.';
  END IF;

  IF length(btrim(coalesce(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_required'
      USING HINT = 'The family will be told this, so it has to say something.';
  END IF;

  IF EXISTS (SELECT 1 FROM church.kids_check_in_holds
              WHERE child_person_id = _child_person_id AND settled_at IS NULL) THEN
    RAISE EXCEPTION 'hold_already_live'
      USING HINT = 'This child already has a hold waiting to be served.';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'A Kids Ministry leader');

  INSERT INTO church.kids_check_in_holds
    (organization_id, child_person_id, reason, source, source_late_pickup_id,
     raised_by, raised_by_name, expires_at)
  VALUES (_org, _child_person_id, btrim(_reason),
          CASE WHEN _source_late_pickup_id IS NULL THEN 'manual' ELSE 'late_pickup' END,
          _source_late_pickup_id, auth.uid(), _actor, now() + interval '60 days')
  RETURNING id INTO _id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (_org, 'hold_raised', 'success', _child_person_id, auth.uid(), _actor,
          jsonb_build_object('hold_id', _id, 'reason', btrim(_reason)));

  -- The family hears it NOW, not when they arrive at the desk to find out.
  _body :=
    'After Sunday, one of our Kids Ministry leaders has asked that '
    || coalesce(_child, 'your child')
    || ' stay with you in the service next time rather than going to a '
    || 'classroom.' || E'\n\n' || btrim(_reason) || E'\n\n'
    || 'It is one service, not a season. Once that service has passed, '
    || 'check-in opens again as normal.' || E'\n\n'
    || 'None of this is about a child being unwelcome. Our classrooms are run '
    || 'by volunteers, and keeping them calm and safe for every child in the '
    || 'room, including yours, is the whole of why we do it this way.' || E'\n\n'
    || 'Please come and find one of the Kids Ministry team before or after the '
    || 'service. We would much rather talk with you than send an email.';

  -- queue_child_notification is built around a check_in_id, so reuse the most
  -- recent one for this child to resolve the household. Without one there is
  -- nobody on file to write to and the hold still stands.
  SELECT ci.id INTO _ci FROM church.kids_check_ins ci
   WHERE ci.child_person_id = _child_person_id
   ORDER BY ci.checked_in_at DESC LIMIT 1;

  IF _ci IS NOT NULL THEN
    SELECT church.queue_child_notification(
             'kids_check_in_held', _ci, _body,
             'About ' || coalesce(_child, 'your child') || '''s next check-in',
             'email', NULL, _actor)
      INTO _n;
    IF coalesce(_n, 0) > 0 THEN
      UPDATE church.kids_check_in_holds SET parent_notified_at = now() WHERE id = _id;
    END IF;
  END IF;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_raise_check_in_hold(UUID, TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lifting one
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_lift_check_in_hold(
  _hold_id UUID, _reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE h church.kids_check_in_holds%ROWTYPE; _actor TEXT;
BEGIN
  SELECT * INTO h FROM church.kids_check_in_holds WHERE id = _hold_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'hold_not_found'; END IF;

  IF NOT church.has_permission_in_org(
       h.organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
  IF h.settled_at IS NOT NULL THEN RAISE EXCEPTION 'hold_already_settled'; END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'A Kids Ministry leader');

  UPDATE church.kids_check_in_holds
     SET status = 'lifted', settled_at = now(), lifted_by = auth.uid(),
         lifted_by_name = _actor, lifted_reason = btrim(_reason)
   WHERE id = _hold_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (h.organization_id, 'hold_lifted', 'success', h.child_person_id,
          auth.uid(), _actor,
          jsonb_build_object('hold_id', _hold_id, 'reason', btrim(_reason)));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_lift_check_in_hold(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Serving one: the moment the family is refused at the desk
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_serve_hold(
  _hold_id UUID, _kids_session_id UUID, _actor_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE h church.kids_check_in_holds%ROWTYPE; _sdate DATE; _first BOOLEAN; _child TEXT;
BEGIN
  SELECT ks.session_date INTO _sdate
    FROM church.kids_sessions ks WHERE ks.id = _kids_session_id;

  -- The pending -> serving transition, guarded so it happens ONCE. A family
  -- presenting the same child three times in a morning produces three audit
  -- rows and one email.
  UPDATE church.kids_check_in_holds
     SET status = 'serving', serving_kids_session_id = _kids_session_id,
         serving_session_date = _sdate, serving_started_at = now()
   WHERE id = _hold_id AND status = 'pending'
  RETURNING true INTO _first;

  SELECT * INTO h FROM church.kids_check_in_holds WHERE id = _hold_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, kids_session_id, child_person_id,
     actor_name, detail)
  VALUES (h.organization_id, 'check_in_held', 'denied', _kids_session_id,
          h.child_person_id, coalesce(_actor_name, 'the desk'),
          jsonb_build_object('hold_id', _hold_id, 'first_presentation',
                             coalesce(_first, false)));

  IF coalesce(_first, false) THEN
    SELECT coalesce(p.preferred_name, p.first_name) INTO _child
      FROM church.people p WHERE p.id = h.child_person_id;

    -- The leaders are told immediately, because a family is standing at the
    -- desk right now and the volunteer running it has not been told why.
    INSERT INTO church.notification_log
      (organization_id, kind, channel, recipient_name,
       recipient_email, child_person_id, kids_session_id, subject, body)
    SELECT h.organization_id, 'kids_hold_presented', 'email',
           t.full_name, t.email, h.child_person_id,
           _kids_session_id,
           coalesce(_child, 'A child') || ' could not be checked in - the family is at the desk',
           coalesce(_child, 'A child') || ' was presented at the Kids Ministry '
           || 'check-in desk and could not be checked in.' || E'\n\n'
           || 'A hold was raised for this child on '
           || to_char(h.raised_at, 'FMDay FMDD FMMonth') || ' by '
           || h.raised_by_name || ', and the family was told at the time. They '
           || 'are at the desk now, and the volunteer running it has not been '
           || 'told why - the desk is only shown that check-in is not '
           || 'available.' || E'\n\n'
           || 'Reason given when it was raised:' || E'\n' || h.reason || E'\n\n'
           || 'Please go to the check-in desk. Somebody should speak with this '
           || 'family this morning rather than leaving them with a screen that '
           || 'says no.' || E'\n\n'
           || 'This hold now counts as served for today, so check-in will work '
           || 'normally at the next service.'
    FROM church.kids_leaders_to_notify(h.organization_id) t
    WHERE t.email IS NOT NULL;

    UPDATE church.kids_check_in_holds SET leaders_notified_at = now() WHERE id = _hold_id;
  END IF;

  RETURN coalesce(_first, false);
END;
$$;

REVOKE ALL ON FUNCTION church.kids_serve_hold(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_serve_hold(UUID, UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Settling: served once the day has passed, lapsed once it expires
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_settle_holds()
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _n INTEGER := 0; _m INTEGER := 0;
BEGIN
  WITH done AS (
    UPDATE church.kids_check_in_holds
       SET status = 'served', settled_at = now()
     WHERE status = 'serving'
       AND serving_session_date < (now() AT TIME ZONE 'America/New_York')::DATE
    RETURNING id, organization_id, child_person_id
  ), audited AS (
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, child_person_id, actor_name, detail)
    SELECT organization_id, 'hold_settled', 'success', child_person_id, 'system',
           jsonb_build_object('hold_id', id, 'outcome', 'served')
    FROM done RETURNING 1
  )
  SELECT count(*)::INTEGER INTO _n FROM done;

  WITH gone AS (
    UPDATE church.kids_check_in_holds
       SET status = 'lapsed', settled_at = now()
     WHERE settled_at IS NULL AND expires_at <= now()
    RETURNING id, organization_id, child_person_id
  ), audited2 AS (
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, child_person_id, actor_name, detail)
    SELECT organization_id, 'hold_settled', 'success', child_person_id, 'system',
           jsonb_build_object('hold_id', id, 'outcome', 'lapsed')
    FROM gone RETURNING 1
  )
  SELECT count(*)::INTEGER INTO _m FROM gone;

  RETURN _n + _m;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_settle_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_settle_holds() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- The desk lets the siblings through
-- ---------------------------------------------------------------------------
--
-- Signature change, so DROP then CREATE - precedent at 20260321000200:65,
-- on this exact function.
DROP FUNCTION IF EXISTS church.check_in_children(UUID, UUID[], UUID[], TEXT, TEXT, UUID, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION church.check_in_children(_kids_session_id uuid, _child_person_ids uuid[], _room_ids uuid[] DEFAULT NULL::uuid[], _shift_token text DEFAULT NULL::text, _client_batch_key text DEFAULT NULL::text, _dropped_off_by_person_id uuid DEFAULT NULL::uuid, _override_capacity boolean DEFAULT false, _assignment_reason text DEFAULT NULL::text)
 RETURNS TABLE(batch_id uuid, pickup_code text, pickup_token text, check_in_id uuid, child_person_id uuid, child_name text, room_id uuid, room_name text, tag_number integer, allergy_label text, has_restriction boolean, guardian_phone text, refused boolean, refusal_code text, refusal_message text)
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
  _refused UUID[] := ARRAY[]::UUID[];
  _hold church.kids_check_in_holds%ROWTYPE;
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

      RETURN QUERY
      SELECT _existing.id, _code, _token, ci.id, ci.child_person_id,
             ci.label_child_name, ci.room_id, ci.label_room_name, ci.tag_number,
             ci.label_allergy_short, ci.has_pickup_restriction,
             church.household_contact_phone(ci.household_id)
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
  FOR _i IN 1.._n LOOP
    _hold := church.kids_live_hold_for(_child_person_ids[_i], _kids_session_id);
    IF _hold.id IS NOT NULL THEN
      _refused := _refused || _child_person_ids[_i];
      PERFORM church.kids_serve_hold(_hold.id, _kids_session_id, a.actor_name);
    END IF;
  END LOOP;

  IF array_length(_refused, 1) = _n THEN
    -- Everyone was held. Nothing is written at all.
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::UUID, p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
           NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, false, NULL::TEXT,
           true, 'check_in_held',
           coalesce(p.preferred_name, p.first_name)
             || ' stays with you for this service. Please speak with a Kids '
             || 'Ministry leader.'
    FROM church.people p WHERE p.id = ANY(_refused);
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
    CONTINUE WHEN _child = ANY(_refused);
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
         false, NULL::TEXT, NULL::TEXT
  FROM church.kids_check_ins ci
  WHERE ci.batch_id = _batch

  UNION ALL

  SELECT _batch, NULL::TEXT, NULL::TEXT, NULL::UUID, p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, false, NULL::TEXT,
         true, 'check_in_held',
         coalesce(p.preferred_name, p.first_name)
           || ' stays with you for this service. Please speak with a Kids '
           || 'Ministry leader.'
  FROM church.people p WHERE p.id = ANY(_refused)

  ORDER BY 13, 9;
END;
$function$
;

GRANT EXECUTE ON FUNCTION church.check_in_children(UUID, UUID[], UUID[], TEXT, TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
