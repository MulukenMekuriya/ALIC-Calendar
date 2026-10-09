-- Assertions for 20260322350000, inside BEGIN/ROLLBACK.
--
-- One email per adult per family check-in or pickup, the pickup code in the
-- check-in email, nothing about a child to an adult barred from collecting
-- them, and a sender that waits instead of throwing email away.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       '0c2dd974-ba40-4d99-8db5-63804c38ed65'::UUID AS admin_u;

DO $setup$
DECLARE
  _md UUID; _sess UUID;
  _h1 UUID; _mum UUID; _dad UUID; _a UUID; _b UUID;
  _h2 UUID; _mum2 UUID; _dad2 UUID; _c UUID; _d UUID;
  _h3 UUID; _e UUID;
BEGIN
  SELECT md INTO _md FROM t;
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);

  -- Family 1: two parents, two children.
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Letter Family') RETURNING id INTO _h1;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZMeseret','Letter',false,'zz-meseret@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZDawit','Letter',false,'zz-dawit@example.test',true) RETURNING id INTO _dad;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZHana','Letter',true) RETURNING id INTO _a;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZAbel','Letter',true) RETURNING id INTO _b;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h1,_mum,'head',true),(_md,_h1,_dad,'spouse',true),
           (_md,_h1,_a,'child',true),(_md,_h1,_b,'child',true);

  -- Family 2: the father is barred from collecting the younger child.
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Barred Family') RETURNING id INTO _h2;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZSara','Barred',false,'zz-sara@example.test',true) RETURNING id INTO _mum2;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZYonas','Barred',false,'zz-yonas@example.test',true) RETURNING id INTO _dad2;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZRuth','Barred',true) RETURNING id INTO _c;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZLiya','Barred',true) RETURNING id INTO _d;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h2,_mum2,'head',true),(_md,_h2,_dad2,'spouse',true),
           (_md,_h2,_c,'child',true),(_md,_h2,_d,'child',true);
  INSERT INTO church.kids_pickup_restrictions
    (organization_id, child_person_id, restricted_person_id, restricted_person_name, reason_restricted)
  VALUES (_md, _d, _dad2, 'ZZYonas Barred', 'test');

  -- Family 3: one child, for the replay.
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Replay Family') RETURNING id INTO _h3;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZElias','Replay',true) RETURNING id INTO _e;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h3,_mum,'head',false),(_md,_h3,_e,'child',true);

  SELECT id INTO _sess FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;
  IF _sess IS NULL THEN
    SELECT id INTO _sess FROM church.kids_sessions
     WHERE organization_id=_md ORDER BY session_date DESC LIMIT 1;
    UPDATE church.kids_sessions SET status='open' WHERE id=_sess;
  END IF;
  PERFORM church.set_kids_consent_mode(_md,'warn');

  ALTER TABLE t ADD COLUMN sess UUID;
  ALTER TABLE t ADD COLUMN mum UUID; ALTER TABLE t ADD COLUMN dad UUID;
  ALTER TABLE t ADD COLUMN a UUID; ALTER TABLE t ADD COLUMN b UUID;
  ALTER TABLE t ADD COLUMN mum2 UUID; ALTER TABLE t ADD COLUMN dad2 UUID;
  ALTER TABLE t ADD COLUMN c UUID; ALTER TABLE t ADD COLUMN d UUID;
  ALTER TABLE t ADD COLUMN e UUID;
  UPDATE t SET sess=_sess, mum=_mum, dad=_dad, a=_a, b=_b,
               mum2=_mum2, dad2=_dad2, c=_c, d=_d, e=_e;
END;
$setup$;

-- 1. ONE CHECK-IN EMAIL PER ADULT, naming both children, with the code.
DO $a$
DECLARE
  _sess UUID; _a UUID; _b UUID; _mum UUID; _dad UUID;
  _batch UUID; _code TEXT; _n INT; r RECORD;
