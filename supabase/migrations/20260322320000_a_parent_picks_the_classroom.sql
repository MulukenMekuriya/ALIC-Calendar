-- =====================================================
-- A parent picks the classroom
-- =====================================================
--
-- The kiosk sent `_room_ids` as an array of NULLs, so every child went
-- wherever church.pick_room_for_child() put them and a parent had no say. At
-- the staffed desk a volunteer has had a room dropdown since 20260320002500,
-- and the three things parents ask for there are the same three every Sunday:
-- keep the siblings together, "she has always been in Joy B", and the grade on
-- file is wrong or missing.
--
-- THAT LAST ONE IS NOT A CORNER CASE. 415 of 534 children have no school grade
-- on file, so their placement falls through to the age band - which for a
-- ministry that organises by grade is a guess. The parent standing at the
-- tablet is the person who knows.
--
-- ---------------------------------------------------------------------------
-- A FOURTH DOOR, NOT A GRANT
-- ---------------------------------------------------------------------------
--
-- 20260322230000 set the invariant: the kiosk reads NOTHING directly, because
-- any module grant lifts the RESTRICTIVE policy on public.profiles and hands
-- an unattended lobby tablet the name and email of every user in the branch.
-- "If a future kiosk screen needs more, it gets another function. Not a grant."
-- This is that function.
--
-- AND NOT church.station_session_rooms, which the kiosk could technically call
-- - resolve_actor gives a kiosk can_check_in - but which returns the first
-- names of every classroom's standing teachers and a live headcount per room.
-- A parent choosing a classroom needs the room's name, the grade it teaches,
-- and whether there is space in it. Nothing else, so nothing else is returned.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ---------------------------------------------------------------------------
--
-- IT DOES NOT REMEMBER THE CHOICE. church.kids_set_child_room_preference
-- records a volunteer's considered decision about a child and then carries it
-- forward a grade every school year by itself. A parent's tap in a lobby -
-- "with her cousin this morning" - is a different kind of act, and turning it
-- into a standing placement that climbs grades unattended for years is not
-- something to do behind their back. The kiosk's pick applies to this service
-- and no other; next Sunday the child is placed the way they are today.
--
-- IT DOES NOT OVERRIDE CAPACITY. resolve_actor gives a kiosk
-- can_override = false, the client sends nothing, and a full room therefore
-- refuses. A volunteer overrides a full room because they can see the room; an
-- unattended tablet cannot. So a full room is shown as full and cannot be
-- tapped, which is the honest version of the same rule.

-- ---------------------------------------------------------------------------
-- 1. The classrooms a parent may choose between
-- ---------------------------------------------------------------------------
--
-- VOLATILE, and it syncs first, exactly as station_session_rooms has since
-- 20260322160000. A session whose rooms were never attached would otherwise
-- show a parent an empty list and then refuse them with `no_open_classroom` -
-- the dead end the kiosk is not allowed to have.
CREATE OR REPLACE FUNCTION church.kiosk_session_rooms(
  _kids_session_id UUID,
  _station_id      UUID DEFAULT NULL
)
RETURNS TABLE (
  room_id    UUID,
  room_name  TEXT,
  grade_name TEXT,
  -- Not a headcount. "Is there space" is the whole of what the lobby needs,
  -- and a number on a public screen invites arithmetic about other people's
  -- children.
  is_full    BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a church.resolved_actor;
  _st UUID;
  _open BOOLEAN;
BEGIN
  a := church.resolve_actor(NULL);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _st := church.kiosk_active_station(_station_id, a.organization_id);

  -- A revoked tablet is offered no classrooms, the same way it is found no
  -- family. is_active = false has to be a real revocation at every door.
  IF _station_id IS NOT NULL AND _st IS NULL THEN
    RAISE EXCEPTION 'station_not_active'
      USING HINT = 'This device is no longer registered. Please see a Kids '
                   'Ministry leader.';
  END IF;

  SELECT (s.status = 'open') INTO _open
  FROM church.kids_sessions s
  WHERE s.id = _kids_session_id AND s.organization_id = a.organization_id;

  IF coalesce(_open, false) THEN
    PERFORM church.kids_sync_session_rooms(_kids_session_id);
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    coalesce(rk.label_room_name, r.name),
    g.display_name,
    CASE
      WHEN coalesce(sr.capacity_override, rk.capacity) IS NULL THEN false
      ELSE live.n >= coalesce(sr.capacity_override, rk.capacity)
    END
  FROM church.kids_session_rooms sr
  JOIN public.rooms r ON r.id = sr.room_id
  LEFT JOIN church.room_kids_config rk ON rk.room_id = r.id
  LEFT JOIN church.school_grades g ON g.id = rk.school_grade_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM church.kids_check_ins c
    WHERE c.kids_session_id = sr.kids_session_id
      AND c.room_id = r.id AND c.status = 'checked_in'
  ) live ON true
  WHERE sr.kids_session_id = _kids_session_id
    AND sr.organization_id = a.organization_id
    AND sr.is_open
  -- Pre-K first, Grade 8 last, matching the desk and the Classrooms tab. A
  -- room that teaches no grade sorts last, where it cannot be tapped by
  -- accident.
  ORDER BY coalesce(g.sort_order, 9999),
           coalesce(rk.sort_order, 0),
           coalesce(rk.label_room_name, r.name);
