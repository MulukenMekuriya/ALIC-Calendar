-- =====================================================
-- A kiosk a parent can use alone
-- =====================================================
--
-- The lobby tablet. One shared account across every device, operated by
-- parents with no volunteer standing over them.
--
-- ---------------------------------------------------------------------------
-- WHY THE KIOSK GETS NO MODULE GRANT
-- ---------------------------------------------------------------------------
--
-- This is the decision the whole design turns on, and it was checked against
-- the live policies rather than assumed.
--
-- public.profiles carries a PERMISSIVE select policy - "Users can view
-- profiles in their organizations" - narrowed by a RESTRICTIVE one:
--
--   (id = auth.uid()) OR has_internal_access_anywhere()
--
-- has_internal_access() is is_staff() OR any module_grant. So the moment the
-- kiosk account holds ANY grant - including a brand-new kids_kiosk - the
-- restriction lifts, the permissive policy takes over, and AN UNATTENDED
-- DEVICE IN THE LOBBY CAN READ THE NAME AND EMAIL OF EVERY USER IN THE
-- BRANCH through PostgREST using its shared session. The same lift applies to
-- budget.ministries.
--
-- So the kiosk is identified by raw_app_meta_data.account_type = 'kiosk',
-- which public.handle_new_user() has used since 20260320000000 and which is
-- set server-side and cannot be forged by a client. That leaves
-- has_internal_access() FALSE, so the profiles and ministries restrictions
-- keep holding, and church.people's SELECT policy - which requires
-- members_admin|members_viewer|members_import|leadership_viewer - excludes it
-- too.
--
-- THE KIOSK THEREFORE READS NOTHING DIRECTLY. Every byte it sees comes
-- through one of the three SECURITY DEFINER functions below, each of which
-- returns the narrowest thing that screen needs. That is an invariant, not a
-- habit: if a future screen needs more, it gets another function, not a
-- grant.
--
-- ---------------------------------------------------------------------------
-- AND NO CHECK-OUT, AS A SERVER RULE
-- ---------------------------------------------------------------------------
--
-- can_check_out = false in resolve_actor, so church.check_out_children and
-- church.station_pickup_candidates refuse a kiosk outright. Handing a child
-- to an adult is not something an unattended tablet does, and "the button is
-- not on the screen" is not the same claim as "the database will not do it".

-- ---------------------------------------------------------------------------
-- Is this session a kiosk?
-- ---------------------------------------------------------------------------
--
-- app_metadata, never user_metadata: a client can write its own
-- user_metadata, so an ordinary member could otherwise promote themselves to
-- a kiosk. app_metadata is service-role only.
CREATE OR REPLACE FUNCTION church.is_kiosk_session()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = church, public
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'account_type', '') = 'kiosk'
$$;

COMMENT ON FUNCTION church.is_kiosk_session() IS
  'True when the caller is a lobby kiosk. Reads app_metadata, which only the '
  'service role can write - user_metadata is client-writable and would let a '
  'member promote themselves.';

GRANT EXECUTE ON FUNCTION church.is_kiosk_session() TO authenticated;

-- ---------------------------------------------------------------------------
-- The devices
-- ---------------------------------------------------------------------------
--
-- church.check_in_stations has existed since the schema was created and has
-- never had a row. One shared credential across every tablet means no
-- per-device attribution and no way to revoke a lost device without re-keying
-- all of them; registering each one buys both.
--
-- This is REGISTRATION, NOT AUTHENTICATION. The shared account is still the
-- credential. What it adds is that a lost or stolen tablet is handled by
-- is_active = false on that one station - every kiosk function below refuses
-- it - rather than by changing a password written on a card in the kids
-- office.
-- ONE ACCOUNT, MANY TABLETS. check_in_stations carried
-- UNIQUE (auth_user_id) from the original schema, which allowed exactly one
-- station per login - a per-device-account model. The ministry's is the
-- opposite: one shared credential typed into every tablet in the lobby, with
-- each device registering itself so audit can name it. The constraint has to
-- go, and dropping it removes a restriction rather than adding one. Zero rows
-- exist, so nothing is disturbed.
ALTER TABLE church.check_in_stations
  DROP CONSTRAINT IF EXISTS uq_check_in_stations_auth_user;

