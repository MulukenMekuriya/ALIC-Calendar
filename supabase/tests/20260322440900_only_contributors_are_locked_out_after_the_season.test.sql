-- Assertions for 20260322440900, inside BEGIN/ROLLBACK.
--
-- After a request's season is over, a contributor is locked out and admin,
-- treasury, finance and the Board are not. The case that matters is the
-- Board's own decision: board_decide runs as the Board user, and from the end
-- of 1 November it would have been refused.
--
-- Uses THIS year's budget year as the closed one: its season ended in
-- November of last year, so it is closed whatever day this runs. Roles are
-- borrowed from members and put back by the rollback.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER AS this_year;

DO $setup$
DECLARE
  _md UUID; _y INTEGER;
  _fy UUID; _m UUID; _req UUID;
  _a UUID; _c UUID; _t UUID; _f UUID; _b UUID; _mem UUID;
  _borrowed UUID[];
BEGIN
  SELECT md, this_year INTO _md, _y FROM t;

  INSERT INTO budget.fiscal_years (organization_id, year, name, is_active)
  SELECT _md, _y, _y::TEXT, false
  WHERE NOT EXISTS (SELECT 1 FROM budget.fiscal_years f
                    WHERE f.organization_id = _md AND f.year = _y);
  SELECT id INTO _fy FROM budget.fiscal_years WHERE organization_id = _md AND year = _y;
  SELECT id INTO _m FROM budget.ministries
   WHERE organization_id = _md AND is_active ORDER BY name LIMIT 1;

  SELECT user_id INTO _a FROM public.user_organizations
   WHERE organization_id = _md AND role = 'admin' ORDER BY user_id LIMIT 1;

  -- Five plain members, borrowed and given the other roles inside the
  -- transaction; the sixth stays a member.
  SELECT array_agg(user_id) INTO _borrowed FROM (
    SELECT user_id FROM public.user_organizations
     WHERE organization_id = _md AND role = 'member' ORDER BY user_id LIMIT 5) s;
  IF coalesce(array_length(_borrowed, 1), 0) < 5 THEN
    RAISE EXCEPTION 'SKIP: fewer than five members in MD to borrow';
  END IF;
  _c := _borrowed[1]; _t := _borrowed[2]; _f := _borrowed[3]; _b := _borrowed[4]; _mem := _borrowed[5];

  UPDATE public.user_organizations SET role = 'contributor' WHERE organization_id = _md AND user_id = _c;
  UPDATE public.user_organizations SET role = 'treasury'    WHERE organization_id = _md AND user_id = _t;
  UPDATE public.user_organizations SET role = 'finance'     WHERE organization_id = _md AND user_id = _f;
  UPDATE public.user_organizations SET role = 'board'       WHERE organization_id = _md AND user_id = _b;

  -- A request waiting with the Board in the closed year, made with nobody
  -- signed in, as a job would.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (_md, _fy, _m, _c, 'ZZ Test', 100, 'zz closed year', 'board_review')
  RETURNING id INTO _req;

  ALTER TABLE t ADD COLUMN req UUID; ALTER TABLE t ADD COLUMN a UUID;
  ALTER TABLE t ADD COLUMN c UUID; ALTER TABLE t ADD COLUMN tr UUID;
  ALTER TABLE t ADD COLUMN f UUID; ALTER TABLE t ADD COLUMN b UUID;
  ALTER TABLE t ADD COLUMN mem UUID;
  UPDATE t SET req = _req, a = _a, c = _c, tr = _t, f = _f, b = _b, mem = _mem;
END;
$setup$;

-- 1. The lock still holds against a contributor, in the same words as before.
DO $a$
DECLARE r t%ROWTYPE; _msg TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.c::TEXT, true);
  BEGIN
    UPDATE budget.allocation_requests SET requested_amount = 200 WHERE id = r.req;
    RAISE EXCEPTION 'FAIL 1: a contributor changed a closed request';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
    IF _msg <> format('Budget requests for %s closed on November 1, %s. '
                      || 'Please ask an administrator to make any change.',
                      r.this_year, r.this_year - 1) THEN
      RAISE EXCEPTION 'FAIL 1a: refused, but in these words: %', _msg;
    END IF;
  END;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. The exemption is a list of roles, not "anyone who is not a contributor":
--    a plain member is still refused.
DO $a$
DECLARE r t%ROWTYPE; _msg TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.mem::TEXT, true);
  BEGIN
    UPDATE budget.allocation_requests SET requested_amount = 200 WHERE id = r.req;
    RAISE EXCEPTION 'FAIL 2: a member changed a closed request';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. Admin, treasury, finance and the Board can each change a closed request.
DO $a$
DECLARE r t%ROWTYPE; _who TEXT; _uid UUID;
BEGIN
  SELECT * INTO r FROM t;
  FOR _who, _uid IN SELECT 'admin', r.a UNION ALL SELECT 'treasury', r.tr
                    UNION ALL SELECT 'finance', r.f UNION ALL SELECT 'board', r.b LOOP
    PERFORM set_config('request.jwt.claim.sub', _uid::TEXT, true);
    BEGIN
      UPDATE budget.allocation_requests SET admin_notes = 'zz ' || _who WHERE id = r.req;
    EXCEPTION WHEN raise_exception THEN
      RAISE EXCEPTION 'FAIL 3: % was refused on a closed request', _who;
    END;
    IF (SELECT admin_notes FROM budget.allocation_requests WHERE id = r.req) <> 'zz ' || _who THEN
      RAISE EXCEPTION 'FAIL 3a: % update did not land', _who;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. The Board's real path. board_decide, called as the Board user, approves
--    a request in a closed season. This is the call that would have failed on
--    2 November.
DO $a$
DECLARE r t%ROWTYPE; _status TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', r.b::TEXT, true);
  PERFORM budget.board_decide(r.req, 'approve', NULL, 'zz approved after the season');
  SELECT status::TEXT INTO _status FROM budget.allocation_requests WHERE id = r.req;
  IF _status <> 'approved' THEN
    RAISE EXCEPTION 'FAIL 4: the Board''s approval left the request %', _status;
  END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. The screen is told the same thing the database enforces.
DO $a$
DECLARE r t%ROWTYPE; _who TEXT; _uid UUID; _can BOOLEAN;
BEGIN
  SELECT * INTO r FROM t;
  FOR _who, _uid IN SELECT 'admin', r.a UNION ALL SELECT 'treasury', r.tr
                    UNION ALL SELECT 'finance', r.f UNION ALL SELECT 'board', r.b LOOP
    PERFORM set_config('request.jwt.claim.sub', _uid::TEXT, true);
    SELECT can_bypass INTO _can FROM budget.request_season(r.md);
    IF _can IS NOT TRUE THEN
      RAISE EXCEPTION 'FAIL 5: can_bypass is % for %', _can, _who;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', r.c::TEXT, true);
  SELECT can_bypass INTO _can FROM budget.request_season(r.md);
  IF _can IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL 5a: can_bypass is % for a contributor', _can;
  END IF;
  RAISE NOTICE 'PASS 5';
END;
$a$;
