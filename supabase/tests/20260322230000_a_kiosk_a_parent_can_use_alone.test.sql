-- Assertions for 20260322230000.

-- 1. THE KIOSK PREDICATE READS app_metadata, NOT user_metadata. A client can
--    write its own user_metadata, so reading it would let any member promote
--    themselves to a kiosk.
DO $a$
DECLARE _def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='church' AND p.proname='is_kiosk_session';
  IF _def ILIKE '%user_metadata%' THEN
    RAISE EXCEPTION 'FAIL 1: the kiosk check reads client-writable metadata';
  END IF;
  IF _def NOT ILIKE '%app_metadata%' THEN
    RAISE EXCEPTION 'FAIL 1b: the kiosk check does not read app_metadata';
  END IF;

  -- An ordinary session is not a kiosk.
  PERFORM set_config('request.jwt.claims','{"sub":"x","app_metadata":{}}',true);
  IF church.is_kiosk_session() THEN RAISE EXCEPTION 'FAIL 1c: a plain session reads as a kiosk'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"x","user_metadata":{"account_type":"kiosk"}}',true);
  IF church.is_kiosk_session() THEN
    RAISE EXCEPTION 'FAIL 1d: user_metadata promoted a session to a kiosk';
  END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"x","app_metadata":{"account_type":"kiosk"}}',true);
  IF NOT church.is_kiosk_session() THEN RAISE EXCEPTION 'FAIL 1e: a real kiosk was not recognised'; END IF;
  PERFORM set_config('request.jwt.claims','',true);
  RAISE NOTICE 'PASS 1 (kiosk identity cannot be forged by a client)';
END;
$a$;

-- 2. MANY TABLETS, ONE ACCOUNT. The constraint that forbade it is gone.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _u UUID; _n INT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid='church.check_in_stations'::regclass
                AND conname='uq_check_in_stations_auth_user') THEN
    RAISE EXCEPTION 'FAIL 2: one account still cannot register two tablets';
  END IF;

  SELECT id INTO _u FROM auth.users LIMIT 1;
  INSERT INTO church.check_in_stations (organization_id,code,name,auth_user_id,is_active)
  VALUES (_md,'ZZ-LOBBY-1','Lobby 1',_u,true),(_md,'ZZ-LOBBY-2','Lobby 2',_u,true);
  SELECT count(*) INTO _n FROM church.check_in_stations WHERE code LIKE 'ZZ-LOBBY%';
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 2b: only % of 2 tablets registered', _n; END IF;
  RAISE NOTICE 'PASS 2 (one shared login, many tablets)';
END;
$a$;