CREATE INDEX IF NOT EXISTS idx_check_in_stations_auth_user
  ON church.check_in_stations (auth_user_id);

CREATE OR REPLACE FUNCTION church.kiosk_register_station(
  _code          TEXT,
  _name          TEXT,
  _device_type   TEXT DEFAULT 'tablet',
  _location_note TEXT DEFAULT NULL
)
RETURNS TABLE (station_id UUID, station_name TEXT)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _org UUID; _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- A kiosk registers itself on first setup; a kids admin can also register
  -- one on a device's behalf, which is how a tablet gets named properly.
  SELECT uo.organization_id INTO _org FROM public.user_organizations uo
   WHERE uo.user_id = auth.uid() LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'no_organization'; END IF;

  IF NOT (church.is_kiosk_session()
          OR church.has_permission_in_org(
               _org, ARRAY['kids_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(_code, ''))) < 3 THEN
    RAISE EXCEPTION 'station_code_required';
  END IF;

  INSERT INTO church.check_in_stations (
    organization_id, code, name, device_type, auth_user_id, location_note,
    is_active, last_seen_at)
  VALUES (_org, btrim(_code), coalesce(nullif(btrim(_name), ''), btrim(_code)),
          _device_type, auth.uid(), _location_note, true, now())
  ON CONFLICT (organization_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    device_type = EXCLUDED.device_type,
    location_note = coalesce(EXCLUDED.location_note, church.check_in_stations.location_note),
    last_seen_at = now(),
    -- Deliberately does NOT reactivate. A tablet revoked because it was lost
    -- must not let itself back in by registering again - that is the one
    -- thing revocation has to survive.
    updated_at = now()
  RETURNING id, name INTO _id, _name;

  RETURN QUERY SELECT _id, _name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kiosk_register_station(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- The station a kiosk claims to be, validated. Returns NULL rather than
-- raising when it is unknown or revoked, so callers can decide whether that
-- is fatal.
CREATE OR REPLACE FUNCTION church.kiosk_active_station(_station_id UUID, _org UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT s.id FROM church.check_in_stations s
   WHERE s.id = _station_id AND s.organization_id = _org AND s.is_active
$$;

GRANT EXECUTE ON FUNCTION church.kiosk_active_station(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- resolve_actor learns about kiosks
-- ---------------------------------------------------------------------------
--
-- The branch sits BEFORE the module-grant check. A kiosk holds no grant at
-- all, so without this it falls straight into not_permitted and can do
-- nothing - which is the correct failure, just not a useful one.
--
-- Everything else in this function is unchanged, character for character,
-- and was taken from the live definition rather than retyped.
CREATE OR REPLACE FUNCTION church.resolve_actor(_shift_token TEXT DEFAULT NULL)
RETURNS church.resolved_actor
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $function$
DECLARE
  a church.resolved_actor;
  st church.kids_shift_tokens%ROWTYPE;
  v  church.kids_volunteers%ROWTYPE;
  p  church.people%ROWTYPE;
  _admin_orgs UUID[];
  _volunteer_orgs UUID[];
BEGIN
  -- Shift-token path retained so the shared-device model still works if ALIC
  -- turns it back on. Unused by the current UI.
  IF _shift_token IS NOT NULL AND length(_shift_token) > 0 THEN
    SELECT * INTO st FROM church.kids_shift_tokens
    WHERE token_hash = digest(_shift_token, 'sha256')
      AND ended_at IS NULL AND expires_at > now();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid_or_expired_shift' USING ERRCODE = '28000';
    END IF;
    IF st.issued_to_auth_user IS NOT NULL
       AND st.issued_to_auth_user IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'invalid_or_expired_shift' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v FROM church.kids_volunteers WHERE id = st.volunteer_id;
    IF NOT FOUND OR NOT v.is_active OR v.may_not_serve_with_children THEN
      RAISE EXCEPTION 'volunteer_not_eligible' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO p FROM church.people WHERE id = v.person_id;

    a.organization_id := st.organization_id;
    a.person_id       := v.person_id;
    a.volunteer_id    := v.id;
    a.station_id      := st.station_id;
    a.actor_name      := coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name;
    a.source          := 'station';
    a.can_check_in    := true;
    a.can_check_out   := true;
    a.can_override    := v.can_override;
    RETURN a;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- THE KIOSK BRANCH. Before the grant check, because a kiosk holds none.
  --
  -- can_check_out = false is the point of it. Handing a child to an adult is
  -- not something an unattended tablet does, and this is what makes that a
  -- database rule rather than a missing button.
  IF church.is_kiosk_session() THEN
    SELECT uo.organization_id INTO a.organization_id
      FROM public.user_organizations uo WHERE uo.user_id = auth.uid() LIMIT 1;
    IF a.organization_id IS NULL THEN
      RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
    END IF;

    a.person_id     := NULL;
    a.volunteer_id  := NULL;
    a.station_id    := NULL;
    a.actor_name    := 'Check-in kiosk';
    a.source        := 'kiosk';
    a.can_check_in  := true;
    a.can_check_out := false;
    a.can_override  := false;
    RETURN a;
  END IF;

  SELECT array_agg(o) INTO _admin_orgs
  FROM church.my_orgs_with_any(ARRAY['kids_admin']::church.module_permission[]) AS o;

  SELECT array_agg(o) INTO _volunteer_orgs
  FROM church.my_orgs_with_any(
    ARRAY['kids_admin','kids_leader',
          'kids_volunteer']::church.module_permission[]) AS o;

  IF _volunteer_orgs IS NULL OR array_length(_volunteer_orgs, 1) IS NULL THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  a.organization_id := _volunteer_orgs[1];
  -- Attribution comes from the signed-in user's own member record.
  a.person_id := (SELECT id FROM church.people
                   WHERE profile_id = auth.uid()
                     AND organization_id = a.organization_id LIMIT 1);

  -- KID-024, previously enforced only on the shift-token path. The signed-in
  -- branch resolved a volunteer row with no predicate and then granted every
  -- capability, so a volunteer marked `restricted` and de-activated could
  -- still check children in and out and open safety cards. Scoped to the
  -- organization too: the old lookup matched on person_id alone.
  SELECT * INTO v FROM church.kids_volunteers vv
   WHERE vv.person_id = a.person_id
     AND vv.organization_id = a.organization_id
   LIMIT 1;

  -- `restricted` is the only status that bars a person from the desk, and it
  -- bars them absolutely. `is_active = false` means "not on the roster this
  -- term", which is a scheduling fact, not a safeguarding one — treating it as
  -- a bar locked the ministry lead out of their own module the moment their
  -- volunteer row went stale, and resolve_actor is the first statement of
  -- every kids RPC, so that is a total lockout.
  IF FOUND AND v.may_not_serve_with_children THEN
    RAISE EXCEPTION 'volunteer_not_eligible' USING ERRCODE = '42501';
  END IF;

  -- Attributed to the volunteer record only while it is current. An inactive
  -- row still identifies the person, but the action is recorded against their
  -- name rather than a roster entry that says they were not serving.
  IF FOUND AND v.is_active THEN
    a.volunteer_id := v.id;
  END IF;

  a.station_id    := NULL;
  a.actor_name    := coalesce(
    (SELECT coalesce(pp.preferred_name, pp.first_name) || ' ' || pp.last_name
       FROM church.people pp WHERE pp.id = a.person_id),
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    'Kids Ministry');
  a.source        := 'session';
  a.can_check_in  := true;
  a.can_check_out := true;
  a.can_override  := a.organization_id = ANY(coalesce(_admin_orgs, '{}'));
  RETURN a;
END;
$function$;

GRANT EXECUTE ON FUNCTION church.resolve_actor(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- The kiosk's only three doors
-- ---------------------------------------------------------------------------

-- 1. What is running this morning.
--
-- kidsSessionService.currentForDesk is a plain PostgREST read of
-- church.kids_sessions, and every kids table's SELECT policy is "Kids team
-- can view...". A grant-less kiosk gets ZERO ROWS from it and would sit on
-- the unconfigured screen forever. This is the bootstrap, and it exists so
-- that "the kiosk reads nothing directly" stays an invariant rather than
-- becoming four kiosk exceptions sprinkled across table policies.
CREATE OR REPLACE FUNCTION church.kiosk_session_bootstrap(_station_id UUID DEFAULT NULL)
RETURNS TABLE (
  kids_session_id UUID,
  session_label   TEXT,
  session_date    DATE,
  status          TEXT,
  station_name    TEXT,
  station_known   BOOLEAN,
  open_room_count INTEGER
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE a church.resolved_actor; _st UUID;
BEGIN
  a := church.resolve_actor(NULL);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _st := church.kiosk_active_station(_station_id, a.organization_id);

  -- Heartbeat, so the office has a "which kiosks are alive this morning" view
  -- at 8:55 on a Sunday, which is the thing somebody actually wants.
  IF _st IS NOT NULL THEN
    UPDATE church.check_in_stations SET last_seen_at = now() WHERE id = _st;
  END IF;

  RETURN QUERY
  SELECT ks.id, ks.service_label, ks.session_date, ks.status,
         (SELECT s.name FROM church.check_in_stations s WHERE s.id = _st),
         (_station_id IS NULL OR _st IS NOT NULL),
         (SELECT count(*)::INTEGER FROM church.kids_session_rooms ksr
           WHERE ksr.kids_session_id = ks.id AND ksr.is_open)
  FROM church.kids_sessions ks
  WHERE ks.organization_id = a.organization_id
    AND ks.session_date = current_date
  ORDER BY (ks.status = 'open') DESC, ks.starts_at
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kiosk_session_bootstrap(UUID) TO authenticated;

-- 2. Find my children.
--
-- THE CHILD-SAFETY CHANGE. The staffed desk searches on every keystroke at
-- three characters across name AND phone. On an unattended lobby device that
-- is a browsable directory of the congregation's children.
--
-- So: EXACTLY TEN DIGITS after normalisation, or nothing. No partial match,
-- no prefix match, NO NAME SEARCH AT ALL. A parent knows their own number; a
-- stranger holding the tablet has nothing to go on.
--
-- On screen: the child's name and photo, because it is the parent's own
-- household and a photo is how they confirm at a glance. NOT on screen:
-- allergies, medical notes, special needs, guardian phone. Allergy
-- information still prints on the label, where the classroom needs it - the
-- lobby does not.
CREATE OR REPLACE FUNCTION church.kiosk_find_household_by_phone(
  _kids_session_id UUID,
  _phone           TEXT,
  _station_id      UUID DEFAULT NULL
)
RETURNS TABLE (
  household_id     UUID,
  household_name   TEXT,
  child_person_id  UUID,
  child_name       TEXT,
  photo_path       TEXT,
  grade_name       TEXT,
  already_checked_in BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a church.resolved_actor;
  _digits TEXT;
  _misses INTEGER;
  _found  BOOLEAN := false;
  _st UUID;
BEGIN
  a := church.resolve_actor(NULL);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _st := church.kiosk_active_station(_station_id, a.organization_id);

  -- A revoked tablet finds nobody. This is what makes is_active = false a
  -- real revocation rather than a label: without a family it cannot check
  -- anybody in, whatever else it still has.
  IF _station_id IS NOT NULL AND _st IS NULL THEN
    RAISE EXCEPTION 'station_not_active'
      USING HINT = 'This device is no longer registered. Please see a Kids '
                   'Ministry leader.';
  END IF;

  -- Last ten digits, so +1, dashes, brackets and spaces all work.
  _digits := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10);

  IF length(_digits) <> 10 THEN
    RAISE EXCEPTION 'phone_must_be_ten_digits'
      USING HINT = 'Please enter the full mobile number.';
  END IF;

  -- Rate limit. A device cannot be used to sweep the number space: sixty
  -- seconds of misses is a parent mistyping, twenty is somebody trying
  -- numbers.
  SELECT count(*) INTO _misses
  FROM church.check_in_audit au
  WHERE au.organization_id = a.organization_id
    AND au.action = 'kiosk_search_miss'
    AND au.created_at > now() - interval '10 minutes'
    AND (_st IS NULL OR au.station_id = _st);

  IF _misses >= 20 THEN
    RAISE EXCEPTION 'too_many_attempts'
      USING HINT = 'Please see a Kids Ministry volunteer, who can check you in.';
  END IF;

  RETURN QUERY
  SELECT h.id, h.name, p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         p.photo_path,
         g.display_name,
         EXISTS (SELECT 1 FROM church.kids_check_ins ci
                  WHERE ci.child_person_id = p.id
                    AND ci.kids_session_id = _kids_session_id
                    AND ci.status = 'checked_in')
  FROM church.people adult
  JOIN church.household_members hm_adult
    ON hm_adult.person_id = adult.id AND hm_adult.end_date IS NULL
  JOIN church.households h ON h.id = hm_adult.household_id
  JOIN church.household_members hm_child
    ON hm_child.household_id = h.id AND hm_child.end_date IS NULL
  JOIN church.people p ON p.id = hm_child.person_id
  LEFT JOIN church.school_grades g ON g.id = p.school_grade_id
  WHERE adult.organization_id = a.organization_id
    AND adult.phone_digits IS NOT NULL
    AND right(adult.phone_digits, 10) = _digits
    AND NOT adult.is_child
    AND adult.is_active
    AND p.is_child AND p.is_active AND p.merged_into_person_id IS NULL
  ORDER BY 4;

  GET DIAGNOSTICS _misses = ROW_COUNT;
  _found := _misses > 0;

  -- Misses are recorded; hits are not. A hit is an ordinary parent finding
  -- their own children, and logging every one of those would bury the misses
  -- that actually mean something.
  IF NOT _found THEN
    INSERT INTO church.check_in_audit (
      organization_id, action, outcome, station_id, actor_name, detail)
    VALUES (a.organization_id, 'kiosk_search_miss', 'denied', _st, a.actor_name,
            -- The LAST FOUR only. Storing a full number that matched nobody
            -- would build exactly the directory this function refuses to be.
            jsonb_build_object('last4', right(_digits, 4)));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kiosk_find_household_by_phone(UUID, TEXT, UUID) TO authenticated;

ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS check_in_audit_action_check;
ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS chk_check_in_audit_action;
ALTER TABLE church.check_in_audit ADD CONSTRAINT chk_check_in_audit_action
  CHECK (action = ANY (ARRAY[
    'check_in', 'check_out', 'transfer', 'code_failed', 'override',
    'sensitive_viewed', 'restricted_pickup_attempt', 'restricted_pickup_override',
    'pin_failed', 'auto_expired', 'label_reprint', 'shift_opened', 'shift_closed',
    'visitor_registered',
    'late_pickup_recorded', 'late_pickup_notified', 'late_pickup_dismissed',
    'hold_raised', 'hold_lifted', 'hold_settled', 'check_in_held',
    'incident_raised', 'incident_noted', 'incident_severity_changed',
    'incident_reviewed', 'incident_signed_off', 'incident_declined',
    'incident_external_report', 'incident_sent',
    'consent_signed', 'consent_revoked', 'consent_child_withdrawn',
    'consent_reviewed', 'medical_updated', 'consent_exception',
    -- new at 20260322230000
    'kiosk_search_miss']));

-- 3. Which kiosks are alive, for the office.
CREATE OR REPLACE FUNCTION church.kids_stations(_organization_id UUID)
RETURNS TABLE (
  station_id    UUID,
  code          TEXT,
  name          TEXT,
  device_type   TEXT,
  location_note TEXT,
  is_active     BOOLEAN,
  last_seen_at  TIMESTAMPTZ,
  seen_today    BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id,
           ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.code, s.name, s.device_type, s.location_note, s.is_active,
         s.last_seen_at,
         (s.last_seen_at IS NOT NULL AND s.last_seen_at::DATE = current_date)
  FROM church.check_in_stations s
  WHERE s.organization_id = _organization_id
  ORDER BY s.is_active DESC, s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_stations(UUID) TO authenticated;

-- Revoking a lost tablet. One row, and every kiosk function above refuses it
-- from the next call.
CREATE OR REPLACE FUNCTION church.kids_set_station_active(
  _station_id UUID,
  _is_active  BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _org UUID;
BEGIN
  SELECT organization_id INTO _org FROM church.check_in_stations WHERE id = _station_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'station_not_found'; END IF;

  IF NOT church.has_permission_in_org(
           _org, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  UPDATE church.check_in_stations
     SET is_active = _is_active, updated_at = now()
   WHERE id = _station_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_set_station_active(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
