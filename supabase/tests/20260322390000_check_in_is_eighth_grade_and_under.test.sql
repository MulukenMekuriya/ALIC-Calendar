-- Assertions for 20260322390000, inside BEGIN/ROLLBACK.
--
-- The desk and the kiosk list a family's children up to 8th grade: by
-- recorded grade, else by age, else listed.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       '0c2dd974-ba40-4d99-8db5-63804c38ed65'::UUID AS admin_u;

DO $setup$
DECLARE _md UUID; _h UUID; _mum UUID; _sess UUID; _y SMALLINT;
BEGIN
  SELECT md INTO _md FROM t;
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  -- This school year, as the helper reckons it.
  _y := (EXTRACT(YEAR FROM current_date)
         - CASE WHEN EXTRACT(MONTH FROM current_date) >= 8 THEN 0 ELSE 1 END)::SMALLINT;

  INSERT INTO church.households (organization_id, name) VALUES (_md, 'ZZ Grade Family') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child, phone)
    VALUES (_md, 'ZZMum', 'Grade', false, '202-555-0199') RETURNING id INTO _mum;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
    VALUES (_md, _h, _mum, 'head', true);

  -- Eighth grade: listed.
  WITH c AS (INSERT INTO church.people (organization_id, first_name, last_name, is_child, school_grade_id)
             SELECT _md, 'ZZEighth', 'Grade', true, g.id FROM church.school_grades g
              WHERE g.organization_id = _md AND g.code = 'g8' RETURNING id)
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
  SELECT _md, _h, c.id, 'child', true FROM c;
  -- Ninth grade: not listed.
  WITH c AS (INSERT INTO church.people (organization_id, first_name, last_name, is_child, school_grade_id)
             SELECT _md, 'ZZNinth', 'Grade', true, g.id FROM church.school_grades g
              WHERE g.organization_id = _md AND g.code = 'g9' RETURNING id)
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
  SELECT _md, _h, c.id, 'child', true FROM c;
  -- No grade, 15 by September: not listed.
  WITH c AS (INSERT INTO church.people (organization_id, first_name, last_name, is_child, birth_year, birth_month)
             VALUES (_md, 'ZZFifteen', 'Grade', true, _y - 15, 3) RETURNING id)
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
  SELECT _md, _h, c.id, 'child', true FROM c;
  -- No grade, turning 14 in October: still 13 on 1 September, listed.
  WITH c AS (INSERT INTO church.people (organization_id, first_name, last_name, is_child, birth_year, birth_month)
             VALUES (_md, 'ZZThirteen', 'Grade', true, _y - 14, 10) RETURNING id)
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
  SELECT _md, _h, c.id, 'child', true FROM c;
  -- Nothing on record: listed.
  WITH c AS (INSERT INTO church.people (organization_id, first_name, last_name, is_child)
             VALUES (_md, 'ZZUnknown', 'Grade', true) RETURNING id)
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role, is_primary_household)
  SELECT _md, _h, c.id, 'child', true FROM c;

  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id = _md
   ORDER BY session_date DESC LIMIT 1;
  ALTER TABLE t ADD COLUMN sess UUID;
  UPDATE t SET sess = _sess;
END;
$setup$;

-- 1. The desk's search.
DO $a$
DECLARE _names TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  SELECT string_agg(split_part(child_display_name, ' ', 1), ',' ORDER BY child_display_name) INTO _names
  FROM church.station_search_households('ZZ Grade Family', (SELECT sess FROM t), NULL);
  IF _names IS DISTINCT FROM 'ZZEighth,ZZThirteen,ZZUnknown' THEN
    RAISE EXCEPTION 'FAIL 1: the desk lists %', _names;
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. The kiosk, by the parent's number.
DO $a$
DECLARE _names TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);
  SELECT string_agg(split_part(child_name, ' ', 1), ',' ORDER BY child_name) INTO _names
  FROM church.kiosk_find_household_by_phone((SELECT sess FROM t), '2025550199', NULL);
  IF _names IS DISTINCT FROM 'ZZEighth,ZZThirteen,ZZUnknown' THEN
    RAISE EXCEPTION 'FAIL 2: the kiosk lists %', _names;
  END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;