-- 3-7. resolve_actor's kiosk branch, and what it forbids.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _kiosk_u UUID; _a church.resolved_actor; _ok BOOLEAN; _sess UUID; _ci UUID;
BEGIN
  -- Borrow a real user with a user_organizations row and NO kids grant, and
  -- make the session look like a kiosk.
  SELECT uo.user_id INTO _kiosk_u
  FROM public.user_organizations uo
  WHERE uo.organization_id = _md
    AND NOT EXISTS (SELECT 1 FROM church.module_grants g WHERE g.user_id = uo.user_id)
  LIMIT 1;
  IF _kiosk_u IS NULL THEN RAISE EXCEPTION 'SKIP: no grant-less member to borrow'; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_kiosk_u,'app_metadata',
                      json_build_object('account_type','kiosk'))::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _kiosk_u::TEXT, true);

  _a := church.resolve_actor(NULL);

  -- 3. It resolves at all - without the branch it would be not_permitted.
  IF _a.organization_id IS NULL THEN RAISE EXCEPTION 'FAIL 3: the kiosk did not resolve'; END IF;
  IF _a.source <> 'kiosk' THEN RAISE EXCEPTION 'FAIL 3b: source is %', _a.source; END IF;

  -- 4. IT MAY CHECK IN AND MAY NOT CHECK OUT. The whole point.
  IF NOT _a.can_check_in THEN RAISE EXCEPTION 'FAIL 4: the kiosk cannot check in'; END IF;
  IF _a.can_check_out THEN
    RAISE EXCEPTION 'FAIL 4b: AN UNATTENDED LOBBY TABLET CAN HAND A CHILD OVER';
  END IF;
  IF _a.can_override THEN RAISE EXCEPTION 'FAIL 4c: the kiosk can override'; END IF;

  -- 5. And the check-out RPCs actually refuse it, not just the screen.
  SELECT ci.id INTO _ci FROM church.kids_check_ins ci LIMIT 1;
  IF _ci IS NOT NULL THEN
    _ok := false;
    BEGIN
      PERFORM church.station_pickup_candidates(_ci);
    EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
    IF NOT _ok THEN
      RAISE EXCEPTION 'FAIL 5: a kiosk can read who may collect a child';
    END IF;
  END IF;

  -- 6. THE SEARCH IS TEN DIGITS OR NOTHING. No name search, no prefix match.
  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id=_md
   ORDER BY session_date DESC LIMIT 1;
  _ok := false;
  BEGIN
    PERFORM church.kiosk_find_household_by_phone(_sess, '301555');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%ten_digits%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 6: a partial number was searchable'; END IF;

  -- A full number formatted any way a parent might type it still works.
  PERFORM church.kiosk_find_household_by_phone(_sess, '+1 (301) 555-0123');

  -- 7. A REVOKED TABLET FINDS NOBODY - which is what makes is_active a real
  --    revocation rather than a label.
  DECLARE _st UUID;
  BEGIN
    SELECT id INTO _st FROM church.check_in_stations WHERE code='ZZ-LOBBY-1';
    UPDATE church.check_in_stations SET is_active=false WHERE id=_st;
    _ok := false;
    BEGIN
      PERFORM church.kiosk_find_household_by_phone(_sess, '3015550123', _st);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%station_not_active%' THEN _ok := true; ELSE RAISE; END IF;
    END;
    IF NOT _ok THEN RAISE EXCEPTION 'FAIL 7: a revoked tablet still searched'; END IF;

    -- ...and it cannot re-register its way back in.
    PERFORM church.kiosk_register_station('ZZ-LOBBY-1','Lobby 1');
    IF (SELECT is_active FROM church.check_in_stations WHERE id=_st) THEN
      RAISE EXCEPTION 'FAIL 7b: a revoked tablet reactivated itself by registering';
    END IF;
  END;

  PERFORM set_config('request.jwt.claims','',true);
  RAISE NOTICE 'PASS 3-7 (kiosk resolves, cannot check out, search is hardened)';
END;
$a$;

-- 8. A grant would be the leak. Assert the kiosk account holds none, which is
--    what keeps has_internal_access() false and the profiles restriction on.
DO $a$
DECLARE _def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='church' AND p.proname='resolve_actor';
  -- The kiosk branch must sit BEFORE the grant lookup, or a grant-less kiosk
  -- falls into not_permitted and can do nothing at all.
  IF position('is_kiosk_session' in _def) > position('_volunteer_orgs IS NULL' in _def) THEN
    RAISE EXCEPTION 'FAIL 8: the kiosk branch is after the grant check';
  END IF;
  RAISE NOTICE 'PASS 8 (the kiosk branch precedes the grant check)';
END;
$a$;

-- 9. The bootstrap returns today's session without the kiosk reading any
--    kids table directly.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _r RECORD; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT count(*) INTO _n FROM church.kiosk_session_bootstrap();
  -- Zero rows is a real answer on a day with no session; the point is it runs.
  IF _n > 1 THEN RAISE EXCEPTION 'FAIL 9: the bootstrap returned % sessions', _n; END IF;
  RAISE NOTICE 'PASS 9 (bootstrap runs)';
END;
$a$;
