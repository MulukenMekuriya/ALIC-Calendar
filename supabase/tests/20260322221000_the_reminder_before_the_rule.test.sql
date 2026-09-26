-- Assertions for 20260322221000.

DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _va UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  _r RECORD; _g RECORD; _kid UUID; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);

  -- 1. The date is set, and it is in the FUTURE. If this ever fails on a real
  --    deploy it means the rule went live the moment the migration landed.
  SELECT * INTO _r FROM church.kids_consent_policy WHERE organization_id=_md;
  IF _r.mode <> 'block' THEN RAISE EXCEPTION 'FAIL 1: mode is %', _r.mode; END IF;
  IF _r.enforce_from <> DATE '2026-11-01' THEN
    RAISE EXCEPTION 'FAIL 1b: enforce_from is %', _r.enforce_from;
  END IF;
  IF _r.enforce_from <= current_date THEN
    RAISE EXCEPTION 'FAIL 1c: the rule is already in force on the day it was set';
  END IF;

  -- 2. IT IS STILL INERT TODAY. This is the whole claim of "an update, not a
  --    deploy": the gate is configured and refusing nobody.
  SELECT id INTO _kid FROM church.people
   WHERE organization_id=_md AND is_child AND is_active LIMIT 1;
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, NULL);
  IF NOT _g.allow THEN
    RAISE EXCEPTION 'FAIL 2: a child is being refused five weeks early';
  END IF;
  IF _g.enforcing THEN
    RAISE EXCEPTION 'FAIL 2b: the gate reports enforcing before the date';
  END IF;

  -- No child anywhere is refused today. 534 of them.
  SELECT count(*) INTO _n FROM (
    SELECT p.id FROM church.people p
     WHERE p.organization_id=_md AND p.is_child AND p.is_active) s
  WHERE NOT (SELECT allow FROM church.kids_consent_gate(s.id, NULL));
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 2c: % children would be refused today', _n;
  END IF;

  -- 3. AND IT BITES ON THE DAY. Same row, same code, date moved forward.
  UPDATE church.kids_consent_policy SET enforce_from = current_date
   WHERE organization_id = _md;
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, NULL);
  IF _g.allow THEN
    RAISE EXCEPTION 'FAIL 3: the date arrived and nothing changed';
  END IF;
  IF NOT _g.enforcing THEN RAISE EXCEPTION 'FAIL 3b: enforcing is still false'; END IF;

  -- 4. THE WAY BACK IS ONE STATEMENT. If the first enforced Sunday goes
  --    badly, this is what a kids admin does, without a deploy.
  PERFORM church.set_kids_consent_mode(_md, 'warn');
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, NULL);
  IF NOT _g.allow THEN
    RAISE EXCEPTION 'FAIL 4: switching back to warn did not stop the refusals';
  END IF;

  RAISE NOTICE 'PASS 1-4 (set, inert today, bites on the day, one way back)';
END;
$a$;

-- 5. VA is untouched: a rule about nothing would surprise somebody later.
DO $a$
DECLARE _r RECORD;
BEGIN
  SELECT * INTO _r FROM church.kids_consent_policy
   WHERE organization_id='b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  IF _r.mode <> 'warn' OR _r.enforce_from IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 5: VA got a date it did not ask for (% / %)',
      _r.mode, _r.enforce_from;
  END IF;
  RAISE NOTICE 'PASS 5 (VA still in warn, no date)';
END;
$a$;

-- 6. The screen reads the same answer the gate acts on.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _p RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  UPDATE church.kids_consent_policy
     SET mode='block', enforce_from=DATE '2026-11-01' WHERE organization_id=_md;

  SELECT * INTO _p FROM church.kids_consent_policy_for(_md);
  IF _p.mode <> 'block' THEN RAISE EXCEPTION 'FAIL 6: the screen reads mode %', _p.mode; END IF;
  IF _p.enforcing_now THEN
    RAISE EXCEPTION 'FAIL 6b: the screen says enforcing while the gate says not - '
                    'they would then disagree in front of a volunteer';
  END IF;
  IF _p.notice_text IS NULL OR _p.notice_text NOT LIKE '%1 November%' THEN
    RAISE EXCEPTION 'FAIL 6c: the notice does not name the date';
  END IF;
  IF _p.resign_grace_days <> 28 THEN
    RAISE EXCEPTION 'FAIL 6d: the grace period was disturbed (%)', _p.resign_grace_days;
  END IF;
  RAISE NOTICE 'PASS 6 (the screen and the gate agree)';
END;
$a$;
