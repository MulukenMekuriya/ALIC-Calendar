-- =====================================================
-- Serving God is not a background check
-- =====================================================
--
-- ALIC does not run background checks. Everyone serving in the Children's
-- Ministry is a member of the church, and the ministry does not screen its own
-- congregation before letting them teach. The concept was carried in from a
-- generic children's-ministry model and has never matched how this church
-- works.
--
-- The data says the same thing louder. church.kids_volunteers has ZERO rows,
-- while 34 people hold a kids_volunteer grant and 4 are assigned to
-- classrooms. Every read of background_check_status therefore coalesced to
-- 'not_started' and every is_eligible computed to false, so:
--
--   * ClassroomsTab printed "Background check not current for ..." under EVERY
--     classroom that had a teacher — 100% of them,
--   * VolunteersTab showed "Background check: not started" against every name.
--
-- A warning that fires on every row is not a warning, it is furniture. People
-- stop reading it, and it crowds out the screens it sits on.
--
-- WHAT IS KEPT, AND WHY. background_check_status = 'restricted' was doing two
-- unrelated jobs: "their check came back bad" and "this person must not serve
-- with children". The second is a safeguarding decision a church makes about
-- an individual and has nothing to do with background checks, so it survives
-- as its own boolean. With no volunteer rows it is false everywhere and shows
-- nowhere, but the door it guards stays shut.
--
-- WHAT IS NOT TOUCHED. church.kids_pickup_restrictions is a different thing
-- entirely — who may collect a child — and check_out_children's
-- _names_restricted logic is about that, not about volunteers. It is left
-- exactly as it is.
--
-- The old columns are left in place, unread, rather than dropped. Nine
-- functions referenced them; this migration rewrites all nine, and leaving the
-- columns means a missed reference fails a test rather than a Sunday morning.
-- A follow-up can drop them once this has run a few weeks.

-- ---------------------------------------------------------------------------
-- The one thing worth keeping, as its own fact
-- ---------------------------------------------------------------------------
ALTER TABLE church.kids_volunteers
  ADD COLUMN IF NOT EXISTS may_not_serve_with_children BOOLEAN NOT NULL DEFAULT false;

UPDATE church.kids_volunteers
   SET may_not_serve_with_children = true
 WHERE background_check_status = 'restricted'
   AND NOT may_not_serve_with_children;

COMMENT ON COLUMN church.kids_volunteers.may_not_serve_with_children IS
  'A safeguarding decision the church has made about this person: they are not '
  'to be placed with children by any route. Enforced in resolve_actor, '
  'assign_session_staff and assign_classroom_teacher. This is NOT a background '
  'check result - ALIC does not run background checks - and it is not about '
  'who may collect a child, which is church.kids_pickup_restrictions.';

COMMENT ON COLUMN church.kids_volunteers.background_check_status IS
  'VESTIGIAL. ALIC does not run background checks; nothing reads this as of '
  '20260322190400. The safeguarding meaning moved to '
  'may_not_serve_with_children. Safe to drop once that has held.';

COMMENT ON COLUMN church.kids_session_staffing.was_background_check_current IS
  'VESTIGIAL. No longer written as of 20260322190400. Safe to drop.';



-- ---------------------------------------------------------------------------
-- The volunteer list is a list of people, not of clearances
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS church.kids_eligible_volunteers(UUID);

