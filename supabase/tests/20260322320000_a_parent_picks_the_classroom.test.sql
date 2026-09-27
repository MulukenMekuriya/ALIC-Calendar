-- Assertions for 20260322320000. Run as the real kiosk account, which is the
-- only caller that matters: everything here is reached through the shared
-- lobby credential, which holds no module grant at all.

DO $a$
DECLARE
  _kiosk UUID := '1d64d6db-53ad-46fb-b55c-b256f3dc956c';
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _sess UUID; _r RECORD; _n INT; _m INT; _phone TEXT; _child UUID;
  _expected UUID;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_kiosk,'role','authenticated',
      'app_metadata', json_build_object('account_type','kiosk'))::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _kiosk::TEXT, true);

  SELECT id INTO _sess FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;
  IF _sess IS NULL THEN RAISE EXCEPTION 'SKIP: no open session to test against'; END IF;

  -- 1. THE POINT OF THE MIGRATION. A kiosk - no grant, no staff role - can
  --    list the classrooms a parent may choose between.
  SELECT count(*) INTO _n FROM church.kiosk_session_rooms(_sess, NULL);
  IF _n < 1 THEN
    RAISE EXCEPTION 'FAIL 1: the kiosk was offered % classrooms for an open session', _n;
  END IF;

  -- 2. And exactly the open ones, no more. A closed room on a parent's screen
  --    is a refusal waiting to happen.
  SELECT count(*) INTO _m FROM church.kids_session_rooms
   WHERE kids_session_id=_sess AND is_open;
  IF _n <> _m THEN
    RAISE EXCEPTION 'FAIL 2: kiosk offered % rooms, session has % open', _n, _m;
  END IF;

  -- 3. GRADE ORDER, the same order as the desk and the Classrooms tab, so a
  --    parent reads Pre-K to Grade 8 rather than room-creation order. Checked
  --    as "never goes backwards", which is what the ORDER BY actually claims.
  SELECT count(*) INTO _n FROM (
    SELECT coalesce(g.sort_order, 9999) AS grade_rank,
           row_number() OVER () AS pos
    FROM church.kiosk_session_rooms(_sess, NULL) k
    LEFT JOIN church.room_kids_config rk ON rk.room_id = k.room_id
    LEFT JOIN church.school_grades g ON g.id = rk.school_grade_id) t
  WHERE t.grade_rank < (SELECT max(u.grade_rank) FROM (
          SELECT coalesce(g2.sort_order, 9999) AS grade_rank,
                 row_number() OVER () AS pos
          FROM church.kiosk_session_rooms(_sess, NULL) k2
          LEFT JOIN church.room_kids_config rk2 ON rk2.room_id = k2.room_id
          LEFT JOIN church.school_grades g2 ON g2.id = rk2.school_grade_id) u
        WHERE u.pos < t.pos);
  IF _n > 0 THEN
    RAISE EXCEPTION 'FAIL 3: % classrooms are out of grade order', _n;
  END IF;

  IF (SELECT count(*) FROM church.kiosk_session_rooms(_sess, NULL)
       WHERE room_name IS NULL) > 0 THEN
    RAISE EXCEPTION 'FAIL 3b: a classroom came back with no name to show';
  END IF;

  -- 4. A REVOKED TABLET IS OFFERED NOTHING. An unknown station id must raise,
  --    not quietly list the rooms - is_active = false has to bite at every
  --    door the kiosk has.
  BEGIN
    PERFORM * FROM church.kiosk_session_rooms(_sess, gen_random_uuid());
    RAISE EXCEPTION 'FAIL 4: an unregistered tablet was offered classrooms';
  EXCEPTION
    WHEN sqlstate 'P0001' THEN
      IF position('station_not_active' IN SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- 5. NO HEADCOUNTS AND NO TEACHER NAMES on a public screen. The kiosk has
  --    its own door precisely so it cannot grow station_session_rooms' columns
  --    by accident, and this is the assertion that notices if it does.
  SELECT count(*) INTO _n
  FROM pg_proc pr
  JOIN pg_namespace ns ON ns.oid = pr.pronamespace
  CROSS JOIN LATERAL unnest(pr.proargnames) AS nm
  WHERE ns.nspname='church' AND pr.proname='kiosk_session_rooms'
    AND nm IN ('teachers','checked_in_count','capacity');
  IF _n > 0 THEN
    RAISE EXCEPTION 'FAIL 5: the kiosk room list exposes % staff/headcount column(s)', _n;
  END IF;

  RAISE NOTICE 'PASS 1-5 (the kiosk can list its classrooms, and only those)';

  -- ---------------------------------------------------------------------
  -- The search now says where each child would go
  -- ---------------------------------------------------------------------
  --
  -- A real household with a real number, found rather than hard-coded, so this
  -- keeps working as the directory changes.
  SELECT right(adult.phone_digits,10), p.id INTO _phone, _child
  FROM church.people adult
  JOIN church.household_members hm_a
    ON hm_a.person_id=adult.id AND hm_a.end_date IS NULL
  JOIN church.household_members hm_c
    ON hm_c.household_id=hm_a.household_id AND hm_c.end_date IS NULL
  JOIN church.people p ON p.id=hm_c.person_id
  WHERE adult.organization_id=_md AND NOT adult.is_child AND adult.is_active
    AND adult.phone_digits IS NOT NULL AND length(adult.phone_digits) >= 10
    AND p.is_child AND p.is_active AND p.merged_into_person_id IS NULL
  LIMIT 1;

  IF _phone IS NULL THEN RAISE EXCEPTION 'SKIP: no household with a phone and a child'; END IF;

  -- 6. The suggestion is present, and it is THE SAME ANSWER check-in would
  --    reach on its own. A screen that shows one classroom and then prints
  --    another is worse than a screen that shows none.
  SELECT * INTO _r FROM church.kiosk_find_household_by_phone(_sess, _phone, NULL)
   WHERE child_person_id = _child;
  IF _r.child_person_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 6: the search lost the child it used to return';
  END IF;

  SELECT room_id INTO _expected
  FROM church.pick_room_for_child(_sess, _md, _child);

  IF _r.suggested_room_id IS DISTINCT FROM _expected THEN
    RAISE EXCEPTION 'FAIL 6b: the kiosk suggests % but check-in would use %',
      _r.suggested_room_id, _expected;
  END IF;

  IF _expected IS NOT NULL AND _r.suggested_room_name IS NULL THEN
    RAISE EXCEPTION 'FAIL 6c: a suggested classroom with no name to show';
  END IF;

  -- 7. AND IT IS AN OPEN ROOM IN THIS SESSION. check_in_one_child raises
  --    room_not_open otherwise, and a raise there destroys the whole family's
  --    batch - which is why the screen must never offer a room it cannot use.
  IF _r.suggested_room_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM church.kids_session_rooms
                      WHERE kids_session_id=_sess
                        AND room_id=_r.suggested_room_id AND is_open) THEN
    RAISE EXCEPTION 'FAIL 7: the suggested classroom is not open in this session';
  END IF;

  -- 8. The suggested room is one of the rooms the parent is offered, so the
  --    screen can mark it rather than naming a room that is not in the list.
  IF _r.suggested_room_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM church.kiosk_session_rooms(_sess, NULL) k
                      WHERE k.room_id = _r.suggested_room_id) THEN
    RAISE EXCEPTION 'FAIL 8: the suggestion is not among the offered classrooms';
  END IF;

  RAISE NOTICE 'PASS 6-8 (the suggestion matches what check-in would do)';
