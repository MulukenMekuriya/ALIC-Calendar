-- Assertions for 20260322441700, inside BEGIN/ROLLBACK.
--
-- r1 is monthly: line 0 has Jan $500 and Feb $500, line 1 has Mar $200
-- ($1,200). r2 is annual, $1,000.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER AS this_year;

DO $setup$
DECLARE
  _md UUID; _y INTEGER; _fy UUID; _m UUID[]; _b UUID; _c UUID[]; _a UUID; _r1 UUID; _r2 UUID;
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
     ORDER BY m.name LIMIT 2) s;
  IF coalesce(array_length(_m, 1), 0) < 2 THEN RAISE EXCEPTION 'SKIP: fewer than two free ministries'; END IF;

  SELECT array_agg(user_id) INTO _c FROM (
    SELECT user_id FROM public.user_organizations
     WHERE organization_id = _md AND role = 'member' ORDER BY user_id LIMIT 2) s;
  IF array_length(_c, 1) < 2 THEN RAISE EXCEPTION 'SKIP: fewer than two members'; END IF;
  _b := _c[2];
  UPDATE public.user_organizations SET role = 'board' WHERE organization_id = _md AND user_id = _b;
  SELECT user_id INTO _a FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' ORDER BY user_id LIMIT 1;
  IF _a IS NULL THEN RAISE EXCEPTION 'SKIP: no admin'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     period_type, requested_amount, justification, budget_breakdown, status)
  VALUES (_md, _fy, _m[1], _c[1], 'ZZ Test', 'monthly', 1200, 'zz marking',
    '[{"category":"monthly_budget_item","description":"Venue","amount":1000,"monthly_data":{"jan":500,"feb":500}},
      {"category":"monthly_budget_item","description":"Snacks","amount":200,"monthly_data":{"mar":200}}]'::jsonb,
    'pending') RETURNING id INTO _r1;
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     period_type, requested_amount, justification, status)
  VALUES (_md, _fy, _m[2], _c[1], 'ZZ Test', 'annual', 1000, 'zz annual', 'pending') RETURNING id INTO _r2;

  ALTER TABLE t ADD COLUMN b UUID, ADD COLUMN a UUID, ADD COLUMN c UUID, ADD COLUMN r1 UUID,
    ADD COLUMN r2 UUID, ADD COLUMN m1 UUID, ADD COLUMN m2 UUID, ADD COLUMN fy UUID;
  UPDATE t SET b = _b, a = _a, c = _c[1], r1 = _r1, r2 = _r2, m1 = _m[1], m2 = _m[2], fy = _fy;
END;
$setup$;

-- 1. Bad markings are refused: Yellow with no reason, a cell the request does
--    not have, more than a cell holds, dollars instead of cells, all Red.
DO $a$
DECLARE r t%ROWTYPE;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  BEGIN
    PERFORM budget.council_decide(r.r1, 'conditional', NULL, NULL, NULL, NULL,
      '[{"index":0,"month":"feb","green":200,"yellow":300}]');
    RAISE EXCEPTION 'FAIL 1: yellow accepted with no reason';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM budget.council_decide(r.r1, 'conditional', NULL, NULL, NULL, 'x',
      '[{"index":1,"month":"jan","green":10,"yellow":0}]');
    RAISE EXCEPTION 'FAIL 1a: a cell with no money accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM budget.council_decide(r.r1, 'conditional', NULL, NULL, NULL, 'x',
      '[{"index":0,"month":"jan","green":400,"yellow":200},{"index":1,"month":"mar","green":0,"yellow":0}]');
    -- $600 in a $500 cell, though the request's total ($1,100) would fit.
    RAISE EXCEPTION 'FAIL 1b: more than the cell accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM budget.council_decide(r.r1, 'conditional', NULL, 600, 600, 'x');
    RAISE EXCEPTION 'FAIL 1c: a monthly request split in dollars';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM budget.council_decide(r.r1, 'conditional', NULL, NULL, NULL, NULL,
      '[{"index":0,"month":"jan","green":0,"yellow":0},{"index":0,"month":"feb","green":0,"yellow":0},
        {"index":1,"month":"mar","green":0,"yellow":0}]');
    RAISE EXCEPTION 'FAIL 1d: all red accepted as an approval';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. Unmarked is all Green. A marking is summed from its cells; cells left
