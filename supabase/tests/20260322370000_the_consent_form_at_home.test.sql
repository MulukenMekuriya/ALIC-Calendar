-- Assertions for 20260322370000, inside BEGIN/ROLLBACK.
--
-- The date moves, an either/or question takes exactly one answer, a parent
-- can see and sign their own form, the admin list shows every family, and a
-- reminder reaches the adults of a family that has not signed.

-- 0. The date moved to Sunday 6 December, and the notice with it. Read before
--    the setup below switches the rule to warn for the rest of these checks.
DO $a$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM church.kids_consent_policy
   WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  IF p.enforce_from IS DISTINCT FROM DATE '2026-12-06' OR p.mode <> 'block' THEN
    RAISE EXCEPTION 'FAIL 0: the rule is %, from %', p.mode, p.enforce_from;
  END IF;
  IF position('6 December' IN p.notice_text) = 0 OR position('1 November' IN p.notice_text) > 0 THEN
    RAISE EXCEPTION 'FAIL 0a: the notice still reads: %', p.notice_text;
  END IF;
  RAISE NOTICE 'PASS 0';
END;
$a$;

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       '0c2dd974-ba40-4d99-8db5-63804c38ed65'::UUID AS admin_u;

DO $setup$
DECLARE _md UUID; _u UUID; _h UUID; _mum UUID; _dad UUID; _a UUID; _b UUID; _sess UUID;
BEGIN
  SELECT md, admin_u INTO _md, _u FROM t;
  PERFORM set_config('request.jwt.claim.sub', _u::TEXT, true);

  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Home Family') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZMeseret','Home',false,'zz-home-1@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZDawit','Home',false,'zz-home-2@example.test',true) RETURNING id INTO _dad;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZHana','Home',true) RETURNING id INTO _a;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZAbel','Home',true) RETURNING id INTO _b;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h,_mum,'head',true),(_md,_h,_dad,'spouse',true),
           (_md,_h,_a,'child',true),(_md,_h,_b,'child',true);

  -- The admin's login stands in for the mother's, for the portal path.
  UPDATE church.people SET profile_id = NULL WHERE profile_id = _u;
  UPDATE church.people SET profile_id = _u WHERE id = _mum;

  -- A recent check-in, so the weekly job counts this family.
  SELECT id INTO _sess FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;
  IF _sess IS NULL THEN
    SELECT id INTO _sess FROM church.kids_sessions
     WHERE organization_id=_md ORDER BY session_date DESC LIMIT 1;
    UPDATE church.kids_sessions SET status='open' WHERE id=_sess;
  END IF;
  PERFORM church.set_kids_consent_mode(_md,'warn');
  PERFORM church.check_in_children(_sess, ARRAY[_a]);

  ALTER TABLE t ADD COLUMN h UUID; ALTER TABLE t ADD COLUMN mum UUID;
  ALTER TABLE t ADD COLUMN a UUID; ALTER TABLE t ADD COLUMN b UUID;
  UPDATE t SET h=_h, mum=_mum, a=_a, b=_b;
END;
$setup$;

-- 1. The parent sees both children, unsigned, in My Church.
DO $a$
DECLARE _n INT; _h UUID; _mum UUID;
BEGIN
  SELECT h, mum INTO _h, _mum FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  SELECT count(*) INTO _n FROM church.my_consent_status() s
   WHERE s.household_id = _h AND s.state = 'no_signature' AND s.signer_person_id = _mum;
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 1: My Church shows % of the 2 unsigned children', _n; END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. The admin list has the family, not signed, and a reminder reaches both adults.
DO $a$
DECLARE r RECORD; q RECORD; _h UUID; _md UUID;
BEGIN
  SELECT h, md INTO _h, _md FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  SELECT * INTO r FROM church.kids_consent_roster(_md) WHERE household_id = _h;
  IF r.status IS DISTINCT FROM 'not_signed' OR r.emailable_adults <> 2 THEN
    RAISE EXCEPTION 'FAIL 2: list row is %, % adults to email', r.status, r.emailable_adults;
  END IF;
  IF jsonb_array_length(r.children) <> 2 THEN
    RAISE EXCEPTION 'FAIL 2a: the list names % children', jsonb_array_length(r.children);
  END IF;

  SELECT * INTO q FROM church.kids_send_consent_reminders(_md, ARRAY[_h]);
  IF q.households <> 1 OR q.emails <> 2 THEN
    RAISE EXCEPTION 'FAIL 2b: a reminder went to % families, % emails', q.households, q.emails;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM church.notification_log
                  WHERE kind = 'kids_consent_requested'
                    AND recipient_email = 'zz-home-1@example.test'
                    AND subject = 'Consent form for ZZAbel and ZZHana'
                    AND position(E'\nhttps://www.addislidet.info/my?tab=children&consent=1\n' IN body) > 0) THEN
    RAISE EXCEPTION 'FAIL 2c: the reminder email is missing, or has no link on its own line';
  END IF;

  -- A double-click is one reminder, not two.
  SELECT * INTO q FROM church.kids_send_consent_reminders(_md, ARRAY[_h]);
  IF q.households <> 0 THEN RAISE EXCEPTION 'FAIL 2d: a second press sent again'; END IF;

  SELECT * INTO r FROM church.kids_consent_roster(_md) WHERE household_id = _h;
  IF r.last_reminded_at IS NULL THEN RAISE EXCEPTION 'FAIL 2e: the list does not show the reminder'; END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. Both answers to one question, or none, is refused.
