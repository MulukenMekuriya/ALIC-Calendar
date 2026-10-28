-- Assertions for 20260322441400, inside BEGIN/ROLLBACK.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER AS this_year;

DO $setup$
DECLARE
  _md UUID; _y INTEGER; _fy UUID; _m UUID[]; _b UUID; _c UUID[]; _a UUID; _r1 UUID;
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
       AND NOT EXISTS (SELECT 1 FROM budget.budget_allocations b WHERE b.ministry_id = m.id AND b.fiscal_year_id = _fy)
     ORDER BY m.name LIMIT 1) s;
  IF coalesce(array_length(_m, 1), 0) < 1 THEN RAISE EXCEPTION 'SKIP: no free ministry'; END IF;

  SELECT array_agg(user_id) INTO _c FROM (
    SELECT user_id FROM public.user_organizations
     WHERE organization_id = _md AND role = 'member' ORDER BY user_id LIMIT 2) s;
  IF array_length(_c, 1) < 2 THEN RAISE EXCEPTION 'SKIP: fewer than two members'; END IF;
  _b := _c[2];
  UPDATE public.user_organizations SET role = 'board' WHERE organization_id = _md AND user_id = _b;
  SELECT user_id INTO _a FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' ORDER BY user_id LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (_md, _fy, _m[1], _c[1], 'ZZ Test', 1000, 'zz board', 'board_review') RETURNING id INTO _r1;

  ALTER TABLE t ADD COLUMN b UUID, ADD COLUMN a UUID, ADD COLUMN r1 UUID, ADD COLUMN m1 UUID, ADD COLUMN fy UUID;
  UPDATE t SET b = _b, a = _a, r1 = _r1, m1 = _m[1], fy = _fy;
END;
$setup$;

-- 1. Where a Board exists, the admin who edits the numbers cannot approve them.
DO $a$
DECLARE r t%ROWTYPE;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  BEGIN
    PERFORM budget.board_decide(r.r1, 'approve');
    RAISE EXCEPTION 'FAIL 1: an admin approved in a branch with a Board';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. The Board's approval is exactly what was requested, whatever it passes,
--    and the credit is added.
DO $a$
DECLARE r t%ROWTYPE; _row budget.allocation_requests; _alloc NUMERIC;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  _row := budget.board_decide(r.r1, 'approve', 250);
  IF _row.status::TEXT <> 'approved' OR _row.approved_amount <> 1000 THEN
    RAISE EXCEPTION 'FAIL 2: % for %', _row.status, _row.approved_amount;
  END IF;
  SELECT allocated_amount INTO _alloc FROM budget.budget_allocations
   WHERE ministry_id = r.m1 AND fiscal_year_id = r.fy;
  IF _alloc <> 1000 THEN RAISE EXCEPTION 'FAIL 2a: credited %', _alloc; END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;