--    out are Green; nothing is credited before the Board.
DO $a$
DECLARE r t%ROWTYPE; _row budget.allocation_requests;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  _row := budget.council_decide(r.r1, 'conditional');
  IF _row.green_amount <> 1200 OR _row.yellow_amount <> 0 THEN
    RAISE EXCEPTION 'FAIL 2: default % / %', _row.green_amount, _row.yellow_amount;
  END IF;
  _row := budget.council_decide(r.r1, 'conditional', 'Snacks are not needed', NULL, NULL, 'Depends on Q1 giving',
    '[{"index":0,"month":"feb","green":200,"yellow":300},{"index":1,"month":"mar","green":0,"yellow":0}]');
  IF _row.status::TEXT <> 'conditionally_approved' OR _row.green_amount <> 700
     OR _row.yellow_amount <> 300 OR jsonb_array_length(_row.split_cells) <> 3
     OR _row.admin_notes <> 'Snacks are not needed' THEN
    RAISE EXCEPTION 'FAIL 2a: % % % %', _row.status, _row.green_amount, _row.yellow_amount, _row.split_cells;
  END IF;
  IF EXISTS (SELECT 1 FROM budget.budget_allocations WHERE ministry_id = r.m1 AND fiscal_year_id = r.fy) THEN
    RAISE EXCEPTION 'FAIL 2b: credited before the Board';
  END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. Changing the figures throws the marking away and reopens the review.
DO $a$
DECLARE r t%ROWTYPE; _row budget.allocation_requests;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  UPDATE budget.allocation_requests SET requested_amount = 1100 WHERE id = r.r1 RETURNING * INTO _row;
  IF _row.status::TEXT <> 'under_review' OR _row.green_amount IS NOT NULL OR _row.split_cells IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 3: % % %', _row.status, _row.green_amount, _row.split_cells;
  END IF;
  UPDATE budget.allocation_requests SET requested_amount = 1200 WHERE id = r.r1;
  PERFORM budget.council_decide(r.r1, 'conditional', NULL, NULL, NULL, 'Depends on Q1 giving',
    '[{"index":0,"month":"feb","green":200,"yellow":300},{"index":1,"month":"mar","green":0,"yellow":0}]');
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. With the Board, nobody changes the marking; the Board cannot pass one.
DO $a$
DECLARE r t%ROWTYPE;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  IF budget.send_to_board(ARRAY[r.r1]) <> 1 THEN RAISE EXCEPTION 'FAIL 4: not sent'; END IF;
  BEGIN
    UPDATE budget.allocation_requests SET split_cells = NULL, green_amount = 1200, yellow_amount = 0 WHERE id = r.r1;
    RAISE EXCEPTION 'FAIL 4a: marking changed while with the Board';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. The Board approves the marking: partially approved, Green credited.
DO $a$
DECLARE r t%ROWTYPE; _row budget.allocation_requests; _alloc NUMERIC;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  PERFORM budget.board_decide_many(ARRAY[r.r1], 'approve');
  SELECT * INTO _row FROM budget.allocation_requests WHERE id = r.r1;
  IF _row.status::TEXT <> 'partially_approved' OR _row.approved_amount <> 700
     OR _row.green_amount <> 700 OR _row.yellow_amount <> 300 THEN
    RAISE EXCEPTION 'FAIL 5: % % % %', _row.status, _row.approved_amount, _row.green_amount, _row.yellow_amount;
  END IF;
  SELECT allocated_amount INTO _alloc FROM budget.budget_allocations
   WHERE ministry_id = r.m1 AND fiscal_year_id = r.fy;
  IF _alloc IS DISTINCT FROM 700 THEN RAISE EXCEPTION 'FAIL 5a: credited %', _alloc; END IF;
  RAISE NOTICE 'PASS 5';
END;
$a$;

