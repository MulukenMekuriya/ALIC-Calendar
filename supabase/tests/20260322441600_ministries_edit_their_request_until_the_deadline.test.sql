-- Assertions for 20260322441600, inside BEGIN/ROLLBACK, as a real contributor
-- under row-level security. Needs the budget season to be open.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md;

DO $setup$
DECLARE
  _md UUID; _season RECORD; _m UUID[]; _c UUID[]; _r1 UUID; _r2 UUID; _r3 UUID;
BEGIN
  SELECT md INTO _md FROM t;
  PERFORM set_config('request.jwt.claim.sub',
    (SELECT user_id::TEXT FROM public.user_organizations WHERE organization_id = _md AND role = 'admin' ORDER BY user_id LIMIT 1), true);
  SELECT * INTO _season FROM budget.request_season(_md);
  IF _season.state IS DISTINCT FROM 'open' OR _season.fiscal_year_id IS NULL THEN
    RAISE EXCEPTION 'SKIP: the budget season is not open';
  END IF;

  SELECT array_agg(id) INTO _m FROM (
    SELECT m.id FROM budget.ministries m
     WHERE m.organization_id = _md AND m.is_active
       AND NOT EXISTS (SELECT 1 FROM budget.allocation_requests r WHERE r.ministry_id = m.id AND r.fiscal_year_id = _season.fiscal_year_id)
     ORDER BY m.name LIMIT 3) s;
  IF coalesce(array_length(_m, 1), 0) < 3 THEN RAISE EXCEPTION 'SKIP: fewer than three free ministries'; END IF;

  SELECT array_agg(user_id) INTO _c FROM (
    SELECT user_id FROM public.user_organizations
     WHERE organization_id = _md AND role = 'member' ORDER BY user_id LIMIT 2) s;
  UPDATE public.user_organizations SET role = 'contributor' WHERE organization_id = _md AND user_id = ANY (_c);

  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name, requested_amount, justification, status)
  VALUES (_md, _season.fiscal_year_id, _m[1], _c[1], 'ZZ', 100, 'zz review', 'under_review') RETURNING id INTO _r1;
  INSERT INTO budget.allocation_requests (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name, requested_amount, justification, status)
  VALUES (_md, _season.fiscal_year_id, _m[2], _c[1], 'ZZ', 100, 'zz cond', 'conditionally_approved') RETURNING id INTO _r2;
  INSERT INTO budget.allocation_requests (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name, requested_amount, justification, status)
  VALUES (_md, _season.fiscal_year_id, _m[3], _c[1], 'ZZ', 100, 'zz board', 'board_review') RETURNING id INTO _r3;

  ALTER TABLE t ADD COLUMN c1 UUID, ADD COLUMN c2 UUID, ADD COLUMN r1 UUID, ADD COLUMN r2 UUID, ADD COLUMN r3 UUID;
  UPDATE t SET c1 = _c[1], c2 = _c[2], r1 = _r1, r2 = _r2, r3 = _r3;
END;
$setup$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_u UUID) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _u, 'role', 'authenticated')::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _u::TEXT, true);
END;
$f$;

-- 1. A ministry changes its request while it is under review, and it is logged.
DO $a$
DECLARE r t%ROWTYPE; _n INTEGER; _amt NUMERIC;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM pg_temp.as_user(r.c1);
  SET LOCAL ROLE authenticated;
  UPDATE budget.allocation_requests SET requested_amount = 150 WHERE id = r.r1;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE;
  SELECT requested_amount INTO _amt FROM budget.allocation_requests WHERE id = r.r1;
  IF _n <> 1 OR _amt <> 150 THEN RAISE EXCEPTION 'FAIL 1: rows %, amount %', _n, _amt; END IF;
  IF NOT EXISTS (SELECT 1 FROM budget.allocation_request_history WHERE request_id = r.r1 AND action = 'edited_by_requester') THEN
    RAISE EXCEPTION 'FAIL 1a: no history line';
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. Changing a conditionally approved request's figures takes it back.
DO $a$
DECLARE r t%ROWTYPE; _s TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM pg_temp.as_user(r.c1);
  SET LOCAL ROLE authenticated;
  UPDATE budget.allocation_requests SET requested_amount = 90 WHERE id = r.r2;
  RESET ROLE;
  SELECT status::TEXT INTO _s FROM budget.allocation_requests WHERE id = r.r2;
  IF _s <> 'under_review' THEN RAISE EXCEPTION 'FAIL 2: status %', _s; END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. Not how it was decided: status, approved amount, notes.
DO $a$
DECLARE r t%ROWTYPE; _what TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM pg_temp.as_user(r.c1);
  FOREACH _what IN ARRAY ARRAY['status', 'approved_amount', 'admin_notes'] LOOP
    SET LOCAL ROLE authenticated;
    BEGIN
      IF _what = 'status' THEN
        UPDATE budget.allocation_requests SET status = 'approved' WHERE id = r.r1;
      ELSIF _what = 'approved_amount' THEN
        UPDATE budget.allocation_requests SET approved_amount = 5000 WHERE id = r.r1;
      ELSE
        UPDATE budget.allocation_requests SET admin_notes = 'approved by me' WHERE id = r.r1;
      END IF;
      RESET ROLE;
      RAISE EXCEPTION 'FAIL 3: a ministry set %', _what;
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      RESET ROLE;
    END;
  END LOOP;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. Not somebody else's request, and not one that is with the Board.
DO $a$
DECLARE r t%ROWTYPE; _n INTEGER;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM pg_temp.as_user(r.c2);
  SET LOCAL ROLE authenticated;
  UPDATE budget.allocation_requests SET requested_amount = 1 WHERE id = r.r1;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 4: edited another ministry''s request'; END IF;

  PERFORM pg_temp.as_user(r.c1);
  SET LOCAL ROLE authenticated;
  UPDATE budget.allocation_requests SET requested_amount = 1 WHERE id = r.r3;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RESET ROLE;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 4a: edited a request that is with the Board'; END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;