END;
$a$;

-- 9. THE REGRESSION THIS MIGRATION COULD HAVE CAUSED, and the reason the
--    lateral join is a LEFT one: pick_room_for_child returns NO ROW when
--    nothing is open, and an inner join would then drop every child from their
--    own parent's screen - turning "no classroom is open" into "we could not
--    find that number", which sends the family to check their phone instead of
--    to a volunteer.
DO $a$
DECLARE
  _kiosk UUID := '1d64d6db-53ad-46fb-b55c-b256f3dc956c';
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _sess UUID; _phone TEXT; _before INT; _after INT; _nulls INT;
  _room UUID; _still INT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_kiosk,'role','authenticated',
      'app_metadata', json_build_object('account_type','kiosk'))::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _kiosk::TEXT, true);

  SELECT id INTO _sess FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;
  IF _sess IS NULL THEN RAISE EXCEPTION 'SKIP: no open session to test against'; END IF;

  SELECT right(adult.phone_digits,10) INTO _phone
  FROM church.people adult
  JOIN church.household_members hm_a
    ON hm_a.person_id=adult.id AND hm_a.end_date IS NULL
  JOIN church.household_members hm_c
    ON hm_c.household_id=hm_a.household_id AND hm_c.end_date IS NULL
  JOIN church.people p ON p.id=hm_c.person_id
  WHERE adult.organization_id=_md AND NOT adult.is_child AND adult.is_active
    AND adult.phone_digits IS NOT NULL AND length(adult.phone_digits) >= 10
    AND p.is_child AND p.is_active AND p.merged_into_person_id IS NULL
  LIMIT 1;
  IF _phone IS NULL THEN RAISE EXCEPTION 'SKIP: no household with a phone and a child'; END IF;

  SELECT count(*) INTO _before
    FROM church.kiosk_find_household_by_phone(_sess, _phone, NULL);

  -- Close every classroom, inside this rolled-back transaction. The SEARCH
  -- does not re-sync rooms, so this is exactly the "nothing open" state a
  -- parent can hit before a leader opens the rooms.
  UPDATE church.kids_session_rooms SET is_open=false WHERE kids_session_id=_sess;

  SELECT count(*), count(*) FILTER (WHERE suggested_room_id IS NULL)
    INTO _after, _nulls
    FROM church.kiosk_find_household_by_phone(_sess, _phone, NULL);

  IF _after <> _before THEN
    RAISE EXCEPTION 'FAIL 9: with no classroom open the search returned % children instead of %',
      _after, _before;
  END IF;
  IF _nulls <> _after THEN
    RAISE EXCEPTION 'FAIL 9b: % of % children claim a classroom while none is open',
      _after - _nulls, _after;
  END IF;

  RAISE NOTICE 'PASS 9 (no open classroom loses nobody from the screen)';

  -- 10. A ROOM A LEADER RETIRED IS NOT OFFERED. kiosk_session_rooms syncs
  --     before it lists, exactly as the desk does, so this also proves the
  --     sync closes as well as opens - and an empty retired room must leave the
  --     parent's list rather than sit there waiting to raise room_not_open.
  SELECT sr.room_id INTO _room
  FROM church.kids_session_rooms sr
  WHERE sr.kids_session_id=_sess
    AND NOT EXISTS (SELECT 1 FROM church.kids_check_ins c
                     WHERE c.kids_session_id=_sess AND c.room_id=sr.room_id
                       AND c.status='checked_in')
  LIMIT 1;

  IF _room IS NULL THEN
    RAISE NOTICE 'SKIP 10: every classroom holds a child';
    RETURN;
  END IF;

  UPDATE church.kids_session_rooms SET is_open=true WHERE kids_session_id=_sess;
  UPDATE church.room_kids_config SET is_checkin_location=false WHERE room_id=_room;

  SELECT count(*) INTO _still FROM church.kiosk_session_rooms(_sess, NULL) k
   WHERE k.room_id = _room;
  IF _still <> 0 THEN
    RAISE EXCEPTION 'FAIL 10: a retired classroom is still offered to parents';
  END IF;

  RAISE NOTICE 'PASS 10 (a retired classroom leaves the parent list)';
END;
$a$;
