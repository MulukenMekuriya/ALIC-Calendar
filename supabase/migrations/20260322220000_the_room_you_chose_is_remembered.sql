-- =====================================================
-- The room you chose is remembered
-- =====================================================
--
-- A volunteer picks a classroom for a child at the desk. Next Sunday it is
-- already chosen, and next September it has moved up a grade by itself.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS WORTH HAVING, from the data
-- ---------------------------------------------------------------------------
--
-- 415 of ALIC's 534 children have NO school grade on file, and only 117 have
-- a birth year. pick_room_for_child tries grade, then age band, then gives up
-- and takes "the emptiest open room" with the reason "please check
-- placement". For most children, every Sunday, that is what happens - so a
-- volunteer picks the room by hand, and next week picks it again.
--
-- This remembers the pick. It is not a workaround for missing grades: a child
-- WITH a grade still follows it, because the preference is only consulted
-- when it is current and it is anchored to a real classroom rather than to a
-- guess.
--
-- ---------------------------------------------------------------------------
-- HOW IT MOVES UP, AND WHY IT ANCHORS ON THE ROOM'S GRADE
-- ---------------------------------------------------------------------------
--
-- The obvious design is to store the CHILD's grade and step it each year.
-- That cannot work here: 415 children have no grade to step, and nothing in
-- this system advances school_grade_id in September - gradeForAge is only the
-- default selection in a dropdown at the desk, it has never written anything.
--
-- So the preference records which classroom's GRADE the child sat in. ALIC's
-- ladder steps by 10 - Ages 1-3 at 0, Pre-K 10, Kindergarten 20, up to Grade
-- 12 at 140 - so one school year is one rung:
--
--   set in the Pre-K room (10) in the 2026 school year
--     2026-27  ->  the room they actually chose
--     2027-28  ->  whichever room teaches Kindergarten (20)
--     2028-29  ->  Grade 1 (30)   ... and so on to Grade 12
--
-- WITHIN THE SAME SCHOOL YEAR THE EXACT ROOM IS HONOURED, not re-derived from
-- the grade. Two classrooms can teach one grade, and a volunteer who put a
-- child in Blossom rather than Joy meant Blossom - usually because that is
-- where their sibling or their friend is. Only once the year turns does the
-- grade take over, because by then the specific room is a year-old decision
-- about a room the child has outgrown.
--
-- PAST GRADE 12 IT STOPS. A preference cannot walk off the end of the ladder,
-- and ALIC's rooms only run to Grade 8 in any case, so anything beyond simply
-- falls through to the ordinary logic rather than placing a sixteen-year-old
-- anywhere.

-- ---------------------------------------------------------------------------
-- Which school year a date falls in
-- ---------------------------------------------------------------------------
--
-- August, matching gradeForAge.ts's SCHOOL_YEAR_STARTS_MONTH. The two have to
-- agree or the dropdown's suggestion and the remembered room would step up in
-- different months.
CREATE OR REPLACE FUNCTION church.school_year_of(_d DATE)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = church, public
AS $$
  SELECT CASE WHEN extract(month FROM _d) >= 8
              THEN extract(year FROM _d)::INTEGER
              ELSE extract(year FROM _d)::INTEGER - 1 END
$$;

COMMENT ON FUNCTION church.school_year_of(DATE) IS
  'The year a school year STARTED. Rolls over in August, matching '
  'gradeForAge.ts - the two must agree.';

