-- Assertions for 20260322441000, inside BEGIN/ROLLBACK.
--
-- After the migration, no staff login opens on a branch where it is only a
-- member; the Board is Board in both branches and defaults to MD.
--
-- The first check is general, so it also guards against the next login that
-- handle_new_user leaves like this. The rest are the two named people, and
-- SKIP quietly if they no longer exist.

-- 1. Nobody with a staff role anywhere has, as their default branch, a branch
--    where they are only a 'member'.
DO $a$
DECLARE _bad TEXT;
BEGIN
  SELECT string_agg(u.email, ', ') INTO _bad
  FROM public.user_organizations s
  JOIN public.profiles p ON p.id = s.user_id
  JOIN auth.users u ON u.id = s.user_id
  JOIN public.user_organizations d
    ON d.user_id = s.user_id AND d.organization_id = p.default_organization_id
  WHERE s.role <> 'member' AND d.role = 'member';
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: staff opening on a member-only branch: %', _bad;
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. The Board is Board in both branches, with one primary membership, in MD.
DO $a$
DECLARE _id UUID; _roles TEXT; _prim TEXT; _def UUID;
BEGIN
  SELECT id INTO _id FROM auth.users WHERE lower(email) = 'board@alic.org';
  IF _id IS NULL THEN RAISE NOTICE 'SKIP 2: no board@alic.org'; RETURN; END IF;

  SELECT string_agg(o.name || '=' || uo.role, ', ' ORDER BY o.name),
         string_agg(o.name, ', ') FILTER (WHERE uo.is_primary)
    INTO _roles, _prim
  FROM public.user_organizations uo JOIN public.organizations o ON o.id = uo.organization_id
  WHERE uo.user_id = _id;

  IF _roles <> 'ALIC MD - Silver Spring=board, ALIC VA - Springfield=board' THEN
    RAISE EXCEPTION 'FAIL 2: the Board holds %', _roles; END IF;
  IF _prim IS DISTINCT FROM 'ALIC MD - Silver Spring' THEN
    RAISE EXCEPTION 'FAIL 2a: primary branch is %', _prim; END IF;

  SELECT default_organization_id INTO _def FROM public.profiles WHERE id = _id;
  IF _def <> 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' THEN
    RAISE EXCEPTION 'FAIL 2b: the Board opens on %', _def; END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. The VA contributor opens on VA.
DO $a$
DECLARE _id UUID; _def UUID;
BEGIN
  SELECT id INTO _id FROM auth.users WHERE lower(email) = 'biruckfeysa@gmail.com';
  IF _id IS NULL THEN RAISE NOTICE 'SKIP 3: no biruckfeysa@gmail.com'; RETURN; END IF;
  SELECT default_organization_id INTO _def FROM public.profiles WHERE id = _id;
  IF _def <> 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' THEN
    RAISE EXCEPTION 'FAIL 3: the VA contributor opens on %', _def; END IF;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. The Board, signed in, now sees the fiscal years of both branches (it
--    saw MD's three and VA's none), and VA's requests are no longer hidden
--    by the members-only policy (it has none to show yet, so the check is
--    on the years).
DO $a$
DECLARE _id UUID; _n INTEGER;
BEGIN
  SELECT id INTO _id FROM auth.users WHERE lower(email) = 'board@alic.org';
  IF _id IS NULL THEN RAISE NOTICE 'SKIP 4: no board@alic.org'; RETURN; END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _id, 'role', 'authenticated')::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _id::TEXT, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO _n FROM budget.fiscal_years
   WHERE organization_id = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  RESET ROLE;
  IF _n < 3 THEN RAISE EXCEPTION 'FAIL 4: the Board sees % VA fiscal years', _n; END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;
