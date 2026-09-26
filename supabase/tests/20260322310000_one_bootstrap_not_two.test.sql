DO $a$
DECLARE _n INT; _sess UUID;
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _kiosk UUID := '1d64d6db-53ad-46fb-b55c-b256f3dc956c';
BEGIN
  -- 1. Exactly one bootstrap remains, and it is the one with _today.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='church' AND p.proname='kiosk_session_bootstrap';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 1: % bootstraps remain, expected 1', _n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='church' AND p.proname='kiosk_session_bootstrap'
       AND pg_get_function_identity_arguments(p.oid) = '_station_id uuid, _today date') THEN
    RAISE EXCEPTION 'FAIL 1b: the surviving bootstrap is the one WITHOUT the UTC fix';
  END IF;
  RAISE NOTICE 'PASS 1 (one bootstrap, the fixed one)';

  -- 2. THE AMBIGUITY IS GONE. This exact call raised 42725 before the drop.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_kiosk,'role','authenticated',
      'app_metadata', json_build_object('account_type','kiosk'))::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _kiosk::TEXT, true);
  PERFORM * FROM church.kiosk_session_bootstrap();
  RAISE NOTICE 'PASS 2 (a no-argument call resolves)';

  -- 3. A STALE CLIENT'S CALL SHAPE - _station_id alone, no _today - resolves
  --    and still finds the open session. This is the case that was broken.
  SELECT kids_session_id INTO _sess FROM church.kiosk_session_bootstrap(NULL);
  IF _sess IS NULL AND EXISTS (SELECT 1 FROM church.kids_sessions
      WHERE organization_id=_md AND status='open') THEN
    RAISE EXCEPTION 'FAIL 3: a session is open and the kiosk cannot see it';
  END IF;
  RAISE NOTICE 'PASS 3 (a one-argument call finds the open session)';

  -- 4. No other duplicate names anywhere in the schema.
  SELECT count(*) INTO _n FROM (
    SELECT p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
     WHERE ns.nspname='church' GROUP BY p.proname HAVING count(*)>1) x;
  IF _n > 0 THEN RAISE EXCEPTION 'FAIL 4: % other overloaded names remain', _n; END IF;
  RAISE NOTICE 'PASS 4 (no other orphaned overloads)';
END;
$a$;
