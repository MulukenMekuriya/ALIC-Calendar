-- Assertions for 20260322210800, inside BEGIN/ROLLBACK.

-- 0. REMOVED, AND DELIBERATELY NOT REPAIRED.
--
-- This was a deploy-ordering guard, and it has done its job. It asserted two
-- things that were true only on the day this migration shipped:
--
--   0b. check_in_children does not mention consent - the safety claim of
--       shipping screening separately from the gate. 20260322210900 added
--       the gate on purpose, so this is now false by design.
--   0c. every branch is in warn mode - true on arrival. 20260322221000
--       seeded mode='block' with enforce_from = 2026-11-01, on purpose.
--
-- An assertion that a later migration was meant to falsify is not a
-- regression test; leaving it here would mean a permanently red suite and a
-- team that stops reading the colour. The live behaviour it used to protect
-- is covered now by 20260322210900 (a refused child does not take their
-- siblings down) and 20260322221000 (the date, and only the date, switches
-- enforcement on).
--
-- The rest of this file is not historical and still runs.

-- 1. Setting block for today, or the past, is refused from the RPC. Somebody
--    meaning to schedule it and typing the wrong date would otherwise start
--    turning families away on the spot.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _volu UUID := '13708053-2a4d-4c19-bd74-afd88da4cfee';
  _ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);

  _ok := false;
  BEGIN
    PERFORM church.set_kids_consent_mode(_md, 'block', current_date);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%enforce_from_must_be_in_the_future%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 1: enforcement could be switched on for today'; END IF;

  _ok := false;
  BEGIN
    PERFORM church.set_kids_consent_mode(_md, 'block', NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%enforce_from_must_be_in_the_future%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 1b: block with no date was accepted'; END IF;

  -- And the CHECK backs it up against a hand-written UPDATE.
  _ok := false;
  BEGIN
    UPDATE church.kids_consent_policy SET mode='block', enforce_from=NULL
     WHERE organization_id=_md;
  EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 1c: block with no date was insertable'; END IF;

  -- A volunteer cannot change it.
  PERFORM set_config('request.jwt.claim.sub', _volu::TEXT, true);
  _ok := false;
  BEGIN
    PERFORM church.set_kids_consent_mode(_md, 'off');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 1d: a volunteer changed the consent mode'; END IF;
  RAISE NOTICE 'PASS 1 (the date must be in the future, and admin-only)';
END;
$a$;

-- 2-9. The gate through every mode, on a real family.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _h UUID; _mum UUID; _kid UUID; _other UUID; _sess UUID; _sess2 UUID;
  _ans JSONB; _g RECORD; _r RECORD; _n INT; _sig UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);

  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Gate') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZGateMum','G',false,'zzgate@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZGateKid','G',true) RETURNING id INTO _kid;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZGateOrphan','G',true) RETURNING id INTO _other;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');

  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id=_md
   ORDER BY session_date DESC LIMIT 1;
  SELECT id INTO _sess2 FROM church.kids_sessions WHERE organization_id=_md AND id <> _sess
   ORDER BY session_date DESC LIMIT 1;

  -- 2. WARN MODE LETS EVERYBODY THROUGH, and still says what is missing.
  PERFORM church.set_kids_consent_mode(_md, 'warn');
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF NOT _g.allow THEN RAISE EXCEPTION 'FAIL 2: warn mode refused a child'; END IF;
  IF _g.enforcing THEN RAISE EXCEPTION 'FAIL 2b: warn mode reports enforcing'; END IF;
  IF _g.state <> 'no_signature' THEN RAISE EXCEPTION 'FAIL 2c: state is %', _g.state; END IF;
  IF _g.refusal_code <> 'consent_not_on_file' THEN
    RAISE EXCEPTION 'FAIL 2d: the code the gate WOULD use is %', _g.refusal_code;
  END IF;

  -- 3. BLOCK WITH A FUTURE DATE STILL LETS EVERYBODY THROUGH. This is the
  --    go-live setting: set once, months ahead, switching itself on the day.
  PERFORM church.set_kids_consent_mode(_md, 'block', current_date + 30);
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF NOT _g.allow THEN RAISE EXCEPTION 'FAIL 3: a future date refused today'; END IF;
  IF _g.enforcing THEN RAISE EXCEPTION 'FAIL 3b: a future date reports enforcing'; END IF;

  -- 4. ONCE THE DATE ARRIVES, an uncovered child is refused.
  UPDATE church.kids_consent_policy SET enforce_from = current_date WHERE organization_id=_md;
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF _g.allow THEN RAISE EXCEPTION 'FAIL 4: enforcement did not bite'; END IF;
  IF NOT _g.enforcing THEN RAISE EXCEPTION 'FAIL 4b: the date arrived but enforcing is false'; END IF;
  IF _g.refusal_code <> 'consent_not_on_file' THEN
    RAISE EXCEPTION 'FAIL 4c: refusal code is %', _g.refusal_code;
  END IF;

  -- A child with no household gets a DIFFERENT code, because the remedy is
  -- different: register the family, not sign a form.
  SELECT * INTO _g FROM church.kids_consent_gate(_other, _sess);
  IF _g.refusal_code <> 'consent_no_guardian' THEN
    RAISE EXCEPTION 'FAIL 4d: a child with no guardian got %', _g.refusal_code;
  END IF;

  -- 5. A LEADER CAN LET THEM THROUGH, for that service only.
  PERFORM church.kids_grant_consent_exception(_kid, _sess, 'Phone had no signal at the desk');
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF NOT _g.allow THEN RAISE EXCEPTION 'FAIL 5: the exception did not let them through'; END IF;
  IF NOT _g.excepted THEN RAISE EXCEPTION 'FAIL 5b: the exception is not reported'; END IF;
  -- It is not a waiver: the state is unchanged and they still read unsigned.
  IF _g.state <> 'no_signature' THEN
    RAISE EXCEPTION 'FAIL 5c: an exception created coverage - it must not';
  END IF;

  -- ...and NOT at the next service.
  IF _sess2 IS NOT NULL THEN
    SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess2);
    IF _g.allow THEN
      RAISE EXCEPTION 'FAIL 5d: a one-service exception carried to another service';
    END IF;
  END IF;

  -- A reason is required. It is what makes this defensible later.
  DECLARE _ok BOOLEAN := false;
  BEGIN
    BEGIN
      PERFORM church.kids_grant_consent_exception(_other, _sess, 'no');
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%reason_required%' THEN _ok := true; ELSE RAISE; END IF;
    END;
    IF NOT _ok THEN RAISE EXCEPTION 'FAIL 5e: an exception was granted with no reason'; END IF;
  END;

  -- Drop the exception from test 5 first. Leaving it would make every
  -- assertion below pass for the wrong reason - the gate would be allowing
  -- because a leader said so this morning, not because of anything being
  -- tested. (It caught exactly that on the first run.)
  DELETE FROM church.kids_consent_exceptions WHERE child_person_id = _kid;
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF _g.allow OR _g.excepted THEN
    RAISE EXCEPTION 'FAIL 5f: the exception outlived its deletion';
  END IF;

  -- 6. SIGNING CLEARS IT, in every mode.
  SELECT jsonb_object_agg(r,'true') INTO _ans
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;
  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h,ARRAY[_kid],_mum,'ZZ Gate Mum','kiosk',_ans);

  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF NOT _g.allow OR _g.state <> 'covered' THEN
    RAISE EXCEPTION 'FAIL 6: a signed child is % / allow=%', _g.state, _g.allow;
  END IF;

  -- 7. A FORM THAT OUTLASTED ITS GRACE IS REFUSED when enforcing - but only
  --    after the four weeks, never inside them.
  UPDATE church.consent_children SET medical_changed_at = now(),
         resign_due_by = current_date + 10
   WHERE consent_signature_id = _sig;
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF NOT _g.allow THEN
    RAISE EXCEPTION 'FAIL 7: a family inside the grace period was refused - they '
                    'reported a change and got punished for it';
  END IF;
  IF _g.resign_due_by IS NULL THEN
    RAISE EXCEPTION 'FAIL 7b: the gate does not carry the deadline for the screen';
  END IF;

  UPDATE church.consent_children SET resign_due_by = current_date - 1
   WHERE consent_signature_id = _sig;
  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF _g.allow THEN RAISE EXCEPTION 'FAIL 7c: an out-of-date form was still accepted'; END IF;
  IF _g.state <> 'consent_out_of_date' THEN
    RAISE EXCEPTION 'FAIL 7d: state is %', _g.state;
  END IF;

  -- 8. OFF MEANS OFF.
  PERFORM church.set_kids_consent_mode(_md, 'off');
  SELECT * INTO _g FROM church.kids_consent_gate(_other, _sess);
  IF NOT _g.allow THEN RAISE EXCEPTION 'FAIL 8: mode off still refused somebody'; END IF;

  -- 9. THE SCREEN returns a household so the sheet can be shown once per
  --    family, and carries NO medical detail.
  PERFORM church.set_kids_consent_mode(_md, 'warn');
  SELECT count(*) INTO _n FROM church.screen_children_for_check_in(
    ARRAY[_kid, _other], _sess);
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 9: the screen returned % rows', _n; END IF;

  SELECT * INTO _r FROM church.screen_children_for_check_in(ARRAY[_kid], _sess);
  IF _r.household_id <> _h THEN
    RAISE EXCEPTION 'FAIL 9b: the screen does not say which household - the sheet '
                    'would then be shown once per child, which is how volunteers '
                    'learn to tap past it';
  END IF;
  IF _r.policy_mode <> 'warn' THEN RAISE EXCEPTION 'FAIL 9c: mode is %', _r.policy_mode; END IF;

  RAISE NOTICE 'PASS 2-9 (warn, future date, enforcing, exceptions, grace, off)';