-- ---------------------------------------------------------------------------
-- The preference
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church.kids_child_room_preference (
  child_person_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- The classroom actually chosen. Honoured exactly, within its school year.
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,

  -- The school year the choice was made in, and the sort_order of the grade
  -- that room taught at the time. Both are needed to walk the ladder: the
  -- first says how many rungs to climb, the second says from where.
  school_year_set    INTEGER NOT NULL,
  grade_sort_at_set  INTEGER,

  set_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  set_by_name TEXT NOT NULL,
  set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_kids_room_pref_child
    FOREIGN KEY (child_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE
);

COMMENT ON TABLE church.kids_child_room_preference IS
  'The classroom a volunteer chose for a child at the desk. Honoured exactly '
  'within its school year, then walked one grade up the ladder per year until '
  'Grade 12. Anchored to the ROOM''s grade, not the child''s, because 415 of '
  '534 children have no grade on file.';

COMMENT ON COLUMN church.kids_child_room_preference.grade_sort_at_set IS
  'sort_order of the grade that room taught when the choice was made. NULL '
  'when the room teaches no grade (Kidventure today), in which case the room '
  'is kept as-is rather than climbing to nowhere.';

CREATE INDEX IF NOT EXISTS idx_kids_room_pref_org
  ON church.kids_child_room_preference (organization_id);

ALTER TABLE church.kids_child_room_preference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids team can view room preferences" ON church.kids_child_room_preference;
CREATE POLICY "Kids team can view room preferences"
  ON church.kids_child_room_preference FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['kids_admin','kids_leader','kids_volunteer','leadership_viewer']::church.module_permission[])));

GRANT SELECT ON church.kids_child_room_preference TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.kids_child_room_preference TO service_role;

-- ---------------------------------------------------------------------------
-- Where a preference sends a child today
-- ---------------------------------------------------------------------------
--
-- Its own function so the desk can SHOW the answer and pick_room_for_child
-- can USE it, without the two ever disagreeing about what is remembered.
--
-- Returns nothing at all when there is no preference, when the year has
-- carried it past Grade 12, or when no open classroom matches - and "nothing"
-- means the ordinary grade/age/fallback logic runs untouched.
CREATE OR REPLACE FUNCTION church.kids_preferred_room_for_child(
  _kids_session_id UUID,
  _organization_id UUID,
  _child_person_id UUID
)
RETURNS TABLE (room_id UUID, carried_years INTEGER)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  pref     church.kids_child_room_preference%ROWTYPE;
  _elapsed INTEGER;
  _target  INTEGER;
  _room    UUID;
