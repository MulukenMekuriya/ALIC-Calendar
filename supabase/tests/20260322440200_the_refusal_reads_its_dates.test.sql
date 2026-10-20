-- Assertions for 20260322440200, inside BEGIN/ROLLBACK.
--
-- The refusal names the days budget.request_window gives, in Abel's style,
-- and the function no longer carries a copy of them.

DO $a$
DECLARE
  _md CONSTANT UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _y INTEGER := extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER;
  _c UUID; _m UUID; _fy_now UUID; _fy_after UUID; _msg TEXT;
BEGIN
  IF pg_get_functiondef('budget.assert_request_season(uuid,uuid)'::regprocedure)
       ~ '(September|November) [0-9]' THEN
    RAISE EXCEPTION 'FAIL 1: the refusal still spells out a date'; END IF;

  SELECT uo.user_id INTO _c FROM public.user_organizations uo
   WHERE uo.organization_id = _md AND uo.role = 'contributor' ORDER BY uo.user_id LIMIT 1;
  SELECT id INTO _m FROM budget.ministries WHERE organization_id = _md AND is_active ORDER BY name LIMIT 1;
  INSERT INTO budget.fiscal_years (organization_id, year, name, is_active)
  SELECT _md, y, y::TEXT, false FROM generate_series(_y, _y + 2) y
  WHERE NOT EXISTS (SELECT 1 FROM budget.fiscal_years f WHERE f.organization_id = _md AND f.year = y);
  SELECT id INTO _fy_now FROM budget.fiscal_years WHERE organization_id = _md AND year = _y;
  SELECT id INTO _fy_after FROM budget.fiscal_years WHERE organization_id = _md AND year = _y + 2;

  PERFORM set_config('request.jwt.claim.sub', _c::TEXT, true);

  BEGIN
    INSERT INTO budget.allocation_requests
      (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
       requested_amount, justification, status)
    VALUES (_md, _fy_now, _m, _c, 'ZZ', 1, 'zz', 'draft');
    RAISE EXCEPTION 'FAIL 2: added to a closed year';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
    IF _msg <> format('Budget requests for %s closed on November 1, %s. '
                      || 'Please ask an administrator to make any change.', _y, _y - 1) THEN
      RAISE EXCEPTION 'FAIL 2a: %', _msg; END IF;
  END;

  BEGIN
    INSERT INTO budget.allocation_requests
      (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
       requested_amount, justification, status)
    VALUES (_md, _fy_after, _m, _c, 'ZZ', 1, 'zz', 'draft');
    RAISE EXCEPTION 'FAIL 3: added to a year not yet open';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
    IF _msg <> format('Budget requests for %s open on September 1, %s.', _y + 2, _y + 1) THEN
      RAISE EXCEPTION 'FAIL 3a: %', _msg; END IF;
  END;
  RAISE NOTICE 'PASS';
END;
$a$;
