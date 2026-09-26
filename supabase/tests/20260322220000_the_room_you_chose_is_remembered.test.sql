-- Assertions for 20260322220000, inside BEGIN/ROLLBACK.
-- pick_room_for_child runs on EVERY check-in, so the first group is about
-- what has NOT changed.

-- 1. The school year turns over in August, matching gradeForAge.ts.
DO $a$
BEGIN
  IF church.school_year_of(DATE '2026-09-25') <> 2026 THEN
    RAISE EXCEPTION 'FAIL 1: September 2026 is not in the 2026 school year';
  END IF;
  IF church.school_year_of(DATE '2026-08-01') <> 2026 THEN
    RAISE EXCEPTION 'FAIL 1b: August is the turn, so 1 August is the new year';
  END IF;
  IF church.school_year_of(DATE '2026-07-31') <> 2025 THEN
    RAISE EXCEPTION 'FAIL 1c: July still belongs to the previous school year';
  END IF;
  IF church.school_year_of(DATE '2027-05-01') <> 2026 THEN
    RAISE EXCEPTION 'FAIL 1d: May 2027 is still the 2026-27 school year';
  END IF;
  RAISE NOTICE 'PASS 1 (school year turns in August)';
END;
$a$;

-- 2. A CHILD WITH NO PREFERENCE IS PLACED EXACTLY AS BEFORE. This is the one
--    that matters most: the function runs on every check-in on a Sunday.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _sess UUID; _kid UUID; _r RECORD; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id=_md
   ORDER BY session_date DESC LIMIT 1;

  -- A real child with a grade lands in the room for their grade.
  SELECT p.id INTO _kid FROM church.people p
   WHERE p.organization_id=_md AND p.is_child AND p.is_active
     AND p.school_grade_id IS NOT NULL LIMIT 1;

  IF _kid IS NOT NULL THEN
    SELECT * INTO _r FROM church.pick_room_for_child(_sess, _md, _kid);
    IF _r.room_id IS NULL THEN
      RAISE EXCEPTION 'FAIL 2: a child with a grade was not placed at all';
    END IF;
    IF _r.reason IS NOT NULL THEN
      RAISE EXCEPTION 'FAIL 2b: a graded child was placed with a warning: %', _r.reason;
    END IF;
    -- ...and in a room that teaches their grade.
    IF NOT EXISTS (
      SELECT 1 FROM church.room_kids_config rkc
      JOIN church.people p ON p.id = _kid
      WHERE rkc.room_id = _r.room_id AND rkc.school_grade_id = p.school_grade_id) THEN
      RAISE EXCEPTION 'FAIL 2c: a graded child was placed outside their grade';
    END IF;
  END IF;

  -- Every child placed somewhere. A church does not turn a child away.
  SELECT count(*) INTO _n FROM (
    SELECT p.id FROM church.people p
     WHERE p.organization_id=_md AND p.is_child AND p.is_active LIMIT 40) s
  WHERE (SELECT room_id FROM church.pick_room_for_child(_sess, _md, s.id)) IS NULL;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 2d: % of 40 real children were placed nowhere', _n;
  END IF;
  RAISE NOTICE 'PASS 2 (placement unchanged for children with no preference)';
END;
$a$;