BEGIN
  SELECT * INTO pref FROM church.kids_child_room_preference
   WHERE child_person_id = _child_person_id AND organization_id = _organization_id;
  IF NOT FOUND THEN RETURN; END IF;

  _elapsed := church.school_year_of(current_date) - pref.school_year_set;

  -- A preference from the future, or from this year: the exact room, if it is
  -- open today. The volunteer chose Blossom rather than Joy for a reason.
  IF _elapsed <= 0 THEN
    SELECT ksr.room_id INTO _room
    FROM church.kids_session_rooms ksr
    JOIN church.room_kids_config rkc ON rkc.room_id = ksr.room_id
    WHERE ksr.kids_session_id = _kids_session_id
      AND ksr.room_id = pref.room_id
      AND ksr.is_open AND rkc.is_active AND rkc.is_checkin_location;
    IF _room IS NOT NULL THEN
      RETURN QUERY SELECT _room, 0;
    END IF;
    RETURN;
  END IF;

  -- A room with no grade cannot climb a ladder it is not on. Keep it while it
  -- is open; this is Kidventure's case until somebody gives it a grade.
  IF pref.grade_sort_at_set IS NULL THEN
    SELECT ksr.room_id INTO _room
    FROM church.kids_session_rooms ksr
    JOIN church.room_kids_config rkc ON rkc.room_id = ksr.room_id
    WHERE ksr.kids_session_id = _kids_session_id
      AND ksr.room_id = pref.room_id
      AND ksr.is_open AND rkc.is_active AND rkc.is_checkin_location;
    IF _room IS NOT NULL THEN
      RETURN QUERY SELECT _room, _elapsed;
    END IF;
    RETURN;
  END IF;

  -- One rung per school year. 140 is Grade 12; past it the child has left
  -- the ministry and the preference stops meaning anything.
  _target := pref.grade_sort_at_set + (10 * _elapsed);
  IF _target > 140 THEN RETURN; END IF;

  SELECT ksr.room_id INTO _room
  FROM church.kids_session_rooms ksr
  JOIN church.room_kids_config rkc ON rkc.room_id = ksr.room_id
  JOIN church.school_grades g ON g.id = rkc.school_grade_id
  WHERE ksr.kids_session_id = _kids_session_id
    AND ksr.is_open AND rkc.is_active AND rkc.is_checkin_location
    AND g.sort_order = _target
  -- Emptiest first, so two rooms sharing a grade still self-balance.
  ORDER BY (SELECT count(*) FROM church.kids_check_ins ci
             WHERE ci.kids_session_id = _kids_session_id
               AND ci.room_id = ksr.room_id AND ci.status = 'checked_in'),
           rkc.sort_order
  LIMIT 1;

  IF _room IS NOT NULL THEN
    RETURN QUERY SELECT _room, _elapsed;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_preferred_room_for_child(UUID, UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Setting and clearing it
-- ---------------------------------------------------------------------------
--
-- NULL clears. "Room by grade" in the dropdown is a real answer - it means
-- "stop remembering and go back to following the grade" - and a volunteer
-- must be able to undo a choice as easily as they made it.
CREATE OR REPLACE FUNCTION church.kids_set_child_room_preference(
  _child_person_id UUID,
  _room_id         UUID DEFAULT NULL,
  _shift_token     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a     church.resolved_actor;
  _sort INTEGER;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM church.people p
                  WHERE p.id = _child_person_id
                    AND p.organization_id = a.organization_id) THEN
    RAISE EXCEPTION 'child_not_found';
  END IF;

  IF _room_id IS NULL THEN
    DELETE FROM church.kids_child_room_preference
     WHERE child_person_id = _child_person_id
       AND organization_id = a.organization_id;
    RETURN;
  END IF;

  -- Only a real classroom. Remembering the Main Auditorium would place a
  -- child there every Sunday until somebody noticed.
  SELECT g.sort_order INTO _sort
  FROM church.room_kids_config rkc
  LEFT JOIN church.school_grades g ON g.id = rkc.school_grade_id
  WHERE rkc.room_id = _room_id AND rkc.is_active AND rkc.is_checkin_location;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_a_classroom'
      USING HINT = 'Only a kids check-in classroom can be remembered.';
  END IF;

  INSERT INTO church.kids_child_room_preference (
    child_person_id, organization_id, room_id, school_year_set,
    grade_sort_at_set, set_by, set_by_name)
  VALUES (_child_person_id, a.organization_id, _room_id,
          church.school_year_of(current_date), _sort, auth.uid(), a.actor_name)
  ON CONFLICT (child_person_id) DO UPDATE SET
    room_id = EXCLUDED.room_id,
    -- Re-stamped, so choosing again this year restarts the clock rather than
    -- inheriting a climb from an older decision.
    school_year_set = EXCLUDED.school_year_set,
    grade_sort_at_set = EXCLUDED.grade_sort_at_set,
    set_by = EXCLUDED.set_by,
    set_by_name = EXCLUDED.set_by_name,
    set_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_set_child_room_preference(UUID, UUID, TEXT) TO authenticated;

-- What the desk shows, so the dropdown opens on the remembered room.
CREATE OR REPLACE FUNCTION church.kids_child_room_preferences(
  _child_person_ids UUID[],
  _kids_session_id  UUID DEFAULT NULL,
  _shift_token      TEXT DEFAULT NULL
)
RETURNS TABLE (
  child_person_id UUID,
  room_id         UUID,
  room_name       TEXT,
  carried_years   INTEGER,
  set_by_name     TEXT,
  set_at          TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE a church.resolved_actor;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.child_person_id, pr.room_id, r.name, pr.carried_years,
         p.set_by_name, p.set_at
  FROM church.kids_child_room_preference p
  CROSS JOIN LATERAL church.kids_preferred_room_for_child(
    _kids_session_id, a.organization_id, p.child_person_id) pr
  JOIN public.rooms r ON r.id = pr.room_id
  WHERE p.child_person_id = ANY(_child_person_ids)
    AND p.organization_id = a.organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_child_room_preferences(UUID[], UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Placement consults it first
-- ---------------------------------------------------------------------------
--
-- One new step ahead of the existing three. Everything below it is UNCHANGED,
-- character for character, and a child with no preference takes exactly the
-- path they take today - which is what the assertions check, because this
-- function runs on every check-in on a Sunday morning.
CREATE OR REPLACE FUNCTION church.pick_room_for_child(
  _kids_session_id UUID,
  _organization_id UUID,
  _child_person_id UUID
)
RETURNS TABLE (room_id UUID, reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  ch church.people%ROWTYPE;
  _band UUID;
  _room UUID;
  _pref RECORD;
BEGIN
  SELECT * INTO ch FROM church.people
   WHERE id = _child_person_id AND organization_id = _organization_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- 0. The room somebody chose for this child, moved up a grade for each
  --    school year since. A volunteer's decision about a real child beats an
  --    inference from a grade that, for 415 of 534 children, is not on file.
  SELECT * INTO _pref FROM church.kids_preferred_room_for_child(
    _kids_session_id, _organization_id, _child_person_id);

  IF _pref.room_id IS NOT NULL THEN
    RETURN QUERY SELECT _pref.room_id,
      CASE WHEN _pref.carried_years > 0
           THEN 'Moved up from last year''s classroom - please confirm'
           ELSE NULL END;
    RETURN;
  END IF;

  -- 1. The child's grade, which is how the ministry organises its classrooms.
  IF ch.school_grade_id IS NOT NULL THEN
    SELECT ksr.room_id INTO _room
    FROM church.kids_session_rooms ksr
    JOIN church.room_kids_config rkc ON rkc.room_id = ksr.room_id
    WHERE ksr.kids_session_id = _kids_session_id
      AND ksr.is_open AND rkc.is_active AND rkc.is_checkin_location
      AND rkc.school_grade_id = ch.school_grade_id
    -- Emptiest first, so two rooms sharing a grade self-balance over a morning.
    ORDER BY (SELECT count(*) FROM church.kids_check_ins ci
               WHERE ci.kids_session_id = _kids_session_id
                 AND ci.room_id = ksr.room_id AND ci.status = 'checked_in'),
             rkc.sort_order
    LIMIT 1;

    IF _room IS NOT NULL THEN
      RETURN QUERY SELECT _room, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 2. No grade on file, or no room teaches it: fall back to the age band.
  _band := church.age_band_for(_organization_id, ch.birth_year, ch.birth_month);
  IF _band IS NOT NULL THEN
    SELECT ksr.room_id INTO _room
    FROM church.kids_session_rooms ksr
    JOIN church.room_kids_config rkc ON rkc.room_id = ksr.room_id
    WHERE ksr.kids_session_id = _kids_session_id
      AND ksr.is_open AND rkc.is_active AND rkc.is_checkin_location
      AND rkc.kids_age_band_id = _band
    ORDER BY (SELECT count(*) FROM church.kids_check_ins ci
               WHERE ci.kids_session_id = _kids_session_id
                 AND ci.room_id = ksr.room_id AND ci.status = 'checked_in'),
             rkc.sort_order
    LIMIT 1;

    IF _room IS NOT NULL THEN
      RETURN QUERY SELECT _room,
        CASE WHEN ch.school_grade_id IS NULL
             THEN 'No school grade on file — placed by age'
             ELSE 'No classroom teaches this grade — placed by age' END;
      RETURN;
    END IF;
  END IF;

  -- 3. Nothing matched. The child is still placed, because a church does not
  -- turn a child away at the door — but the reason is recorded so the live
  -- board shows it and a leader can move them. ALIC runs no nursery, so a
  -- child below Pre-K lands here, and that must be visible rather than silent.
  SELECT ksr.room_id INTO _room
  FROM church.kids_session_rooms ksr
  LEFT JOIN church.room_kids_config rkc ON rkc.room_id = ksr.room_id
  WHERE ksr.kids_session_id = _kids_session_id AND ksr.is_open
  ORDER BY (SELECT count(*) FROM church.kids_check_ins ci
             WHERE ci.kids_session_id = _kids_session_id
               AND ci.room_id = ksr.room_id AND ci.status = 'checked_in'),
           coalesce(rkc.sort_order, 0)
  LIMIT 1;

  IF _room IS NOT NULL THEN
    RETURN QUERY SELECT _room, 'No matching classroom — please check placement';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION church.pick_room_for_child(UUID, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
