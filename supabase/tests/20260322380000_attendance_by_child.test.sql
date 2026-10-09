-- Assertions for 20260322380000, inside BEGIN/ROLLBACK.
--
-- One row per child per date, every child checked in on it, and nobody
-- outside the kids leaders reads it.

-- 1. Every child checked in on each date, once.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _from DATE := current_date - 84;
  _to DATE := current_date;
  _mismatch RECORD;
  _rows INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0c2dd974-ba40-4d99-8db5-63804c38ed65', true);

  SELECT count(*) INTO _rows FROM church.kids_child_attendance(_md, _from, _to);
  IF _rows = 0 THEN RAISE EXCEPTION 'SKIP: no check-ins in the last 12 weeks'; END IF;

  -- One row per child per date.
  IF EXISTS (SELECT 1 FROM church.kids_child_attendance(_md, _from, _to)
             GROUP BY child_person_id, session_date HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'FAIL 1: a child appears twice on one date';
  END IF;

  -- Exactly the distinct children checked in on each date. Not the room
  -- report's sum: a child checked in to two rooms on one date (a test
  -- session did this on 2 October) counts once per room there, and once here.
  SELECT a.d, a.n AS by_child, b.n AS by_room INTO _mismatch
  FROM (SELECT session_date d, count(*) n FROM church.kids_child_attendance(_md, _from, _to) GROUP BY 1) a
  FULL JOIN (SELECT s.session_date d, count(DISTINCT c.child_person_id) n
               FROM church.kids_sessions s
               JOIN church.kids_check_ins c ON c.kids_session_id = s.id
              WHERE s.organization_id = _md AND s.session_date BETWEEN _from AND _to
              GROUP BY 1) b ON b.d = a.d
  WHERE a.n IS DISTINCT FROM b.n
  LIMIT 1;
  IF _mismatch.d IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1a: % children on % by child, % checked in', _mismatch.by_child, _mismatch.d, _mismatch.by_room;
  END IF;

  -- A first check-in is never after a date the child came.
  IF EXISTS (SELECT 1 FROM church.kids_child_attendance(_md, _from, _to)
             WHERE first_check_in IS NULL OR first_check_in > session_date) THEN
    RAISE EXCEPTION 'FAIL 1b: a first check-in is missing or after a visit';
  END IF;
  RAISE NOTICE 'PASS 1 (% rows)', _rows;
END;
$a$;

-- 2. Nobody outside the kids leaders reads it.
DO $a$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, true);
  BEGIN
    PERFORM * FROM church.kids_child_attendance(
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', current_date - 84, current_date);
    RAISE EXCEPTION 'FAIL 2: a stranger read the children''s attendance';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'FAIL 2%' THEN RAISE; END IF;
  END;
  IF has_function_privilege('anon', 'church.kids_child_attendance(uuid,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 2a: anon can read it';
  END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;
