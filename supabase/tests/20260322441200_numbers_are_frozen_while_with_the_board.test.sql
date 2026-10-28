-- Assertions for 20260322441200, inside BEGIN/ROLLBACK.
-- Borrowed MD members; roles put back by the rollback.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER AS this_year;

DO $setup$
DECLARE
  _md UUID; _y INTEGER; _fy UUID; _m UUID[]; _a UUID; _c UUID; _r1 UUID; _r2 UUID;
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

  SELECT user_id INTO _a FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' ORDER BY user_id LIMIT 1;
  SELECT user_id INTO _c FROM public.user_organizations
   WHERE organization_id = _md AND role = 'member' ORDER BY user_id LIMIT 1;
  UPDATE public.user_organizations SET role = 'contributor' WHERE organization_id = _md AND user_id = _c;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status, period_type)
  VALUES (_md, _fy, _m[1], _c, 'ZZ Test', 100, 'zz board', 'board_review', 'monthly')
  RETURNING id INTO _r1;
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status, period_type)
  VALUES (_md, _fy, _m[2], _c, 'ZZ Test', 100, 'zz cond', 'conditionally_approved', 'monthly')
  RETURNING id INTO _r2;

  ALTER TABLE t ADD COLUMN fy UUID, ADD COLUMN m1 UUID, ADD COLUMN a UUID, ADD COLUMN c UUID,
    ADD COLUMN r1 UUID, ADD COLUMN r2 UUID;
  UPDATE t SET fy = _fy, m1 = _m[1], a = _a, c = _c, r1 = _r1, r2 = _r2;
END;
$setup$;

-- 1. Figures frozen while with the Board; notes and status still move.
DO $a$
DECLARE r t%ROWTYPE;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  BEGIN
    UPDATE budget.allocation_requests SET requested_amount = 1 WHERE id = r.r1;
    RAISE EXCEPTION 'FAIL 1: figures changed while with the Board';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE budget.allocation_requests SET admin_notes = 'zz fine' WHERE id = r.r1;
  UPDATE budget.allocation_requests SET status = 'under_review' WHERE id = r.r1;
  UPDATE budget.allocation_requests SET requested_amount = 1 WHERE id = r.r1;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. Period amounts frozen too.
DO $a$
DECLARE r t%ROWTYPE; _r3 UUID;
BEGIN
  SELECT * INTO r FROM t;
  UPDATE budget.allocation_requests SET status = 'board_review' WHERE id = r.r2;
  UPDATE budget.allocation_requests SET status = 'conditionally_approved' WHERE id = r.r2;
  UPDATE budget.allocation_requests SET status = 'board_review' WHERE id = r.r1;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  BEGIN
    INSERT INTO budget.allocation_period_amounts (allocation_request_id, period_number, amount)
    VALUES (r.r1, 1, 5);
    RAISE EXCEPTION 'FAIL 2: a period amount was added while with the Board';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. Changing a conditionally approved request's figures takes it back.
DO $a$
DECLARE r t%ROWTYPE; _s TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  UPDATE budget.allocation_requests SET admin_notes = 'zz note' WHERE id = r.r2;
  SELECT status::TEXT INTO _s FROM budget.allocation_requests WHERE id = r.r2;
  IF _s <> 'conditionally_approved' THEN RAISE EXCEPTION 'FAIL 3: a note moved it to %', _s; END IF;
  UPDATE budget.allocation_requests SET requested_amount = 120 WHERE id = r.r2;
  SELECT status::TEXT INTO _s FROM budget.allocation_requests WHERE id = r.r2;
  IF _s <> 'under_review' THEN RAISE EXCEPTION 'FAIL 3a: figures changed, status is %', _s; END IF;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. Created only as draft or pending, as a signed-in user under RLS (an
--    admin, who is past the season lock, so it is the policy that answers).
DO $a$
DECLARE r t%ROWTYPE;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', r.a, 'role', 'authenticated')::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO budget.allocation_requests
      (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
       requested_amount, justification, status)
    VALUES (r.md, r.fy, r.m1, r.a, 'ZZ Test', 5, 'zz sneaky', 'approved');
    RAISE EXCEPTION 'FAIL 4: created an approved request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS 4';
END;
$a$;