BEGIN
  SELECT sess,a,b,mum,dad INTO _sess,_a,_b,_mum,_dad FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  SELECT batch_id, pickup_code INTO _batch, _code
  FROM church.check_in_children(_sess, ARRAY[_a,_b]) WHERE NOT refused LIMIT 1;
  IF _batch IS NULL THEN RAISE EXCEPTION 'FAIL 1: the family did not check in'; END IF;

  SELECT count(*) INTO _n FROM church.notification_log n
  WHERE n.kind='check_in' AND n.channel='email'
    AND n.recipient_person_id IN (_mum,_dad) AND n.created_at = now();
  IF _n <> 2 THEN
    RAISE EXCEPTION 'FAIL 1a: % check-in emails for two parents of two children - '
                    'expected one each', _n;
  END IF;

  FOR r IN SELECT * FROM church.notification_log n
           WHERE n.kind='check_in' AND n.channel='email'
             AND n.recipient_person_id IN (_mum,_dad) AND n.created_at = now()
  LOOP
    IF r.subject <> 'ZZHana and ZZAbel are checked in' THEN
      RAISE EXCEPTION 'FAIL 1b: subject was "%"', r.subject;
    END IF;
    IF coalesce(array_length(r.check_in_ids,1),0) <> 2 THEN
      RAISE EXCEPTION 'FAIL 1c: the email covers % check-ins, not 2', array_length(r.check_in_ids,1);
    END IF;
    IF position('Your pickup code is ' || _code IN r.body) = 0 THEN
      RAISE EXCEPTION 'FAIL 1d: the code % is not in the email: %', _code, r.body;
    END IF;
    IF position('• ZZHana, ' IN r.body) = 0 OR position('• ZZAbel, ' IN r.body) = 0 THEN
      RAISE EXCEPTION 'FAIL 1e: a child or their room is missing: %', r.body;
    END IF;
  END LOOP;

  ALTER TABLE t ADD COLUMN batch UUID; ALTER TABLE t ADD COLUMN code TEXT;
  UPDATE t SET batch=_batch, code=_code;
  RAISE NOTICE 'PASS 1 (code % in both emails)', _code;
END;
$a$;

-- 2. AN ADULT BARRED FROM ONE CHILD hears nothing about that child, and gets
--    no code, because the code collects both.
DO $a$
DECLARE _sess UUID; _c UUID; _d UUID; _mum2 UUID; _dad2 UUID; _code TEXT; r RECORD;
BEGIN
  SELECT sess,c,d,mum2,dad2 INTO _sess,_c,_d,_mum2,_dad2 FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  SELECT pickup_code INTO _code
  FROM church.check_in_children(_sess, ARRAY[_c,_d]) WHERE NOT refused LIMIT 1;

  SELECT * INTO r FROM church.notification_log n
  WHERE n.kind='check_in' AND n.channel='email' AND n.recipient_person_id=_dad2;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'FAIL 2: the barred father was told nothing at all, even about the child he may collect';
  END IF;
  IF position('ZZLiya' IN r.subject || r.body) > 0 THEN
    RAISE EXCEPTION 'FAIL 2a: a barred adult was told about the child: %', r.body;
  END IF;
  IF position(_code IN r.body) > 0 OR position('pickup code' IN r.body) > 0 THEN
    RAISE EXCEPTION 'FAIL 2b: a barred adult was sent the code that collects her: %', r.body;
  END IF;

  SELECT * INTO r FROM church.notification_log n
  WHERE n.kind='check_in' AND n.channel='email' AND n.recipient_person_id=_mum2;
  IF position('ZZLiya' IN r.body) = 0 OR position(_code IN r.body) = 0 THEN
    RAISE EXCEPTION 'FAIL 2c: the mother lost a child or the code: %', r.body;
  END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. ONE PICKUP EMAIL when both children are collected together.
DO $a$
DECLARE _batch UUID; _mum UUID; _n INT; r RECORD;
BEGIN
  SELECT batch, mum INTO _batch, _mum FROM t;
  UPDATE church.kids_check_ins
     SET status='checked_out', checked_out_at=now(), checkout_method='security_code',
         picked_up_by_name='ZZDawit Letter'
   WHERE batch_id=_batch AND status='checked_in';

  SELECT count(*) INTO _n FROM church.notification_log n
  WHERE n.kind='check_out' AND n.recipient_person_id=_mum;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 3: % pickup emails to one parent for one pickup', _n; END IF;

  SELECT * INTO r FROM church.notification_log n
  WHERE n.kind='check_out' AND n.recipient_person_id=_mum;
  IF r.subject <> 'ZZHana and ZZAbel have been picked up' THEN
    RAISE EXCEPTION 'FAIL 3a: subject was "%"', r.subject;
  END IF;
  IF position('were picked up at ' IN r.body) = 0 OR position(' by ZZDawit Letter.' IN r.body) = 0 THEN
    RAISE EXCEPTION 'FAIL 3b: body was "%"', r.body;
  END IF;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. A REPLAYED CHECK-IN hands back the code already emailed.
DO $a$
DECLARE _sess UUID; _e UUID; _key TEXT := 'zz-letter-' || gen_random_uuid(); _first TEXT; _second TEXT;
BEGIN
  SELECT sess, e INTO _sess, _e FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  SELECT pickup_code INTO _first FROM church.check_in_children(_sess, ARRAY[_e], NULL, NULL, _key) LIMIT 1;
  SELECT pickup_code INTO _second FROM church.check_in_children(_sess, ARRAY[_e], NULL, NULL, _key) LIMIT 1;
  IF _second IS DISTINCT FROM _first THEN
    RAISE EXCEPTION 'FAIL 4: the replay rotated % to %, so the emailed code is dead', _first, _second;
  END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. THE SENDER: waits, gives up on stale notices, and runs one at a time.
