-- Assertions for 20260322441100, inside BEGIN/ROLLBACK.
--
-- Rounds, the Board's bulk decision, month edits, and the Board's totals.
-- Roles are borrowed from plain MD members and put back by the rollback.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER AS this_year;

DO $setup$
DECLARE
  _md UUID; _y INTEGER; _fy UUID;
  _m UUID[]; _a UUID; _c UUID; _b UUID; _mem UUID; _borrowed UUID[];
  _r1 UUID; _r2 UUID; _r3 UUID;
  _bd JSONB := jsonb_build_array(
    jsonb_build_object('category','monthly_budget_item','description','Supplies','amount',300,
      'monthly_data', jsonb_build_object('chart_of_accounts','x','jan',100,'feb',200)),
    jsonb_build_object('category','monthly_budget_item','description','Travel','amount',50,
      'monthly_data', jsonb_build_object('chart_of_accounts','x','jan',50)));
BEGIN
  SELECT md, this_year INTO _md, _y FROM t;

  INSERT INTO budget.fiscal_years (organization_id, year, name, is_active)
  SELECT _md, _y, _y::TEXT, false
  WHERE NOT EXISTS (SELECT 1 FROM budget.fiscal_years f WHERE f.organization_id = _md AND f.year = _y);
  SELECT id INTO _fy FROM budget.fiscal_years WHERE organization_id = _md AND year = _y;

  -- Three ministries with no request or allocation this year.
  SELECT array_agg(id) INTO _m FROM (
    SELECT m.id FROM budget.ministries m
     WHERE m.organization_id = _md AND m.is_active
       AND NOT EXISTS (SELECT 1 FROM budget.allocation_requests r WHERE r.ministry_id = m.id AND r.fiscal_year_id = _fy)
       AND NOT EXISTS (SELECT 1 FROM budget.budget_allocations b WHERE b.ministry_id = m.id AND b.fiscal_year_id = _fy)
     ORDER BY m.name LIMIT 3) s;
  IF coalesce(array_length(_m, 1), 0) < 3 THEN
    RAISE EXCEPTION 'SKIP: fewer than three free ministries in MD';
  END IF;

  SELECT user_id INTO _a FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' ORDER BY user_id LIMIT 1;
  SELECT array_agg(user_id) INTO _borrowed FROM (
    SELECT user_id FROM public.user_organizations
     WHERE organization_id = _md AND role = 'member' ORDER BY user_id LIMIT 3) s;
  IF coalesce(array_length(_borrowed, 1), 0) < 3 THEN
    RAISE EXCEPTION 'SKIP: fewer than three members in MD to borrow';
  END IF;
  _c := _borrowed[1]; _b := _borrowed[2]; _mem := _borrowed[3];
  UPDATE public.user_organizations SET role = 'contributor' WHERE organization_id = _md AND user_id = _c;
  UPDATE public.user_organizations SET role = 'board'       WHERE organization_id = _md AND user_id = _b;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status, period_type, budget_breakdown)
  VALUES (_md, _fy, _m[1], _c, 'ZZ Test', 350, 'zz one', 'conditionally_approved', 'monthly', _bd)
  RETURNING id INTO _r1;
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status, period_type, budget_breakdown)
  VALUES (_md, _fy, _m[2], _c, 'ZZ Test', 350, 'zz two', 'conditionally_approved', 'monthly', _bd)
  RETURNING id INTO _r2;
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (_md, _fy, _m[3], _c, 'ZZ Test', 90, 'zz three', 'pending')
  RETURNING id INTO _r3;

  -- A credit the approval must add to, not collide with.
  INSERT INTO budget.budget_allocations (organization_id, ministry_id, fiscal_year_id, allocated_amount)
  VALUES (_md, _m[1], _fy, 50);

  ALTER TABLE t ADD COLUMN fy UUID, ADD COLUMN m1 UUID, ADD COLUMN a UUID, ADD COLUMN c UUID,
    ADD COLUMN b UUID, ADD COLUMN mem UUID, ADD COLUMN r1 UUID, ADD COLUMN r2 UUID, ADD COLUMN r3 UUID;
  UPDATE t SET fy = _fy, m1 = _m[1], a = _a, c = _c, b = _b, mem = _mem, r1 = _r1, r2 = _r2, r3 = _r3;
END;
$setup$;