END;
$a$;

-- 10. The screen and the prefill are behind can_check_in, and the prefill
--     records every read.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _kid UUID; _before INT; _after INT; _n INT; _r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZPrefillKid','P',true) RETURNING id INTO _kid;

  SELECT count(*) INTO _before FROM church.check_in_audit
   WHERE action='sensitive_viewed' AND detail->>'record'='consent_prefill';
  PERFORM church.station_child_consent_prefill(ARRAY[_kid]);
  SELECT count(*) INTO _after FROM church.check_in_audit
   WHERE action='sensitive_viewed' AND detail->>'record'='consent_prefill';
  IF _after <> _before + 1 THEN
    RAISE EXCEPTION 'FAIL 10: the prefill wrote % audit rows, expected 1', _after - _before;
  END IF;

  -- "We asked and there is none" stays distinguishable from "nobody asked".
  SELECT * INTO _r FROM church.station_child_consent_prefill(ARRAY[_kid]);
  IF _r.has_record THEN
    RAISE EXCEPTION 'FAIL 10b: a child with no record reads as having one';
  END IF;
  RAISE NOTICE 'PASS 10 (the prefill is audited per child)';
END;
$a$;

-- 11. The screen does not hand a desk the medical record. It says whether a
--     form is wanted; what is ON the form goes through the audited prefill.
DO $a$
DECLARE _def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='church' AND p.proname='screen_children_for_check_in';
  IF _def ILIKE '%person_sensitive%' OR _def ILIKE '%allerg%' THEN
    RAISE EXCEPTION 'FAIL 11: the screening call reads medical data without an audit row';
  END IF;

  -- ...and it does not leak the signer or which household holds the consent.
  IF _def ILIKE '%signer_printed_name%' THEN
    RAISE EXCEPTION 'FAIL 11b: the screen exposes who signed';
  END IF;
  RAISE NOTICE 'PASS 11 (screening carries no medical data)';
