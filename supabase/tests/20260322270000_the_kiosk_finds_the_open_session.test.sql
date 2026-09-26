-- Assertions for 20260322270000. Run as the real kiosk account.

DO $a$
DECLARE
  _kiosk UUID := '1d64d6db-53ad-46fb-b55c-b256f3dc956c';
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _r RECORD; _open UUID; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_kiosk,'role','authenticated',
      'app_metadata', json_build_object('account_type','kiosk'))::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _kiosk::TEXT, true);

  SELECT id INTO _open FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;
  IF _open IS NULL THEN RAISE EXCEPTION 'SKIP: no open session to test against'; END IF;

  -- 1. THE BUG. An open session dated yesterday-in-UTC must still be found.
  --    This is the exact state that told a parent to go and find a volunteer.
  SELECT * INTO _r FROM church.kiosk_session_bootstrap(NULL, NULL);
  IF _r.kids_session_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 1: the kiosk found no session while one is open';
  END IF;
  IF _r.status <> 'open' THEN
    RAISE EXCEPTION 'FAIL 1b: the kiosk found a % session while one is open', _r.status;
  END IF;
  IF _r.kids_session_id <> _open THEN
    RAISE EXCEPTION 'FAIL 1c: the kiosk found the wrong session';
  END IF;

  -- 2. AND AN OPEN SESSION WINS OVER A DATE MATCH. Passing a local date that
  --    matches a DIFFERENT, closed session must not beat the open one.
  SELECT * INTO _r FROM church.kiosk_session_bootstrap(
    NULL, (SELECT session_date FROM church.kids_sessions
            WHERE organization_id=_md AND status='closed'
            ORDER BY session_date DESC LIMIT 1));
  IF _r.status <> 'open' THEN
    RAISE EXCEPTION 'FAIL 2: a closed session dated "today" beat the open one';
  END IF;

  -- 3. It still reports the rooms, so the screen knows check-in can work.
  IF _r.open_room_count < 1 THEN
    RAISE EXCEPTION 'FAIL 3: the open session reports % open rooms', _r.open_room_count;
  END IF;

  -- 4. A kiosk with no registered station is still known - we are not
  --    requiring device registration, and a tablet that has not registered
  --    must not read as revoked.
  IF NOT _r.station_known THEN
    RAISE EXCEPTION 'FAIL 4: an unregistered tablet reads as unknown, which '
                    'would show the "needs setting up" screen';
  END IF;

  RAISE NOTICE 'PASS 1-4 (open session found regardless of UTC date)';
END;
$a$;

-- 5. With NOTHING open, the fallback uses the date the CLIENT passes, not
--    the database's idea of today.
DO $a$
DECLARE
  _kiosk UUID := '1d64d6db-53ad-46fb-b55c-b256f3dc956c';
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _r RECORD; _d DATE; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',_kiosk,'role','authenticated',
      'app_metadata', json_build_object('account_type','kiosk'))::TEXT, true);
  PERFORM set_config('request.jwt.claim.sub', _kiosk::TEXT, true);

  -- Close everything, inside this rolled-back transaction.
  UPDATE church.kids_sessions SET status='closed'
   WHERE organization_id=_md AND status='open';

  SELECT session_date INTO _d FROM church.kids_sessions
   WHERE organization_id=_md ORDER BY session_date DESC LIMIT 1;

  -- The client says "my local date is <the session's date>", which is what a
  -- tablet in Maryland says at 9pm while UTC has already rolled over.
  SELECT * INTO _r FROM church.kiosk_session_bootstrap(NULL, _d);
  IF _r.kids_session_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 5: the client-supplied date found nothing';
  END IF;
  IF _r.session_date <> _d THEN
    RAISE EXCEPTION 'FAIL 5b: found a session dated % for a client date of %',
      _r.session_date, _d;
  END IF;

  -- ...and a date with nothing on it finds nothing, rather than quietly
  -- offering the most recent session from some other week.
  SELECT count(*) INTO _n FROM church.kiosk_session_bootstrap(NULL, DATE '2020-01-01');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 5c: a date with no session returned % rows', _n;
  END IF;
  RAISE NOTICE 'PASS 5 (client date drives the fallback)';
END;
$a$;