DO $a$
DECLARE _mum UUID; _dad UUID; _mrow UUID; _drow UUID; _n INT; r RECORD;
BEGIN
  SELECT mum, dad INTO _mum, _dad FROM t;
  SELECT id INTO _mrow FROM church.notification_log
   WHERE kind='check_in' AND channel='email' AND recipient_person_id=_mum
     AND 'ZZ' = left(subject, 2) AND position('ZZHana' IN subject) > 0;
  SELECT id INTO _drow FROM church.notification_log
   WHERE kind='check_in' AND channel='email' AND recipient_person_id=_dad;

  -- Three hours late, and told to wait.
  UPDATE church.notification_log SET created_at = now() - interval '4 hours' WHERE id = _mrow;
  UPDATE church.notification_log SET not_before = now() + interval '1 hour' WHERE id = _drow;

  SELECT count(*) INTO _n FROM church.claim_queued_notifications(200) c WHERE c.id IN (_mrow, _drow);
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 5: claimed % rows that were stale or told to wait', _n; END IF;
  IF (SELECT status FROM church.notification_log WHERE id=_mrow) <> 'skipped' THEN
    RAISE EXCEPTION 'FAIL 5a: a check-in notice four hours late is still waiting to go out';
  END IF;

  -- Everything just claimed is mid-send, so a second sender gets nothing.
  UPDATE church.notification_log SET not_before = NULL WHERE id = _drow;
  SELECT count(*) INTO _n FROM church.claim_queued_notifications(200);
  IF _n <> 0 THEN RAISE EXCEPTION 'FAIL 5b: a second sender was handed % rows mid-batch', _n; END IF;

  -- "Limit reached" is a wait, not a failed attempt.
  UPDATE church.notification_log SET status='sending', claimed_at=now(), attempts=5 WHERE id=_drow;
  PERFORM church.complete_notification(_drow, false, NULL,
            'You have reached your daily email sending quota.', interval '30 minutes');
  SELECT * INTO r FROM church.notification_log WHERE id=_drow;
  IF r.status <> 'queued' OR r.attempts <> 4 OR r.not_before < now() + interval '29 minutes' THEN
    RAISE EXCEPTION 'FAIL 5c: after a wait the row is %, attempts %, not before %',
      r.status, r.attempts, r.not_before;
  END IF;

  -- A real failure still counts, and the fifth still ends it.
  UPDATE church.notification_log SET status='sending', attempts=5, not_before=NULL WHERE id=_drow;
  PERFORM church.complete_notification(_drow, false, NULL, 'bad address');
  IF (SELECT status FROM church.notification_log WHERE id=_drow) <> 'failed' THEN
    RAISE EXCEPTION 'FAIL 5d: a fifth real failure did not end the row';
  END IF;
  RAISE NOTICE 'PASS 5';
END;
$a$;

-- 6. An urgent classroom message names the room in its subject.
DO $a$
DECLARE _c UUID; _ci UUID; _room TEXT; _subj TEXT;
BEGIN
  SELECT c INTO _c FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  SELECT id, label_room_name INTO _ci, _room FROM church.kids_check_ins
   WHERE child_person_id=_c AND status='checked_in';
  PERFORM church.send_parent_message(_ci, 'Please come to the classroom now.');
  SELECT subject INTO _subj FROM church.notification_log
   WHERE kind='volunteer_message' AND check_in_id=_ci LIMIT 1;
  IF _subj IS DISTINCT FROM 'Please come to ' || coalesce(_room, 'the Children''s Ministry') THEN
    RAISE EXCEPTION 'FAIL 6: subject was "%"', _subj;
  END IF;
  RAISE NOTICE 'PASS 6';
END;
$a$;

-- 7. The approved wording is what is deployed.
DO $a$
BEGIN
  IF position('We would love to help.' IN
       pg_get_functiondef('church.kids_notify_late_pickup(uuid,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'FAIL 7: the late-pickup note is not the approved wording';
  END IF;
  IF position('It is a privilege to' IN
       pg_get_functiondef('church.queue_consent_notifications(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'FAIL 7a: the consent copy is not the approved wording';
  END IF;
  IF has_function_privilege('authenticated',
       'church.complete_notification(uuid,boolean,text,text,interval)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 7b: a signed-in user can mark email as sent';
  END IF;
  RAISE NOTICE 'PASS 7';
END;
$a$;
