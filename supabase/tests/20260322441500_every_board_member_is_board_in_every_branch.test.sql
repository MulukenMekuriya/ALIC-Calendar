-- Assertions for 20260322441500, inside BEGIN/ROLLBACK.
-- Borrows two plain MD members; everything is put back by the rollback.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::UUID AS va;

DO $setup$
DECLARE _u UUID[]; _a UUID;
BEGIN
  SELECT array_agg(user_id) INTO _u FROM (
    SELECT uo.user_id FROM public.user_organizations uo
     WHERE uo.organization_id = (SELECT md FROM t) AND uo.role = 'member'
       AND NOT EXISTS (SELECT 1 FROM public.user_organizations x
                        WHERE x.user_id = uo.user_id AND x.organization_id = (SELECT va FROM t))
     ORDER BY uo.user_id LIMIT 3) s;
  IF coalesce(array_length(_u, 1), 0) < 3 THEN RAISE EXCEPTION 'SKIP: need three MD-only members'; END IF;
  ALTER TABLE t ADD COLUMN u1 UUID, ADD COLUMN u2 UUID, ADD COLUMN u3 UUID;
  UPDATE t SET u1 = _u[1], u2 = _u[2], u3 = _u[3];
END;
$setup$;

-- 1. Board in MD becomes Board in VA too, with a row made for it.
DO $a$
DECLARE r t%ROWTYPE; _role TEXT;
BEGIN
  SELECT * INTO r FROM t;
  UPDATE public.user_organizations SET role = 'board' WHERE user_id = r.u1 AND organization_id = r.md;
  SELECT role::TEXT INTO _role FROM public.user_organizations WHERE user_id = r.u1 AND organization_id = r.va;
  IF _role IS DISTINCT FROM 'board' THEN RAISE EXCEPTION 'FAIL 1: VA role is %', _role; END IF;
  IF EXISTS (SELECT 1 FROM public.user_organizations WHERE user_id = r.u1 AND organization_id = r.va AND is_primary) THEN
    RAISE EXCEPTION 'FAIL 1a: the new row took over as primary';
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. A plain member row in the other branch is upgraded, not duplicated.
DO $a$
DECLARE r t%ROWTYPE; _n INTEGER;
BEGIN
  SELECT * INTO r FROM t;
  INSERT INTO public.user_organizations (user_id, organization_id, role, email)
  SELECT r.u2, r.va, 'member', email FROM public.user_organizations WHERE user_id = r.u2 AND organization_id = r.md;
  UPDATE public.user_organizations SET role = 'board' WHERE user_id = r.u2 AND organization_id = r.md;
  SELECT count(*) INTO _n FROM public.user_organizations WHERE user_id = r.u2 AND role = 'board';
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 2: % Board rows', _n; END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. Board does not mix with a branch role: refused, naming the branch.
DO $a$
DECLARE r t%ROWTYPE; _msg TEXT;
BEGIN
  SELECT * INTO r FROM t;
  INSERT INTO public.user_organizations (user_id, organization_id, role, email)
  SELECT r.u3, r.va, 'treasury', email FROM public.user_organizations WHERE user_id = r.u3 AND organization_id = r.md;
  BEGIN
    UPDATE public.user_organizations SET role = 'board' WHERE user_id = r.u3 AND organization_id = r.md;
    RAISE EXCEPTION 'FAIL 3: made Board while treasury elsewhere';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg NOT LIKE '%treasury%' OR _msg NOT LIKE '%Springfield%' THEN
      RAISE EXCEPTION 'FAIL 3a: refused in these words: %', _msg;
    END IF;
  END;
  IF (SELECT role::TEXT FROM public.user_organizations WHERE user_id = r.u3 AND organization_id = r.md) <> 'member' THEN
    RAISE EXCEPTION 'FAIL 3b: the refused change left a trace';
  END IF;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. Taking Board away in one branch takes it away everywhere.
DO $a$
DECLARE r t%ROWTYPE; _n INTEGER;
BEGIN
  SELECT * INTO r FROM t;
  UPDATE public.user_organizations SET role = 'member' WHERE user_id = r.u1 AND organization_id = r.va;
  SELECT count(*) INTO _n FROM public.user_organizations WHERE user_id = r.u1 AND role = 'board';
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 4: % Board rows left', _n; END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. A branch created later gets every Board member.
DO $a$
DECLARE r t%ROWTYPE; _new UUID; _n INTEGER; _boards INTEGER;
BEGIN
  SELECT * INTO r FROM t;
  SELECT count(DISTINCT user_id) INTO _boards FROM public.user_organizations WHERE role = 'board';
  INSERT INTO public.organizations (name, slug) VALUES ('ZZ Test Branch', 'zz-test-branch') RETURNING id INTO _new;
  SELECT count(*) INTO _n FROM public.user_organizations WHERE organization_id = _new AND role = 'board';
  IF _n <> _boards OR _boards = 0 THEN RAISE EXCEPTION 'FAIL 5: % of % Board members joined', _n, _boards; END IF;
  RAISE NOTICE 'PASS 5';
END;
$a$;