CREATE FUNCTION church.kids_eligible_volunteers(_organization_id UUID)
RETURNS TABLE (
  person_id UUID,
  volunteer_id UUID,
  display_name TEXT,
  phone TEXT,
  is_active BOOLEAN,
  can_override BOOLEAN,
  may_not_serve_with_children BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.assert_kids_leader(_organization_id);

  -- Still every adult member, not only those with a volunteer row: an inner
  -- join would hide exactly the person the leader is trying to add. The UI
  -- now shows the kids team first and puts everyone else behind a button.
  RETURN QUERY
  SELECT
    p.id,
    v.id,
    coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
    p.phone,
    coalesce(v.is_active, false),
    coalesce(v.can_override, false),
    coalesce(v.may_not_serve_with_children, false)
  FROM church.people p
  LEFT JOIN church.kids_volunteers v ON v.person_id = p.id
  WHERE p.organization_id = _organization_id
    AND NOT p.is_child
    AND p.is_active
    AND p.merged_into_person_id IS NULL
  ORDER BY coalesce(v.is_active, false) DESC, p.last_name, p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_eligible_volunteers(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- A classroom roster names its teachers and says nothing about clearances
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS church.kids_classroom_teacher_list(UUID);

CREATE FUNCTION church.kids_classroom_teacher_list(_organization_id UUID)
RETURNS TABLE (
  id UUID, room_id UUID, room_name TEXT, person_id UUID,
  display_name TEXT, phone TEXT, role TEXT, is_lead BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.assert_kids_leader(_organization_id);

  RETURN QUERY
  SELECT
    t.id,
    t.room_id,
    coalesce(rk.label_room_name, r.name),
    p.id,
    coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
    p.phone,
    t.role,
    t.is_lead
  FROM church.kids_classroom_teachers t
  JOIN church.people p ON p.id = t.person_id
  JOIN public.rooms r ON r.id = t.room_id
  LEFT JOIN church.room_kids_config rk ON rk.room_id = t.room_id
    -- Scope. kids_leader_room_ids returns every classroom when the viewer is
    -- unscoped, so a director is unaffected; a team lead sees only their own
    -- grades.
  WHERE t.organization_id = _organization_id
    AND t.room_id IN (SELECT church.kids_leader_room_ids(_organization_id))
    AND t.effective_to IS NULL
  ORDER BY rk.sort_order NULLS LAST, r.name, t.is_lead DESC, p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_classroom_teacher_list(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- The dormant station list, kept coherent
-- ---------------------------------------------------------------------------
-- Part of the shift-token/PIN model the UI does not use. Narrowed rather than
-- left returning a clearance that no longer exists.
DROP FUNCTION IF EXISTS church.station_list_volunteers(UUID);

CREATE FUNCTION church.station_list_volunteers(_station_id UUID)
RETURNS TABLE (volunteer_id UUID, display_name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE s church.check_in_stations%ROWTYPE;
BEGIN
  SELECT * INTO s FROM church.check_in_stations WHERE id = _station_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'station_not_found';
  END IF;

  -- The caller must belong to the station's own organization AND hold a kids
  -- permission there. Knowing a station UUID is not authorization.
  IF NOT church.has_permission_in_org(
       s.organization_id,
       ARRAY['kids_admin','kids_volunteer']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || left(p.last_name, 1) || '.'
  FROM church.kids_volunteers v
  JOIN church.people p ON p.id = v.person_id
  WHERE v.organization_id = s.organization_id
    AND v.is_active
    AND NOT v.may_not_serve_with_children
  ORDER BY p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.station_list_volunteers(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- The desk bars a person the church has barred, and nobody else
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.resolve_actor(_shift_token text DEFAULT NULL::text)
 RETURNS church.resolved_actor
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
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

  a.station_id := NULL;
  a.actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Volunteer');
  a.source := 'user';
  a.can_check_in  := true;
  a.can_check_out := true;
  -- Only a kids_admin may authorise a checkout override — a DIRECTOR, not a
  -- team lead. _admin_orgs is deliberately kids_admin alone and does not
  -- include kids_leader.
  --
  -- This is the whole reason kids_leader exists. Team leads were made
  -- kids_admin and narrowed with kids_leader_scope, but this line never
  -- consulted the scope table, so a lead scoped to two classrooms could
  -- authorise the release of any child in the branch — including one she could
  -- not see on her own board. An override that four of six leaders can
  -- self-authorise is not the two-person rule the plan asked for.
  a.can_override := (_admin_orgs IS NOT NULL AND array_length(_admin_orgs, 1) > 0);
  RETURN a;
END;
$function$
;


-- ---------------------------------------------------------------------------
-- Assigning a volunteer to a Sunday
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.assign_session_staff(_kids_session_id uuid, _person_id uuid, _room_id uuid DEFAULT NULL::uuid, _role text DEFAULT 'classroom_volunteer'::text)
 RETURNS church.kids_session_staffing
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  _org UUID;
  _row church.kids_session_staffing;
BEGIN
  SELECT s.organization_id INTO _org
  FROM church.kids_sessions s WHERE s.id = _kids_session_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;

  IF _org NOT IN (SELECT church.my_orgs_with_any(
       ARRAY['kids_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM church.people p
                 WHERE p.id = _person_id AND p.organization_id = _org) THEN
    RAISE EXCEPTION 'person_not_in_this_branch';
  END IF;

  -- A restricted volunteer is never placed with children, by any route.
  IF EXISTS (SELECT 1 FROM church.kids_volunteers v
             WHERE v.person_id = _person_id
               AND v.may_not_serve_with_children) THEN
    RAISE EXCEPTION 'volunteer_is_restricted' USING ERRCODE = '42501';
  END IF;

  INSERT INTO church.kids_session_staffing (
    organization_id, kids_session_id, room_id, person_id, role)
  VALUES (_org, _kids_session_id, _room_id, _person_id,
          coalesce(_role, 'classroom_volunteer'))
  ON CONFLICT (kids_session_id, person_id) WHERE ended_at IS NULL
  DO UPDATE SET room_id = EXCLUDED.room_id,
                role = EXCLUDED.role,
                updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$
;


-- ---------------------------------------------------------------------------
-- Assigning a teacher to a classroom
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.assign_classroom_teacher(_organization_id uuid, _room_id uuid, _person_id uuid, _role text DEFAULT 'teacher'::text, _is_lead boolean DEFAULT false)
 RETURNS church.kids_classroom_teachers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  _row church.kids_classroom_teachers;
BEGIN
  IF NOT (_organization_id IN (SELECT church.my_admin_orgs())
          OR church.has_permission_in_org(
               _organization_id,
               ARRAY['kids_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM church.people p
                 WHERE p.id = _person_id
                   AND p.organization_id = _organization_id
                   AND p.is_active AND NOT p.is_child) THEN
    RAISE EXCEPTION 'person_not_eligible_to_teach';
  END IF;

  -- A person barred from working with children is never placed in a classroom,
  -- on any path — the same rule assign_session_staff enforces for a Sunday.
  IF EXISTS (SELECT 1 FROM church.kids_volunteers v
             WHERE v.person_id = _person_id
               AND v.may_not_serve_with_children) THEN
    RAISE EXCEPTION 'volunteer_is_restricted' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM church.room_kids_config rk
                 WHERE rk.room_id = _room_id
                   AND rk.organization_id = _organization_id
                   AND rk.is_checkin_location) THEN
    RAISE EXCEPTION 'room_is_not_a_configured_classroom';
  END IF;

  INSERT INTO church.kids_classroom_teachers (
    organization_id, room_id, person_id, role, is_lead,
    created_by, created_by_name)
  VALUES (
    _organization_id, _room_id, _person_id,
    coalesce(_role, 'teacher'), coalesce(_is_lead, false),
    auth.uid(),
    coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'System'))
  ON CONFLICT (room_id, person_id) WHERE effective_to IS NULL
  DO UPDATE SET role = EXCLUDED.role,
                is_lead = EXCLUDED.is_lead,
                updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$
;


-- ---------------------------------------------------------------------------
-- A volunteer puts themselves in a room
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.start_my_shift(_kids_session_id uuid, _room_id uuid DEFAULT NULL::uuid, _role text DEFAULT 'classroom_volunteer'::text)
 RETURNS church.kids_session_staffing
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  a church.resolved_actor;
  _row church.kids_session_staffing;
BEGIN
  a := church.resolve_actor(NULL);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  -- A volunteer with no member record cannot be attributed, and attribution
  -- is the entire point of a staffing row.
  IF a.person_id IS NULL THEN
    RAISE EXCEPTION 'no_member_record'
      USING HINT = 'An admin needs to link this login to a member record.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM church.kids_sessions s
                 WHERE s.id = _kids_session_id
                   AND s.organization_id = a.organization_id) THEN
    RAISE EXCEPTION 'session_not_found';
  END IF;

  INSERT INTO church.kids_session_staffing (
    organization_id, kids_session_id, room_id, person_id, role)
  VALUES (a.organization_id, _kids_session_id, _room_id, a.person_id,
          coalesce(_role, 'classroom_volunteer'))
  ON CONFLICT (kids_session_id, person_id) WHERE ended_at IS NULL
  DO UPDATE SET room_id = EXCLUDED.room_id,
                role = EXCLUDED.role,
                updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$
;


-- ---------------------------------------------------------------------------
-- The override authorizer
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.check_out_children(_check_in_ids uuid[], _presented text DEFAULT NULL::text, _shift_token text DEFAULT NULL::text, _picked_up_by_person_id uuid DEFAULT NULL::uuid, _picked_up_by_name text DEFAULT NULL::text, _override_reason text DEFAULT NULL::text, _override_verification text DEFAULT NULL::text, _override_authorizer_volunteer_id uuid DEFAULT NULL::uuid, _override_authorizer_pin text DEFAULT NULL::text)
 RETURNS TABLE(check_in_id uuid, child_name text, checked_out_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  a church.resolved_actor;
  ci church.kids_check_ins%ROWTYPE;
  sec church.kids_check_in_secrets%ROWTYPE;
  _ids UUID[];
  _live UUID[];
  _method TEXT;
  _authorizer UUID;
  _authorizer_name TEXT;
  _auth_hash TEXT;
  _names_restricted BOOLEAN;
  _blocked INTEGER;
  _id UUID;
  _updated INTEGER;
  _released UUID[] := '{}';
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_out THEN
    RAISE EXCEPTION 'not_permitted_to_check_out' USING ERRCODE = '42501';
  END IF;

  IF _check_in_ids IS NULL OR array_length(_check_in_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_check_ins_supplied';
  END IF;

  SELECT array_agg(DISTINCT x) INTO _ids FROM unnest(_check_in_ids) AS x
   WHERE x IS NOT NULL;
  IF _ids IS NULL THEN RAISE EXCEPTION 'no_check_ins_supplied'; END IF;

  -- Anchor on the batch, not on _ids[1]. array_agg(DISTINCT) sorts, so the
  -- first element was the lowest uuid — which meant an unknown id sorting
  -- first RAISED (aborting the transaction and losing the audit row) while the
  -- same probe sorting last got the silent audited denial. Different responses
  -- for the same mistake is an oracle.
  SELECT * INTO ci FROM church.kids_check_ins k
   WHERE k.id = ANY(_ids) AND k.organization_id = a.organization_id
   ORDER BY k.checked_in_at LIMIT 1;
  IF NOT FOUND THEN
    RETURN;   -- zero rows, like every other denial
  END IF;

  IF (SELECT count(*) FROM church.kids_check_ins k
       WHERE k.id = ANY(_ids)
         AND k.organization_id = a.organization_id
         AND k.batch_id = ci.batch_id
         AND k.kids_session_id = ci.kids_session_id)
     <> array_length(_ids, 1) THEN
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    VALUES (a.organization_id, 'check_out', 'denied', ci.id, ci.batch_id,
            ci.kids_session_id, ci.child_person_id, a.station_id, a.volunteer_id,
            auth.uid(), a.actor_name,
            jsonb_build_object('reason', 'check-ins span more than one batch'));
    RETURN;
  END IF;

  -- C-7: only children still in a room are being released, so only they are
  -- checked. A sibling collected an hour ago must not block the one still here.
  SELECT array_agg(k.id) INTO _live
  FROM church.kids_check_ins k
  WHERE k.id = ANY(_ids) AND k.organization_id = a.organization_id
    AND k.status = 'checked_in';

  IF _live IS NULL THEN
    RETURN;   -- nothing left to release
  END IF;

  -- C-1: does the collector appear in any live order for any of these
  -- children, by id or by name? This is the absolute bar, and it is checked
  -- before the code/override branch so nothing can step around it.
  SELECT EXISTS (
    SELECT 1 FROM church.kids_check_ins k
    WHERE k.id = ANY(_live)
      AND church.restriction_names_person(
            k.child_person_id, _picked_up_by_person_id, _picked_up_by_name)
  ) INTO _names_restricted;

  IF _names_restricted THEN
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    SELECT a.organization_id, 'restricted_pickup_attempt', 'denied', k.id,
           k.batch_id, k.kids_session_id, k.child_person_id, a.station_id,
           a.volunteer_id, auth.uid(), a.actor_name,
           jsonb_build_object(
             'reason', 'collector is named in a protective order',
             'attempted_person_id', _picked_up_by_person_id,
             'attempted_name', _picked_up_by_name)
    FROM church.kids_check_ins k
    WHERE k.id = ANY(_live)
      AND church.restriction_names_person(
            k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);
    RETURN;
  END IF;

  -- C-8: identity is required only where it buys something. For a child with
  -- no order, the code is the credential and a lapsed member record is not a
  -- reason to refuse their own parent.
  IF _picked_up_by_person_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM church.people p
                     WHERE p.id = _picked_up_by_person_id
                       AND p.organization_id = a.organization_id) THEN
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    VALUES (a.organization_id, 'check_out', 'denied', ci.id, ci.batch_id,
            ci.kids_session_id, ci.child_person_id, a.station_id, a.volunteer_id,
            auth.uid(), a.actor_name,
            jsonb_build_object('reason', 'collector is not a person on file',
                               'attempted_person_id', _picked_up_by_person_id));
    RETURN;
  END IF;

  -- A child under an order leaves only with an approved collector — unless an
  -- admin takes responsibility. C-3: without this, a restricted child whose
  -- family was CSV-imported (people and relationships, no household row) could
  -- not be collected by anyone at all, including their own mother with the
  -- code and photo ID, and no override existed because the gate ran first.
  --
  -- The break-glass never reaches the person the order names — that was ruled
  -- out above and has no override. It only answers "the paperwork does not
  -- list anyone", which is a records problem, not a custody one.
  SELECT count(*) INTO _blocked
  FROM church.kids_check_ins k
  WHERE k.id = ANY(_live)
    AND church.child_has_active_restriction(k.child_person_id)
    AND NOT church.is_approved_collector(
              k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);

  IF _blocked > 0 THEN
    IF _override_reason IS NULL OR NOT a.can_override THEN
      INSERT INTO church.check_in_audit
        (organization_id, action, outcome, check_in_id, batch_id,
         kids_session_id, child_person_id, station_id, volunteer_id,
         actor_auth_user_id, actor_name, detail)
      SELECT a.organization_id, 'restricted_pickup_attempt', 'denied', k.id,
             k.batch_id, k.kids_session_id, k.child_person_id, a.station_id,
             a.volunteer_id, auth.uid(), a.actor_name,
             jsonb_build_object(
               'reason', CASE WHEN _picked_up_by_person_id IS NULL
                              THEN 'collector not identified'
                              ELSE 'collector is not on the approved list' END,
               'attempted_person_id', _picked_up_by_person_id,
               'attempted_name', _picked_up_by_name,
               'override_available', a.can_override)
      FROM church.kids_check_ins k
      WHERE k.id = ANY(_live)
        AND church.child_has_active_restriction(k.child_person_id)
        AND NOT church.is_approved_collector(
                  k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);
      RETURN;
    END IF;

    -- Recorded as its own action so it is never mistaken for a routine
    -- release when the ministry reviews the week.
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    SELECT a.organization_id, 'restricted_pickup_override', 'success', k.id,
           k.batch_id, k.kids_session_id, k.child_person_id, a.station_id,
           a.volunteer_id, auth.uid(), a.actor_name,
           jsonb_build_object('reason', _override_reason,
                              'verification', _override_verification,
                              'released_to', _picked_up_by_name,
                              'released_to_person_id', _picked_up_by_person_id)
    FROM church.kids_check_ins k
    WHERE k.id = ANY(_live)
      AND church.child_has_active_restriction(k.child_person_id)
      AND NOT church.is_approved_collector(
                k.child_person_id, _picked_up_by_person_id, _picked_up_by_name);
  END IF;

  IF _override_reason IS NOT NULL THEN
    IF NOT a.can_override THEN
      RAISE EXCEPTION 'override_requires_admin' USING ERRCODE = '42501';
    END IF;

    IF _override_authorizer_volunteer_id IS NOT NULL
       AND _override_authorizer_pin IS NOT NULL THEN
      SELECT p.pin_hash INTO _auth_hash
      FROM church.kids_volunteer_pins p
      JOIN church.kids_volunteers v ON v.id = p.volunteer_id
      WHERE p.volunteer_id = _override_authorizer_volunteer_id
        AND v.organization_id = a.organization_id
        AND v.is_active AND v.can_override
        AND NOT v.may_not_serve_with_children;

      IF _auth_hash IS NULL OR _auth_hash <> crypt(_override_authorizer_pin, _auth_hash) THEN
        RAISE EXCEPTION 'override_authorization_failed' USING ERRCODE = '28000';
      END IF;
      _authorizer := _override_authorizer_volunteer_id;
      SELECT coalesce(pp.preferred_name, pp.first_name) || ' ' || pp.last_name
        INTO _authorizer_name
      FROM church.kids_volunteers vv
      JOIN church.people pp ON pp.id = vv.person_id
      WHERE vv.id = _override_authorizer_volunteer_id;
    ELSE
      _authorizer := a.volunteer_id;
      _authorizer_name := a.actor_name;
    END IF;

    _method := 'operator_override';
  ELSE
    SELECT * INTO sec FROM church.kids_check_in_secrets s
    WHERE s.batch_id = ci.batch_id
      AND s.consumed_at IS NULL
      AND s.expires_at > now()
      AND (s.locked_until IS NULL OR s.locked_until <= now())
      AND (s.code_hash = church.hash_pickup(church.normalize_pickup_code(_presented))
        OR s.token_hash = church.hash_pickup(btrim(coalesce(_presented, ''))));

    IF NOT FOUND THEN
      INSERT INTO church.check_in_audit
        (organization_id, action, outcome, check_in_id, batch_id, kids_session_id,
         child_person_id, station_id, volunteer_id, actor_auth_user_id, actor_name)
      VALUES (a.organization_id, 'code_failed', 'denied', ci.id, ci.batch_id,
              ci.kids_session_id, ci.child_person_id, a.station_id, a.volunteer_id,
              auth.uid(), a.actor_name);
      RETURN;
    END IF;
    _method := 'security_code';
  END IF;

  FOREACH _id IN ARRAY _live LOOP
    UPDATE church.kids_check_ins k
       SET status = 'checked_out',
           checked_out_at = now(),
           checked_out_by_station_id = a.station_id,
           checked_out_by_volunteer_id = a.volunteer_id,
           checked_out_by_name = a.actor_name,
           picked_up_by_person_id = _picked_up_by_person_id,
           picked_up_by_name = coalesce(_picked_up_by_name, 'unrecorded'),
           checkout_method = _method,
           override_reason = _override_reason,
           override_verification = _override_verification,
           override_authorized_by_volunteer_id = _authorizer,
           override_authorized_by_name = _authorizer_name
     WHERE k.id = _id
       AND k.organization_id = a.organization_id
       AND k.batch_id = ci.batch_id
       AND k.kids_session_id = ci.kids_session_id
       AND k.status = 'checked_in';

    -- Only audit what actually changed. The loop used to write a success row
    -- unconditionally, so re-sending an already-collected child produced a
    -- second check_out — indistinguishable from a duplicate collection, which
    -- is precisely the incident this log exists to detect.
    GET DIAGNOSTICS _updated = ROW_COUNT;
    IF _updated = 0 THEN CONTINUE; END IF;
    _released := _released || _id;

    INSERT INTO church.check_in_audit
      (organization_id, action, check_in_id, batch_id, kids_session_id,
       child_person_id, station_id, volunteer_id, actor_auth_user_id,
       actor_name, detail)
    SELECT a.organization_id,
           CASE WHEN _method = 'operator_override' THEN 'override' ELSE 'check_out' END,
           c.id, c.batch_id, c.kids_session_id, c.child_person_id,
           a.station_id, a.volunteer_id, auth.uid(), a.actor_name,
           jsonb_build_object('method', _method,
                              'picked_up_by', _picked_up_by_name,
                              'picked_up_by_person_id', _picked_up_by_person_id,
                              'override_reason', _override_reason,
                              'verification', _override_verification,
                              'authorized_by', coalesce(_authorizer_name, 'unknown'))
    FROM church.kids_check_ins c WHERE c.id = _id;
  END LOOP;

  UPDATE church.kids_check_in_secrets s
     SET consumed_at = now()
   WHERE s.batch_id = ci.batch_id
     AND NOT EXISTS (SELECT 1 FROM church.kids_check_ins c
                     WHERE c.batch_id = ci.batch_id AND c.status = 'checked_in');

  -- Only children released by THIS call, so the caller cannot be told it
  -- collected someone who went home an hour ago.
  RETURN QUERY
  SELECT c.id, c.label_child_name, c.checked_out_at
  FROM church.kids_check_ins c
  WHERE c.id = ANY(_released);
END;
$function$
;


-- ---------------------------------------------------------------------------
-- The dormant PIN shift
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.station_open_shift(_station_id uuid, _volunteer_id uuid, _pin text, _duration_minutes integer DEFAULT 240)
 RETURNS TABLE(shift_token text, volunteer_name text, expires_at timestamp with time zone, can_override boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  s  church.check_in_stations%ROWTYPE;
  v  church.kids_volunteers%ROWTYPE;
  pr church.kids_volunteer_pins%ROWTYPE;
  p  church.people%ROWTYPE;
  _ok BOOLEAN := false;
  _token TEXT;
  _expires TIMESTAMPTZ;
  -- Decoy so the bcrypt cost is paid even when the volunteer does not exist
  -- or has no PIN set. Without it, response time leaks which names are real.
  _decoy TEXT := '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
BEGIN
  SELECT * INTO s FROM church.check_in_stations
   WHERE id = _station_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'station_not_found' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v FROM church.kids_volunteers
   WHERE id = _volunteer_id AND organization_id = s.organization_id AND is_active;

  SELECT * INTO pr FROM church.kids_volunteer_pins WHERE volunteer_id = _volunteer_id;

  -- Always run the comparison, on a real hash or the decoy, before branching.
  IF pr.volunteer_id IS NOT NULL
     AND (pr.locked_until IS NULL OR pr.locked_until <= now()) THEN
    _ok := (pr.pin_hash = crypt(_pin, pr.pin_hash));
  ELSE
    PERFORM crypt(coalesce(_pin, ''), _decoy);
    _ok := false;
  END IF;

  -- KID-024: a restricted volunteer cannot start a shift at all.
  IF v.id IS NULL OR v.may_not_serve_with_children THEN
    _ok := false;
  END IF;

  IF NOT _ok THEN
    IF pr.volunteer_id IS NOT NULL THEN
      UPDATE church.kids_volunteer_pins
         SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= 5
                                 THEN now() + interval '15 minutes'
                                 ELSE locked_until END
       WHERE volunteer_id = _volunteer_id;
    END IF;

    -- Return ZERO ROWS rather than RAISE. This is not a style preference: a
    -- RAISE aborts the surrounding transaction, which would roll back the
    -- increment immediately above it and leave the lockout counter
    -- permanently stuck at zero. Verified by test — with a RAISE here, five
    -- wrong PINs followed by the correct one still succeeded.
    --
    -- Zero rows is still a single indistinguishable "denied" for every
    -- failure mode (wrong PIN, unknown volunteer, locked out, restricted), so
    -- the station is not an enumeration oracle. Callers must treat an empty
    -- result as denial.
    RETURN;
  END IF;

  UPDATE church.kids_volunteer_pins
     SET failed_attempts = 0, locked_until = NULL, last_used_at = now()
   WHERE volunteer_id = _volunteer_id;

  SELECT * INTO p FROM church.people WHERE id = v.person_id;

  _token := encode(gen_random_bytes(32), 'base64');
  _expires := now() + make_interval(mins => greatest(1, least(_duration_minutes, 720)));

  -- End any shift this volunteer still has open at this station, so a
  -- forgotten sign-out does not leave a live credential behind.
  UPDATE church.kids_shift_tokens
     SET ended_at = now()
   WHERE volunteer_id = _volunteer_id AND station_id = _station_id AND ended_at IS NULL;

  INSERT INTO church.kids_shift_tokens
    (organization_id, volunteer_id, station_id, token_hash, issued_to_auth_user, expires_at)
  VALUES
    (s.organization_id, v.id, s.id, digest(_token, 'sha256'), auth.uid(), _expires);

  UPDATE church.check_in_stations SET last_seen_at = now() WHERE id = _station_id;

  RETURN QUERY SELECT
    _token,
    coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
    _expires,
    v.can_override;
END;
$function$
;


NOTIFY pgrst, 'reload schema';
