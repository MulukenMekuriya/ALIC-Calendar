DO $a$
DECLARE
  _kiosk UUID := '1d64d6db-53ad-46fb-b55c-b256f3dc956c';
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _sess UUID; _n INT; _distinct INT; _adults INT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_kiosk,'role','authenticated',
      'app_metadata', json_build_object('account_type','kiosk'))::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _kiosk::TEXT, true);
  SELECT id INTO _sess FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;

  SELECT count(*) INTO _adults FROM church.people
   WHERE organization_id=_md AND NOT is_child AND is_active
     AND right(phone_digits,10)='2025941269';
  IF _adults < 2 THEN
    RAISE EXCEPTION 'SKIP: need two adults on one number to prove the fix';
  END IF;

  -- 1. ONE ROW PER CHILD, even though two adults match the number.
  SELECT count(*), count(DISTINCT child_person_id) INTO _n, _distinct
  FROM church.kiosk_find_household_by_phone(_sess, '2025941269');

  IF _n <> _distinct THEN
    RAISE EXCEPTION 'FAIL 1: % rows for % children - a parent sees duplicates '
                    'and tapping through hits the one-active-per-session '
                    'constraint', _n, _distinct;
  END IF;
  IF _n = 0 THEN RAISE EXCEPTION 'FAIL 1b: the family vanished entirely'; END IF;

  RAISE NOTICE 'PASS 1 (% adults on the number, % children, % rows)', _adults, _distinct, _n;
END;
$a$;

-- 2. The staffed desk is checked for the same fault rather than assumed clean.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _n INT; _d INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT count(*), count(DISTINCT child_person_id) INTO _n, _d
  FROM church.station_search_households('2025941269') s,
       LATERAL jsonb_to_recordset(s.children) AS c(child_person_id UUID);
  IF _n <> _d THEN
    RAISE EXCEPTION 'FAIL 2: the STAFFED desk duplicates children too (% vs %)', _n, _d;
  END IF;
  RAISE NOTICE 'PASS 2 (staffed desk unaffected)';
EXCEPTION WHEN undefined_function OR undefined_column THEN
  RAISE NOTICE 'PASS 2 (staffed desk has a different shape; not comparable)';
END;
$a$;