-- 1. Sending to the Board counts the round, and says which in the history.
DO $a$
DECLARE r t%ROWTYPE; _n INTEGER; _round INTEGER;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  _n := budget.send_to_board(ARRAY[r.r1, r.r2, r.r3]);
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 1: % moved, expected 2 (the pending one stays)', _n; END IF;
  SELECT board_round INTO _round FROM budget.allocation_requests WHERE id = r.r1;
  IF _round <> 1 THEN RAISE EXCEPTION 'FAIL 1a: round is %', _round; END IF;
  IF (SELECT board_round FROM budget.allocation_requests WHERE id = r.r3) <> 0 THEN
    RAISE EXCEPTION 'FAIL 1b: an unmoved request had its round counted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM budget.allocation_request_history
                 WHERE request_id = r.r1 AND action = 'sent_to_board' AND notes = 'Round 1') THEN
    RAISE EXCEPTION 'FAIL 1c: the history does not name the round';
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. Feedback: only while with the Board, round taken from the request,
--    never negative.
DO $a$
DECLARE r t%ROWTYPE; _round INTEGER; _msg TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);

  INSERT INTO budget.allocation_board_feedback
    (request_id, organization_id, board_member_id, board_member_name, recommended_amount, comment, round)
  VALUES (r.r1, r.md, r.b, 'ZZ Board', 300, 'trim', 7);
  SELECT round INTO _round FROM budget.allocation_board_feedback WHERE request_id = r.r1;
  IF _round <> 1 THEN RAISE EXCEPTION 'FAIL 2: round came from the client: %', _round; END IF;

  BEGIN
    INSERT INTO budget.allocation_board_feedback
      (request_id, organization_id, board_member_id, board_member_name, recommended_amount, comment)
    VALUES (r.r3, r.md, r.b, 'ZZ Board', 10, 'too early');
    RAISE EXCEPTION 'FAIL 2a: feedback on a pending request';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE budget.allocation_board_feedback SET recommended_amount = -5 WHERE request_id = r.r1;
    RAISE EXCEPTION 'FAIL 2b: a negative recommendation';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. While with the Board a request cannot be edited by a leader.
DO $a$
DECLARE r t%ROWTYPE;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  BEGIN
    PERFORM budget.edit_request_month(r.r2, 'jan', '[{"index":0,"amount":1}]'::jsonb);
    RAISE EXCEPTION 'FAIL 3: edited a request that is with the Board';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. Bulk Final approval: exactly the requested amount, credited on top of
--    what was there; a request not with the Board and a stranger are skipped
--    with a reason, and the rest still go.
DO $a$
DECLARE r t%ROWTYPE; _res JSONB; _alloc NUMERIC; _approved NUMERIC;
BEGIN
  SELECT * INTO r FROM t;

  -- An admin, who is past the season lock, is still not the Board.
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  _res := budget.board_decide_many(ARRAY[r.r1], 'approve');
  IF (_res->>'moved')::int <> 0 OR jsonb_array_length(_res->'skipped') <> 1 THEN
    RAISE EXCEPTION 'FAIL 4: a non-Board user decided: %', _res;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  _res := budget.board_decide_many(ARRAY[r.r1, r.r3, gen_random_uuid()], 'approve');
  IF (_res->>'moved')::int <> 1 OR jsonb_array_length(_res->'skipped') <> 2 THEN
    RAISE EXCEPTION 'FAIL 4a: %', _res;
  END IF;
  SELECT approved_amount INTO _approved FROM budget.allocation_requests WHERE id = r.r1;
  IF _approved <> 350 THEN RAISE EXCEPTION 'FAIL 4b: approved %', _approved; END IF;
  SELECT allocated_amount INTO _alloc FROM budget.budget_allocations
   WHERE ministry_id = r.m1 AND fiscal_year_id = r.fy;
  IF _alloc <> 400 THEN RAISE EXCEPTION 'FAIL 4c: allocation is % (50 + 350)', _alloc; END IF;

  -- Twice is not twice the money.
  _res := budget.board_decide_many(ARRAY[r.r1], 'approve');
  IF (_res->>'moved')::int <> 0 THEN RAISE EXCEPTION 'FAIL 4d: approved twice'; END IF;
  SELECT allocated_amount INTO _alloc FROM budget.budget_allocations
   WHERE ministry_id = r.m1 AND fiscal_year_id = r.fy;
  IF _alloc <> 400 THEN RAISE EXCEPTION 'FAIL 4e: allocation became %', _alloc; END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. Send back needs a note, goes to under_review, and keeps the note in the