END;
$a$;

-- 12. The adults list is adults only, and says whether a copy can be sent.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _h UUID; _mum UUID; _kid UUID; _n INT; _r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Adults') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZAdultMum','A',false,'zza@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZAdultKid','A',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');

  SELECT count(*) INTO _n FROM church.station_consent_signers(_kid);
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 12: % adults, expected 1', _n; END IF;

  SELECT * INTO _r FROM church.station_consent_signers(_kid);
  IF NOT _r.has_email THEN
    RAISE EXCEPTION 'FAIL 12b: an adult with an address reads as having none';
  END IF;
  IF _r.household_id <> _h THEN RAISE EXCEPTION 'FAIL 12c: wrong household'; END IF;

  -- A household with no adult email says so, so the sheet can warn BEFORE
  -- somebody signs expecting a copy rather than after.
  UPDATE church.people SET email = NULL WHERE id = _mum;
  SELECT * INTO _r FROM church.station_consent_signers(_kid);
  IF _r.has_email THEN RAISE EXCEPTION 'FAIL 12d: a missing address reads as present'; END IF;
  RAISE NOTICE 'PASS 12 (the signer is picked from a real list)';
END;
$a$;

-- 13. Signing from a station produces a real signature, attributed to the
--     device rather than to a made-up witness.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _h UUID; _mum UUID; _kid UUID; _ans JSONB; _r RECORD; _g RECORD; _sess UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Station') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZStnMum','S',false,'zzstn@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZStnKid','S',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');
  SELECT id INTO _sess FROM church.kids_sessions WHERE organization_id=_md
   ORDER BY session_date DESC LIMIT 1;

  SELECT jsonb_object_agg(r,'true') INTO _ans
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;

  SELECT * INTO _r FROM church.station_sign_consent(
    _h, ARRAY[_kid], _mum, 'ZZ Station Mum', _ans);
  IF _r.children_named <> 1 THEN RAISE EXCEPTION 'FAIL 13: named % children', _r.children_named; END IF;

  IF (SELECT source FROM church.consent_signatures WHERE id=_r.signature_id) <> 'kiosk' THEN
    RAISE EXCEPTION 'FAIL 13b: a desk signature was not recorded as in-person';
  END IF;

  SELECT * INTO _g FROM church.kids_consent_gate(_kid, _sess);
  IF _g.state <> 'covered' THEN
    RAISE EXCEPTION 'FAIL 13c: signing at the desk did not cover the child (%)', _g.state;
  END IF;
  RAISE NOTICE 'PASS 13 (a desk can take a signature end to end)';
END;
$a$;