DO $a$
DECLARE _md UUID; _h UUID; _mum UUID; _a UUID; _b UUID; _base JSONB; _photo JSONB; _err TEXT;
BEGIN
  SELECT md,h,mum,a,b INTO _md,_h,_mum,_a,_b FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  _base := jsonb_build_object(
    'participation_consent', true, 'safety_remain_on_premises', true,
    'safety_checkout_procedure', true, 'safety_supervision_window', true,
    'safety_reachable', true, 'emergency_medical_authorization', true,
    'parent_acknowledgment', true, 'health_none_known', true,
    'snack_authorized', true, 'support_none_required', true, 'off_site_permitted', true);
  _photo := jsonb_build_object(_a::TEXT, jsonb_build_object('photo_permitted', true),
                               _b::TEXT, jsonb_build_object('photo_declined', true));

  BEGIN
    PERFORM church.sign_kids_consent(_md, _h, ARRAY[_a,_b], _mum, 'ZZMeseret Home', 'portal',
              _base || jsonb_build_object('off_site_declined', true), _photo);
    RAISE EXCEPTION 'FAIL 3: "may" and "may not" to off-site trips was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
    IF _err NOT LIKE 'choose_one_answer: off_site%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM church.sign_kids_consent(_md, _h, ARRAY[_a,_b], _mum, 'ZZMeseret Home', 'portal',
              _base - 'snack_authorized', _photo);
    RAISE EXCEPTION 'FAIL 3a: no answer to the snack question was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
    IF _err NOT LIKE 'choose_one_answer: snack%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM church.sign_kids_consent(_md, _h, ARRAY[_a,_b], _mum, 'ZZMeseret Home', 'portal',
              _base, jsonb_build_object(_a::TEXT, jsonb_build_object('photo_permitted', true)));
    RAISE EXCEPTION 'FAIL 3b: a child with no photo answer was accepted';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
    IF _err NOT LIKE 'choose_one_answer: photo_video%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. One answer each, signed by the parent at home: both children covered,
--    and the list says so.
DO $a$
DECLARE _md UUID; _h UUID; _mum UUID; _a UUID; _b UUID; _n INT; r RECORD;
BEGIN
  SELECT md,h,mum,a,b INTO _md,_h,_mum,_a,_b FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  PERFORM church.sign_kids_consent(_md, _h, ARRAY[_a,_b], _mum, 'ZZMeseret Home', 'portal',
    jsonb_build_object(
      'participation_consent', true, 'safety_remain_on_premises', true,
      'safety_checkout_procedure', true, 'safety_supervision_window', true,
      'safety_reachable', true, 'emergency_medical_authorization', true,
      'parent_acknowledgment', true, 'health_none_known', true, 'health_condition_known', false,
      'snack_authorized', true, 'snack_declined', false,
      'support_none_required', true, 'support_may_be_required', false,
      'off_site_permitted', false, 'off_site_declined', true,
      'sick_policy_understood', true),
    jsonb_build_object(_a::TEXT, jsonb_build_object('photo_permitted', true, 'photo_declined', false),
                       _b::TEXT, jsonb_build_object('photo_declined', true)));

  SELECT count(*) INTO _n FROM church.my_consent_status() s
   WHERE s.household_id = _h AND s.state = 'covered';
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 4: % of 2 children covered after signing at home', _n; END IF;

  SELECT * INTO r FROM church.kids_consent_roster(_md) WHERE household_id = _h;
  IF r.status <> 'signed' OR r.source <> 'portal' OR r.signed_by <> 'ZZMeseret Home' OR NOT r.can_open THEN
    RAISE EXCEPTION 'FAIL 4a: list row is %, %, %, can_open %', r.status, r.source, r.signed_by, r.can_open;
  END IF;

  -- Signed families are not reminded.
  IF (SELECT households FROM church.kids_send_consent_reminders(_md, ARRAY[_h])) <> 0 THEN
    RAISE EXCEPTION 'FAIL 4b: a family that has signed was reminded';
  END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. Nobody outside the kids team reads the list or sends reminders.
DO $a$
DECLARE _md UUID; _err TEXT;
BEGIN
  SELECT md INTO _md FROM t;
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::TEXT, true);
  BEGIN
    PERFORM * FROM church.kids_consent_roster(_md);
    RAISE EXCEPTION 'FAIL 5: a stranger read the consent list';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM church.kids_send_consent_reminders(_md, NULL);
    RAISE EXCEPTION 'FAIL 5a: a stranger sent reminders';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS 5';
END;
$a$;

-- 6. The Thursday job reaches real unsigned families, and is scheduled.
DO $a$
DECLARE _n INT;
BEGIN
  SELECT church.kids_consent_reminder_sweep() INTO _n;
  IF _n = 0 THEN RAISE EXCEPTION 'FAIL 6: the weekly job reached nobody'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kids-consent-reminders'
                  AND schedule = '0 23 * * 4') THEN
    RAISE EXCEPTION 'FAIL 6a: the Thursday job is not scheduled';
  END IF;
  -- And a second run the same week sends nothing more.
  SELECT church.kids_consent_reminder_sweep() INTO _n;
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 6b: a second run the same week sent % more', _n; END IF;
  RAISE NOTICE 'PASS 6';
END;
$a$;
