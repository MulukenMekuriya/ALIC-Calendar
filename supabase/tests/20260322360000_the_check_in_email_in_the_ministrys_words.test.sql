-- Assertions for 20260322360000, inside BEGIN/ROLLBACK.
--
-- The check-in email closes in the ministry's own words, "your child" for one
-- and "your children" for more, with the pickup code still above them.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       '0c2dd974-ba40-4d99-8db5-63804c38ed65'::UUID AS admin_u;

DO $setup$
DECLARE _md UUID; _sess UUID; _h1 UUID; _h2 UUID; _mum UUID; _mum2 UUID; _a UUID; _b UUID; _c UUID;
BEGIN
  SELECT md INTO _md FROM t;
  PERFORM set_config('request.jwt.claim.sub', (SELECT admin_u::TEXT FROM t), true);

  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Words Two') RETURNING id INTO _h1;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZMeseret','Words',false,'zz-words-1@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZHana','Words',true) RETURNING id INTO _a;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZAbel','Words',true) RETURNING id INTO _b;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h1,_mum,'head',true),(_md,_h1,_a,'child',true),(_md,_h1,_b,'child',true);

  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Words One') RETURNING id INTO _h2;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZSara','Words',false,'zz-words-2@example.test',true) RETURNING id INTO _mum2;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZRuth','Words',true) RETURNING id INTO _c;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h2,_mum2,'head',true),(_md,_h2,_c,'child',true);

  SELECT id INTO _sess FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;
  IF _sess IS NULL THEN
    SELECT id INTO _sess FROM church.kids_sessions
     WHERE organization_id=_md ORDER BY session_date DESC LIMIT 1;
    UPDATE church.kids_sessions SET status='open' WHERE id=_sess;
  END IF;
  PERFORM church.set_kids_consent_mode(_md,'warn');

  ALTER TABLE t ADD COLUMN sess UUID; ALTER TABLE t ADD COLUMN mum UUID; ALTER TABLE t ADD COLUMN mum2 UUID;
  ALTER TABLE t ADD COLUMN a UUID; ALTER TABLE t ADD COLUMN b UUID; ALTER TABLE t ADD COLUMN c UUID;
  UPDATE t SET sess=_sess, mum=_mum, mum2=_mum2, a=_a, b=_b, c=_c;
END;
$setup$;

-- 1. Two children: the code, then the ministry's words, exactly.
DO $a$
DECLARE _sess UUID; _a UUID; _b UUID; _mum UUID; _code TEXT; _body TEXT;
BEGIN
  SELECT sess,a,b,mum INTO _sess,_a,_b,_mum FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  SELECT pickup_code INTO _code FROM church.check_in_children(_sess, ARRAY[_a,_b]) WHERE NOT refused LIMIT 1;

  SELECT body INTO _body FROM church.notification_log
   WHERE kind='check_in' AND channel='email' AND recipient_person_id=_mum;

  IF right(_body, length(
       E'Your pickup code is ' || _code || E'.\n\n'
       || E'We’re so glad your children are joining us this morning! Please keep your pickup slip with you, as you’ll need it when you pick up your children.\n\n'
       || E'May you be blessed and encouraged as you worship in God’s presence.'))
     <> E'Your pickup code is ' || _code || E'.\n\n'
       || E'We’re so glad your children are joining us this morning! Please keep your pickup slip with you, as you’ll need it when you pick up your children.\n\n'
       || E'May you be blessed and encouraged as you worship in God’s presence.' THEN
    RAISE EXCEPTION 'FAIL 1: the email does not close in the ministry''s words: %', _body;
  END IF;
  IF position('• ZZHana, ' IN _body) = 0 OR position('• ZZAbel, ' IN _body) = 0 THEN
    RAISE EXCEPTION 'FAIL 1a: the children and their rooms are gone: %', _body;
  END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. One child: "your child", not "your children".
DO $a$
DECLARE _sess UUID; _c UUID; _mum2 UUID; _body TEXT;
BEGIN
  SELECT sess,c,mum2 INTO _sess,_c,_mum2 FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  PERFORM church.check_in_children(_sess, ARRAY[_c]);

  SELECT body INTO _body FROM church.notification_log
   WHERE kind='check_in' AND channel='email' AND recipient_person_id=_mum2;

  IF position('We’re so glad your child is joining us this morning!' IN _body) = 0
     OR position('when you pick up your child.' IN _body) = 0
     OR position('children' IN _body) > 0 THEN
    RAISE EXCEPTION 'FAIL 2: one child, but the email reads: %', _body;
  END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;