--    history rather than in the admin notes the ministry reads.
DO $a$
DECLARE r t%ROWTYPE; _res JSONB; _status TEXT; _admin_notes TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  BEGIN
    PERFORM budget.board_decide_many(ARRAY[r.r2], 'return', '   ');
    RAISE EXCEPTION 'FAIL 5: sent back without a note';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  _res := budget.board_decide_many(ARRAY[r.r2], 'return', 'Trim travel');
  SELECT status::TEXT, admin_notes INTO _status, _admin_notes FROM budget.allocation_requests WHERE id = r.r2;
  IF (_res->>'moved')::int <> 1 OR _status <> 'under_review' THEN
    RAISE EXCEPTION 'FAIL 5a: % / %', _res, _status;
  END IF;
  IF _admin_notes IS NOT NULL THEN RAISE EXCEPTION 'FAIL 5b: the note leaked to admin_notes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM budget.allocation_request_history
                 WHERE request_id = r.r2 AND action = 'returned_to_council' AND notes = 'Trim travel') THEN
    RAISE EXCEPTION 'FAIL 5c: no history of the note';
  END IF;
  RAISE NOTICE 'PASS 5';
END;
$a$;

-- 6. A leader edits one month: totals recomputed here, history written,
--    stale and out-of-role edits refused.
DO $a$
DECLARE r t%ROWTYPE; _row budget.allocation_requests; _stale TIMESTAMPTZ; _line NUMERIC;
BEGIN
  SELECT * INTO r FROM t;

  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  BEGIN
    PERFORM budget.edit_request_month(r.r2, 'jan', '[{"index":0,"amount":1}]'::jsonb);
    RAISE EXCEPTION 'FAIL 6: the Board edited a number';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  SELECT updated_at INTO _stale FROM budget.allocation_requests WHERE id = r.r2;
  _row := budget.edit_request_month(r.r2, 'jan', '[{"index":0,"amount":150},{"index":1,"amount":0}]'::jsonb, _stale);
  IF _row.requested_amount <> 350 THEN
    -- jan: 150 + 0, feb: 200 -> 350 on line 0 alone
    RAISE EXCEPTION 'FAIL 6a: total is %', _row.requested_amount;
  END IF;
  _line := (_row.budget_breakdown->0->>'amount')::numeric;
  IF _line <> 350 THEN RAISE EXCEPTION 'FAIL 6b: line total %', _line; END IF;
  IF (_row.budget_breakdown->1->'monthly_data') ? 'jan' THEN
    RAISE EXCEPTION 'FAIL 6c: a zeroed month was kept';
  END IF;
  IF _row.status::TEXT <> 'under_review' THEN RAISE EXCEPTION 'FAIL 6d: status %', _row.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM budget.allocation_request_history
                 WHERE request_id = r.r2 AND action = 'month_edited') THEN
    RAISE EXCEPTION 'FAIL 6e: no history';
  END IF;

  BEGIN
    PERFORM budget.edit_request_month(r.r2, 'jan', '[{"index":0,"amount":1}]'::jsonb, _stale - interval '1 second');
    RAISE EXCEPTION 'FAIL 6f: a stale edit went through';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    PERFORM budget.edit_request_month(r.r2, 'jan', '[{"index":0,"amount":-1}]'::jsonb);
    RAISE EXCEPTION 'FAIL 6g: a negative month';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM budget.edit_request_month(r.r1, 'jan', '[{"index":0,"amount":1}]'::jsonb);
    RAISE EXCEPTION 'FAIL 6h: edited an approved request';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS 6';
END;
$a$;

-- 7. The Board's totals: per ministry, for its own branches, for staff only.
DO $a$
DECLARE r t%ROWTYPE; _approved NUMERIC;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  SELECT approved INTO _approved FROM budget.ministry_budget_summary(r.this_year)
   WHERE ministry_id = r.m1 AND organization_id = r.md;
  IF _approved IS DISTINCT FROM 400 THEN
    RAISE EXCEPTION 'FAIL 7: the Board sees % for the ministry, expected 400', _approved;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', r.c::TEXT, true);
  BEGIN
    PERFORM * FROM budget.ministry_budget_summary(r.this_year);
    RAISE EXCEPTION 'FAIL 7a: a contributor read the summary';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 7';
END;
$a$;