END;
$$;

COMMENT ON FUNCTION church.kiosk_session_rooms(UUID, UUID) IS
  'The classrooms a parent may choose between at the lobby kiosk. The kiosk '
  'equivalent of station_session_rooms, minus the teacher names and the live '
  'headcount - a parent needs the room, the grade and whether there is space.';

GRANT EXECUTE ON FUNCTION church.kiosk_session_rooms(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. The search says where each child would go
-- ---------------------------------------------------------------------------
--
-- So the screen can show the classroom BEFORE the parent commits, and so the
-- common path stays one tap: the suggestion is already right for most
-- families, and a parent who agrees with it touches nothing.
--
-- THE SUGGESTION IS A DISPLAY VALUE, NOT AN INSTRUCTION. The kiosk sends a
-- room id only for a child whose parent actually chose one; otherwise it still
-- sends NULL and check_in_one_child picks at commit time, as it does today.
-- That matters because pick_room_for_child balances two rooms sharing a grade
-- by taking the emptier one - freezing its answer at search time would pile a
-- morning's families into whichever room was emptiest when they walked in, and
-- it would mean this migration changed the placement of every child rather
-- than only of the ones whose parent tapped.
--
-- Two new output columns, so DROP then CREATE. CREATE OR REPLACE cannot widen
-- a RETURNS TABLE, and 20260322310000 is the scar from the version of this
-- mistake that silently succeeds: adding a PARAMETER creates a second function
-- beside the first and every defaulted call then fails as ambiguous. Nothing
-- else in the function body below has changed, character for character.
DROP FUNCTION IF EXISTS church.kiosk_find_household_by_phone(UUID, TEXT, UUID);

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
  already_checked_in BOOLEAN,
  -- New here. Where this child goes if nobody touches anything.
  suggested_room_id   UUID,
  suggested_room_name TEXT
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
                    AND ci.status = 'checked_in'),
         pick.room_id,
         coalesce(rk.label_room_name, pr.name)
  FROM church.people adult
  JOIN church.household_members hm_adult
    ON hm_adult.person_id = adult.id AND hm_adult.end_date IS NULL
  JOIN church.households h ON h.id = hm_adult.household_id
  JOIN church.household_members hm_child
    ON hm_child.household_id = h.id AND hm_child.end_date IS NULL
  JOIN church.people p ON p.id = hm_child.person_id
  LEFT JOIN church.school_grades g ON g.id = p.school_grade_id
  -- LEFT JOIN LATERAL, never a plain one: pick_room_for_child RETURNS a table
  -- and returns NO ROW when nothing is open, and an inner join would then drop
  -- the child from their own parent's screen entirely.
  LEFT JOIN LATERAL church.pick_room_for_child(
    _kids_session_id, a.organization_id, p.id) pick ON true
  LEFT JOIN public.rooms pr ON pr.id = pick.room_id
  LEFT JOIN church.room_kids_config rk ON rk.room_id = pick.room_id
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

NOTIFY pgrst, 'reload schema';