-- 6. Only the local leaders move Yellow: part of a cell, then the rest in
--    bulk. Green is credited as it moves; the figures are now fixed.
DO $a$
DECLARE r t%ROWTYPE; _row budget.allocation_requests; _alloc NUMERIC; _res JSONB;
BEGIN
  SELECT * INTO r FROM t;
  FOREACH _alloc IN ARRAY ARRAY[1, 2] LOOP
    PERFORM set_config('request.jwt.claim.sub', (CASE WHEN _alloc = 1 THEN r.c ELSE r.b END)::TEXT, true);
    BEGIN
      PERFORM budget.release_yellow(r.r1);
      RAISE EXCEPTION 'FAIL 6: released by someone other than the local leaders (%)', _alloc;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  BEGIN
    PERFORM budget.release_yellow(r.r1, '[{"index":0,"month":"feb","to_green":400,"to_red":0}]');
    RAISE EXCEPTION 'FAIL 6a: released more than the cell''s Yellow';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  _row := budget.release_yellow(r.r1, '[{"index":0,"month":"feb","to_green":100,"to_red":0}]', NULL, NULL, 'December giving');
  IF _row.status::TEXT <> 'partially_approved' OR _row.green_amount <> 800 OR _row.yellow_amount <> 200 THEN
    RAISE EXCEPTION 'FAIL 6b: % % %', _row.status, _row.green_amount, _row.yellow_amount;
  END IF;

  _res := budget.release_yellow_many(ARRAY[r.r1]);
  SELECT * INTO _row FROM budget.allocation_requests WHERE id = r.r1;
  IF (_res->>'moved')::int <> 1 OR _row.green_amount <> 1000 OR _row.yellow_amount <> 0
     OR _row.yellow_reason IS NOT NULL OR _row.approved_amount <> 1000 THEN
    RAISE EXCEPTION 'FAIL 6c: % % % %', _res, _row.green_amount, _row.yellow_amount, _row.approved_amount;
  END IF;
  SELECT allocated_amount INTO _alloc FROM budget.budget_allocations
   WHERE ministry_id = r.m1 AND fiscal_year_id = r.fy;
  IF _alloc IS DISTINCT FROM 1000 THEN RAISE EXCEPTION 'FAIL 6d: credited %', _alloc; END IF;

  BEGIN
    UPDATE budget.allocation_requests SET requested_amount = 1300 WHERE id = r.r1;
    RAISE EXCEPTION 'FAIL 6e: figures changed after a month-by-month decision';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 6';
END;
$a$;

-- 7. An annual request is marked in dollars; all Yellow credits nothing
--    until it is moved.
DO $a$
DECLARE r t%ROWTYPE; _row budget.allocation_requests; _alloc NUMERIC;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  PERFORM budget.council_decide(r.r2, 'conditional', NULL, 0, 1000, 'Waiting on the building fund');
  PERFORM budget.send_to_board(ARRAY[r.r2]);
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  _row := budget.board_decide(r.r2, 'approve');
  IF _row.status::TEXT <> 'partially_approved' OR _row.approved_amount <> 0 OR _row.yellow_amount <> 1000 THEN
    RAISE EXCEPTION 'FAIL 7: % % %', _row.status, _row.approved_amount, _row.yellow_amount;
  END IF;
  IF EXISTS (SELECT 1 FROM budget.budget_allocations WHERE ministry_id = r.m2 AND fiscal_year_id = r.fy) THEN
    RAISE EXCEPTION 'FAIL 7a: credited for all yellow';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  _row := budget.release_yellow(r.r2, NULL, 1000, 0);
  IF _row.status::TEXT <> 'approved' OR _row.approved_amount <> 1000 THEN
    RAISE EXCEPTION 'FAIL 7b: % %', _row.status, _row.approved_amount;
  END IF;
  SELECT allocated_amount INTO _alloc FROM budget.budget_allocations
   WHERE ministry_id = r.m2 AND fiscal_year_id = r.fy;
  IF _alloc IS DISTINCT FROM 1000 THEN RAISE EXCEPTION 'FAIL 7c: credited %', _alloc; END IF;
  RAISE NOTICE 'PASS 7';
END;
$a$;