-- 3-9. The preference itself.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _sess UUID; _kid UUID; _prek UUID; _kinder UUID; _g1 UUID; _aud UUID;
  _r RECORD; _p RECORD; _ok BOOLEAN; _thisyear INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id=_md
   ORDER BY session_date DESC LIMIT 1;
  _thisyear := church.school_year_of(current_date);

  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md,'ZZRoomKid','R',true) RETURNING id INTO _kid;

  SELECT ksr.room_id INTO _prek FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   JOIN church.school_grades g ON g.id=rkc.school_grade_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND g.sort_order=10 LIMIT 1;
  SELECT ksr.room_id INTO _kinder FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   JOIN church.school_grades g ON g.id=rkc.school_grade_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND g.sort_order=20 LIMIT 1;
  SELECT ksr.room_id INTO _g1 FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   JOIN church.school_grades g ON g.id=rkc.school_grade_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND g.sort_order=30 LIMIT 1;

  IF _prek IS NULL OR _kinder IS NULL OR _g1 IS NULL THEN
    RAISE EXCEPTION 'SKIP: the Pre-K, Kindergarten or Grade 1 room is not open today';
  END IF;

  -- 3. Only a real classroom can be remembered. Remembering the auditorium
  --    would put a child there every Sunday until somebody noticed.
  SELECT r.id INTO _aud FROM public.rooms r
   LEFT JOIN church.room_kids_config rkc ON rkc.room_id=r.id
   WHERE rkc.room_id IS NULL LIMIT 1;
  IF _aud IS NOT NULL THEN
    _ok := false;
    BEGIN
      PERFORM church.kids_set_child_room_preference(_kid, _aud);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%not_a_classroom%' THEN _ok := true; ELSE RAISE; END IF;
    END;
    IF NOT _ok THEN RAISE EXCEPTION 'FAIL 3: a non-classroom was remembered'; END IF;
  END IF;

  -- 4. Setting it sends the child there, with no warning - it is this year's
  --    deliberate choice, not a guess.
  PERFORM church.kids_set_child_room_preference(_kid, _prek);
  SELECT * INTO _r FROM church.pick_room_for_child(_sess, _md, _kid);
  IF _r.room_id <> _prek THEN RAISE EXCEPTION 'FAIL 4: the remembered room was ignored'; END IF;
  IF _r.reason IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 4b: this year''s own choice was flagged as carried over';
  END IF;

  -- 5. WITHIN THE SCHOOL YEAR THE EXACT ROOM IS HONOURED, not re-derived from
  --    the grade. A volunteer who chose Blossom over Joy meant Blossom.
  UPDATE church.kids_child_room_preference
     SET school_year_set = _thisyear WHERE child_person_id = _kid;
  SELECT * INTO _r FROM church.pick_room_for_child(_sess, _md, _kid);
  IF _r.room_id <> _prek THEN RAISE EXCEPTION 'FAIL 5: the exact room was not honoured'; END IF;

  -- 6. ONE SCHOOL YEAR LATER IT CLIMBS ONE RUNG: Pre-K becomes Kindergarten,
  --    by itself, with no per-child grade data involved at all.
  UPDATE church.kids_child_room_preference
     SET school_year_set = _thisyear - 1 WHERE child_person_id = _kid;
  SELECT * INTO _r FROM church.pick_room_for_child(_sess, _md, _kid);
  IF _r.room_id <> _kinder THEN
    RAISE EXCEPTION 'FAIL 6: after a year the child did not move up to Kindergarten';
  END IF;
  IF _r.reason IS NULL THEN
    RAISE EXCEPTION 'FAIL 6b: a carried-over placement was not flagged for confirming';
  END IF;

  -- 7. TWO YEARS LATER, GRADE 1. The ladder keeps climbing.
  UPDATE church.kids_child_room_preference
     SET school_year_set = _thisyear - 2 WHERE child_person_id = _kid;
  SELECT * INTO _r FROM church.pick_room_for_child(_sess, _md, _kid);
  IF _r.room_id <> _g1 THEN
    RAISE EXCEPTION 'FAIL 7: two years on, the child is not in Grade 1';
  END IF;

  -- 8. IT STOPS AT GRADE 12 rather than walking off the end of the ladder.
  --    Set in Pre-K (10); 14 years on would be 150, past Grade 12's 140.
  UPDATE church.kids_child_room_preference
     SET school_year_set = _thisyear - 14 WHERE child_person_id = _kid;
  IF (SELECT count(*) FROM church.kids_preferred_room_for_child(_sess,_md,_kid)) <> 0 THEN
    RAISE EXCEPTION 'FAIL 8: a preference walked past Grade 12';
  END IF;
  -- ...and the child is still placed, by the ordinary logic.
  SELECT * INTO _r FROM church.pick_room_for_child(_sess, _md, _kid);
  IF _r.room_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 8b: a lapsed preference left the child placed nowhere';
  END IF;

  -- 9. CLEARING IT gives the grade back.
  UPDATE church.kids_child_room_preference
     SET school_year_set = _thisyear WHERE child_person_id = _kid;
  PERFORM church.kids_set_child_room_preference(_kid, NULL);
  IF EXISTS (SELECT 1 FROM church.kids_child_room_preference WHERE child_person_id=_kid) THEN
    RAISE EXCEPTION 'FAIL 9: "Room by grade" did not clear the preference';
  END IF;

  RAISE NOTICE 'PASS 3-9 (remembered, climbs a rung a year, stops at 12, clearable)';
END;
$a$;

-- 10. A closed room is not used just because it was remembered. A child whose
--     classroom is not running today must still be placed somewhere open.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _sess UUID; _kid UUID; _room UUID; _r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id=_md
   ORDER BY session_date DESC LIMIT 1;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md,'ZZClosedKid','C',true) RETURNING id INTO _kid;

  SELECT ksr.room_id INTO _room FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND rkc.is_checkin_location LIMIT 1;

  PERFORM church.kids_set_child_room_preference(_kid, _room);
  UPDATE church.kids_session_rooms SET is_open = false
   WHERE kids_session_id=_sess AND room_id=_room;

  SELECT * INTO _r FROM church.pick_room_for_child(_sess, _md, _kid);
  IF _r.room_id = _room THEN
    RAISE EXCEPTION 'FAIL 10: a child was sent to a classroom that is not running';
  END IF;
  IF _r.room_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 10b: a closed remembered room left the child placed nowhere';
  END IF;
  RAISE NOTICE 'PASS 10 (a closed room falls through rather than stranding a child)';
END;
$a$;

-- 11. The desk read is behind can_check_in and shows where the child lands.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _sess UUID; _kid UUID; _room UUID; _r RECORD; _ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id=_md
   ORDER BY session_date DESC LIMIT 1;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md,'ZZShowKid','S',true) RETURNING id INTO _kid;
  SELECT ksr.room_id INTO _room FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND rkc.is_checkin_location LIMIT 1;

  PERFORM church.kids_set_child_room_preference(_kid, _room);
  SELECT * INTO _r FROM church.kids_child_room_preferences(ARRAY[_kid], _sess);
  IF _r.room_id <> _room THEN RAISE EXCEPTION 'FAIL 11: the desk cannot see the choice'; END IF;
  IF _r.room_name IS NULL THEN RAISE EXCEPTION 'FAIL 11b: no room name to show'; END IF;
  IF _r.carried_years <> 0 THEN RAISE EXCEPTION 'FAIL 11c: a fresh choice reads as carried'; END IF;

  RAISE NOTICE 'PASS 11 (the desk can show the remembered room)';
END;
$a$;
