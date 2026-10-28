-- Assertions for 20260322441300 and 20260322441400, inside BEGIN/ROLLBACK.
-- Run with --replay for 441300; 441400 is exercised via its own test file.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER AS this_year;

DO $setup$
DECLARE
  _md UUID; _y INTEGER; _fy UUID; _m UUID[]; _b UUID; _c UUID[]; _r1 UUID; _r2 UUID;
BEGIN
  SELECT md, this_year INTO _md, _y FROM t;
  INSERT INTO budget.fiscal_years (organization_id, year, name, is_active)
  SELECT _md, _y, _y::TEXT, false
  WHERE NOT EXISTS (SELECT 1 FROM budget.fiscal_years f WHERE f.organization_id = _md AND f.year = _y);
  SELECT id INTO _fy FROM budget.fiscal_years WHERE organization_id = _md AND year = _y;

  SELECT array_agg(id) INTO _m FROM (
    SELECT m.id FROM budget.ministries m
     WHERE m.organization_id = _md AND m.is_active
       AND NOT EXISTS (SELECT 1 FROM budget.allocation_requests r WHERE r.ministry_id = m.id AND r.fiscal_year_id = _fy)
     ORDER BY m.name LIMIT 2) s;
  IF coalesce(array_length(_m, 1), 0) < 2 THEN RAISE EXCEPTION 'SKIP: fewer than two free ministries'; END IF;

  SELECT array_agg(user_id) INTO _c FROM (
    SELECT user_id FROM public.user_organizations
     WHERE organization_id = _md AND role = 'member' ORDER BY user_id LIMIT 2) s;
  IF array_length(_c, 1) < 2 THEN RAISE EXCEPTION 'SKIP: fewer than two members'; END IF;
  _b := _c[2];
  UPDATE public.user_organizations SET role = 'board' WHERE organization_id = _md AND user_id = _b;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (_md, _fy, _m[1], _c[1], 'ZZ Test', 100, 'zz pending', 'pending') RETURNING id INTO _r1;
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (_md, _fy, _m[2], _c[1], 'ZZ Test', 100, 'zz board', 'board_review') RETURNING id INTO _r2;

  ALTER TABLE t ADD COLUMN b UUID, ADD COLUMN r1 UUID, ADD COLUMN r2 UUID, ADD COLUMN a UUID;
  UPDATE t SET b = _b, r1 = _r1, r2 = _r2,
    a = (SELECT user_id FROM public.user_organizations WHERE organization_id = _md AND role = 'admin' ORDER BY user_id LIMIT 1);
END;
$setup$;

-- 1. As the Board, under row-level security: only what was sent to it.
DO $a$
DECLARE r t%ROWTYPE; _seen UUID[];
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', r.b, 'role', 'authenticated')::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  SET LOCAL ROLE authenticated;
  SELECT array_agg(id) INTO _seen FROM budget.allocation_requests WHERE id IN (r.r1, r.r2);
  RESET ROLE;
  IF _seen IS NULL OR NOT (r.r2 = ANY (_seen)) THEN
    RAISE EXCEPTION 'FAIL 1: the Board cannot see a request sent to it';
  END IF;
  IF r.r1 = ANY (_seen) THEN
    RAISE EXCEPTION 'FAIL 1a: the Board can see a pending request';
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. The local admin still sees both.
DO $a$
DECLARE r t%ROWTYPE; _n INTEGER;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', r.a, 'role', 'authenticated')::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM budget.allocation_requests WHERE id IN (r.r1, r.r2);
  RESET ROLE;
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 2: an admin sees % of 2', _n; END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;
