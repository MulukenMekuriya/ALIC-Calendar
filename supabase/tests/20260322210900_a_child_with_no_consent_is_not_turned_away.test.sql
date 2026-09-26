-- Assertions for 20260322210900, inside BEGIN/ROLLBACK.
--
-- This rewrites check_in_children, which runs on every check-in on a Sunday
-- morning. Group 1 is entirely about what has NOT changed.

-- Build a family we control, and a session.
CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       '0c2dd974-ba40-4d99-8db5-63804c38ed65'::UUID AS admin_u;

DO $setup$
DECLARE
  _md UUID; _h UUID; _mum UUID; _a UUID; _b UUID; _c UUID; _sess UUID;
BEGIN
  SELECT md INTO _md FROM t;
  PERFORM set_config('request.jwt.claim.sub',
                     (SELECT admin_u::TEXT FROM t), true);

  INSERT INTO church.households (organization_id,name)
    VALUES (_md,'ZZ Gate Family') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZGMum','Gate',false,'zzg@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZAlpha','Gate',true) RETURNING id INTO _a;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZBeta','Gate',true) RETURNING id INTO _b;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZGamma','Gate',true) RETURNING id INTO _c;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h,_mum,'head',true),(_md,_h,_a,'child',true),
           (_md,_h,_b,'child',true),(_md,_h,_c,'child',true);

  SELECT id INTO _sess FROM church.kids_sessions
   WHERE organization_id=_md AND status='open' ORDER BY session_date DESC LIMIT 1;
  IF _sess IS NULL THEN
    SELECT id INTO _sess FROM church.kids_sessions
     WHERE organization_id=_md ORDER BY session_date DESC LIMIT 1;
    UPDATE church.kids_sessions SET status='open' WHERE id=_sess;
  END IF;

  ALTER TABLE t ADD COLUMN h UUID; ALTER TABLE t ADD COLUMN mum UUID;
  ALTER TABLE t ADD COLUMN a UUID; ALTER TABLE t ADD COLUMN b UUID;
  ALTER TABLE t ADD COLUMN c UUID; ALTER TABLE t ADD COLUMN sess UUID;
  UPDATE t SET h=_h, mum=_mum, a=_a, b=_b, c=_c, sess=_sess;
END;
$setup$;

-- 1. WARN MODE CHECKS EVERYBODY IN, exactly as today. This is what makes the
--    migration safe to deploy on a Saturday.
DO $a$
DECLARE _r RECORD; _n INT; _refused INT; _md UUID; _sess UUID; _a UUID; _b UUID; _c UUID;
BEGIN
  SELECT md,sess,a,b,c INTO _md,_sess,_a,_b,_c FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  PERFORM church.set_kids_consent_mode(_md,'warn');

  -- ONE call. Calling check_in_children twice for the same children in one
  -- session violates uq_kids_check_ins_one_active_per_session, which is the
  -- constraint doing its job - so everything is asserted off this one result.
  CREATE TEMP TABLE r1 AS
  SELECT * FROM church.check_in_children(_sess, ARRAY[_a,_b,_c]);

  SELECT count(*), count(*) FILTER (WHERE refused) INTO _n, _refused FROM r1;

  IF _n <> 3 THEN RAISE EXCEPTION 'FAIL 1: % rows for 3 children', _n; END IF;
  IF _refused <> 0 THEN
    RAISE EXCEPTION 'FAIL 1b: warn mode refused % children - this migration was '
                    'supposed to ship inert', _refused;
  END IF;
  IF (SELECT count(*) FROM church.kids_check_ins ci
       WHERE ci.child_person_id IN (_a,_b,_c) AND ci.status='checked_in') <> 3 THEN
    RAISE EXCEPTION 'FAIL 1c: not every child actually got a row';
  END IF;

  -- Every one of them has a real code and a real room.
  IF EXISTS (SELECT 1 FROM r1 WHERE pickup_code IS NULL OR room_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL 1d: an accepted child came back with no code or no room';
  END IF;

  -- ...and the NOTE rides along on the accepted row, so the desk can mention
  -- the form while the parent is still standing there. This is the whole
  -- reason consent_state is a separate column from the refusal ones.
  IF (SELECT count(*) FROM r1 WHERE consent_state = 'no_signature') <> 3 THEN
    RAISE EXCEPTION 'FAIL 1e: accepted children carry no consent note';
  END IF;
  IF EXISTS (SELECT 1 FROM r1 WHERE refusal_code IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 1f: a warning was written into the refusal columns';
  END IF;

  DROP TABLE r1;
  RAISE NOTICE 'PASS 1 (warn mode checks everybody in, and notes the form)';
END;
$a$;

-- 2. THE SIBLING TEST, under consent. Enforcing, one child covered, two not:
--    the covered child gets a REAL row and a REAL code, the others are
--    refused as data. This is the assertion that proves the batch was not
--    aborted.
DO $a$
DECLARE
  _md UUID; _sess UUID; _h UUID; _mum UUID; _a UUID; _b UUID; _c UUID;
  _ans JSONB; _r RECORD; _acc INT; _ref INT; _code TEXT;
BEGIN
  SELECT md,sess,h,mum,a,b,c INTO _md,_sess,_h,_mum,_a,_b,_c FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  -- Clear the morning so the children can be checked in again.
  DELETE FROM church.kids_check_ins WHERE child_person_id IN (_a,_b,_c);

  -- Sign for ONE of the three.
  SELECT jsonb_object_agg(r,'true') INTO _ans
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;
  PERFORM church.sign_kids_consent(_md,_h,ARRAY[_a],_mum,'ZZ G Mum','kiosk',_ans);

  -- Enforce, as of today.
  PERFORM church.set_kids_consent_mode(_md,'block',current_date + 1);
  UPDATE church.kids_consent_policy SET enforce_from = current_date
   WHERE organization_id = _md;

  SELECT count(*) FILTER (WHERE NOT x.refused),
         count(*) FILTER (WHERE x.refused),
         max(x.pickup_code) FILTER (WHERE NOT x.refused)
    INTO _acc, _ref, _code
  FROM church.check_in_children(_sess, ARRAY[_a,_b,_c]) x;

  IF _acc <> 1 THEN RAISE EXCEPTION 'FAIL 2: % children accepted, expected 1', _acc; END IF;
  IF _ref <> 2 THEN RAISE EXCEPTION 'FAIL 2b: % refused, expected 2', _ref; END IF;
  IF _code IS NULL THEN
    RAISE EXCEPTION 'FAIL 2c: the accepted child got no pickup code - the family '
                    'would leave the desk with a label that opens nothing';
  END IF;

  -- The covered child is really in a room.
  IF (SELECT count(*) FROM church.kids_check_ins ci
       WHERE ci.child_person_id=_a AND ci.status='checked_in') <> 1 THEN
    RAISE EXCEPTION 'FAIL 2d: the signed child was not actually checked in';
  END IF;
  -- The refused ones are not.
  IF EXISTS (SELECT 1 FROM church.kids_check_ins ci
              WHERE ci.child_person_id IN (_b,_c) AND ci.status='checked_in') THEN
    RAISE EXCEPTION 'FAIL 2e: a refused child got a row anyway';
  END IF;

  -- A REFUSED CHILD CARRIES NO CODE. Their parent must never hold one.
  IF EXISTS (SELECT 1 FROM church.check_in_children(_sess, ARRAY[_b]) x
              WHERE x.refused AND x.pickup_code IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 2f: a refused child came back with a pickup code';
  END IF;

  RAISE NOTICE 'PASS 2 (sibling test: one in with a code, two refused as data)';
END;
$a$;

-- 3. THE ROOM ALIGNMENT TRAP. With explicit _room_ids and the FIRST child
--    refused, the remaining siblings must land in THEIR OWN rooms - not
--    shifted up by one. _idx advancing for every child is what prevents it,
--    and the failure is silent, which is why it is asserted.
DO $a$
DECLARE
  _md UUID; _sess UUID; _a UUID; _b UUID; _c UUID;
  _r1 UUID; _r2 UUID; _r3 UUID; _got_b UUID; _got_c UUID;
BEGIN
  SELECT md,sess,a,b,c INTO _md,_sess,_a,_b,_c FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  DELETE FROM church.kids_check_ins WHERE child_person_id IN (_a,_b,_c);

  SELECT array_agg(room_id ORDER BY room_id) INTO _r1
  FROM (SELECT ksr.room_id FROM church.kids_session_rooms ksr
         JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
        WHERE ksr.kids_session_id=_sess AND ksr.is_open
          AND rkc.is_checkin_location LIMIT 1) z;

  SELECT ksr.room_id INTO _r1 FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND rkc.is_checkin_location
   ORDER BY rkc.sort_order LIMIT 1;
  SELECT ksr.room_id INTO _r2 FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND rkc.is_checkin_location
     AND ksr.room_id <> _r1 ORDER BY rkc.sort_order LIMIT 1;
  SELECT ksr.room_id INTO _r3 FROM church.kids_session_rooms ksr
   JOIN church.room_kids_config rkc ON rkc.room_id=ksr.room_id
   WHERE ksr.kids_session_id=_sess AND ksr.is_open AND rkc.is_checkin_location
     AND ksr.room_id NOT IN (_r1,_r2) ORDER BY rkc.sort_order LIMIT 1;

  IF _r3 IS NULL THEN RAISE EXCEPTION 'SKIP: fewer than three classrooms open'; END IF;

  -- _a is the unsigned one now: revoke its signature so IT is refused and the
  -- two AFTER it are the ones whose rooms could shift.
  UPDATE church.consent_signatures SET revoked_at = now(), revoked_by_name='test'
   WHERE id IN (SELECT cc.consent_signature_id FROM church.consent_children cc
                 WHERE cc.child_person_id = _a);
  -- ...and sign for the other two.
  DECLARE _h UUID; _mum UUID; _ans JSONB;
  BEGIN
    SELECT h,mum INTO _h,_mum FROM t;
    SELECT jsonb_object_agg(r,'true') INTO _ans
    FROM church.consent_documents d, unnest(d.required_acknowledgments) r
    WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;
    PERFORM church.sign_kids_consent(_md,_h,ARRAY[_b,_c],_mum,'ZZ G Mum','kiosk',_ans);
  END;

  PERFORM church.check_in_children(_sess, ARRAY[_a,_b,_c], ARRAY[_r1,_r2,_r3]);

  SELECT ci.room_id INTO _got_b FROM church.kids_check_ins ci
   WHERE ci.child_person_id=_b AND ci.status='checked_in';
  SELECT ci.room_id INTO _got_c FROM church.kids_check_ins ci
   WHERE ci.child_person_id=_c AND ci.status='checked_in';

  IF _got_b <> _r2 THEN
    RAISE EXCEPTION 'FAIL 3: with the first child refused, the second landed in '
                    'the wrong classroom - _room_ids is positional and the index '
                    'did not advance';
  END IF;
  IF _got_c <> _r3 THEN
    RAISE EXCEPTION 'FAIL 3b: the third child landed in the wrong classroom';
  END IF;
  RAISE NOTICE 'PASS 3 (rooms stay aligned when an earlier sibling is refused)';
END;
$a$;

-- 4. EVERY CHILD REFUSED writes NOTHING AT ALL - no batch, no secret, no code
--    minted, no SMS queued. Nothing to print and nothing to lose.
DO $a$
DECLARE
  _md UUID; _sess UUID; _a UUID; _b UUID; _c UUID;
  _batches INT; _secrets INT; _r RECORD; _n INT;
BEGIN
  SELECT md,sess,a,b,c INTO _md,_sess,_a,_b,_c FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  DELETE FROM church.kids_check_ins WHERE child_person_id IN (_a,_b,_c);
  UPDATE church.consent_signatures SET revoked_at = now(), revoked_by_name='test'
   WHERE id IN (SELECT cc.consent_signature_id FROM church.consent_children cc
                 WHERE cc.child_person_id IN (_a,_b,_c));

  SELECT count(*) INTO _batches FROM church.kids_check_in_batches;
  SELECT count(*) INTO _secrets FROM church.kids_check_in_secrets;

  SELECT count(*) INTO _n FROM church.check_in_children(_sess, ARRAY[_a,_b,_c]) x
   WHERE x.refused;
  IF _n <> 3 THEN RAISE EXCEPTION 'FAIL 4: % of 3 refused', _n; END IF;

  IF (SELECT count(*) FROM church.kids_check_in_batches) <> _batches THEN
    RAISE EXCEPTION 'FAIL 4b: an all-refused check-in still created a batch';
  END IF;
  IF (SELECT count(*) FROM church.kids_check_in_secrets) <> _secrets THEN
    RAISE EXCEPTION 'FAIL 4c: an all-refused check-in still minted a pickup code';
  END IF;

  -- Every refused row names the remedy rather than only the refusal.
  IF EXISTS (SELECT 1 FROM church.check_in_children(_sess, ARRAY[_a,_b,_c]) x
              WHERE x.refused AND coalesce(x.refusal_message,'') NOT ILIKE '%desk%'
                AND coalesce(x.refusal_message,'') NOT ILIKE '%leader%') THEN
    RAISE EXCEPTION 'FAIL 4d: a refusal left the parent with nothing to do about it';
  END IF;
  RAISE NOTICE 'PASS 4 (all refused: nothing written, and the copy names a remedy)';
END;
$a$;

-- 5. A HOLD OUTRANKS PAPERWORK. Both apply; the family must be told the one
--    that is actually true, or they fix the wrong thing at the desk.
DO $a$
DECLARE
  _md UUID; _sess UUID; _a UUID; _code TEXT;
BEGIN
  SELECT md,sess,a INTO _md,_sess,_a FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  DELETE FROM church.kids_check_ins WHERE child_person_id=_a;

  PERFORM church.kids_raise_check_in_hold(_a, 'Collected very late three weeks running');

  SELECT x.refusal_code INTO _code
  FROM church.check_in_children(_sess, ARRAY[_a]) x WHERE x.refused;

  IF _code <> 'check_in_held' THEN
    RAISE EXCEPTION 'FAIL 5: a held child was told it was a consent problem (%)', _code;
  END IF;
  RAISE NOTICE 'PASS 5 (a hold is reported as a hold, not as paperwork)';
END;
$a$;

-- 6. A CHILD WITH NO GUARDIAN gets a different code, because the remedy is
--    different: register the family, not sign a form.
DO $a$
DECLARE _md UUID; _sess UUID; _orphan UUID; _code TEXT;
BEGIN
  SELECT md,sess INTO _md,_sess FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZNoHome','Gate',true) RETURNING id INTO _orphan;

  SELECT x.refusal_code INTO _code
  FROM church.check_in_children(_sess, ARRAY[_orphan]) x WHERE x.refused;
  IF _code <> 'consent_no_guardian' THEN
    RAISE EXCEPTION 'FAIL 6: a child with no guardian got %', _code;
  END IF;
  RAISE NOTICE 'PASS 6 (no guardian is its own code)';
END;
$a$;

-- 7. A LEADER'S EXCEPTION lets them through, and the replay branch still
--    returns sixteen columns - the arity bug that only shows at EXECUTION.
DO $a$
DECLARE
  _md UUID; _sess UUID; _b UUID; _n INT; _key TEXT; _first UUID;
BEGIN
  SELECT md,sess,b INTO _md,_sess,_b FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  DELETE FROM church.kids_check_ins WHERE child_person_id=_b;

  PERFORM church.kids_grant_consent_exception(_b, _sess, 'Grandparent doing the drop-off');

  _key := 'assert-replay-' || gen_random_uuid()::TEXT;
  SELECT count(*) INTO _n FROM church.check_in_children(
    _sess, ARRAY[_b], NULL, NULL, _key) x WHERE NOT x.refused;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 7: the exception did not let them in'; END IF;

  -- The SAME key again: the replay branch. RETURN QUERY arity is validated at
  -- EXECUTION, not at CREATE, so only actually running it proves it.
  SELECT count(*) INTO _n FROM church.check_in_children(
    _sess, ARRAY[_b], NULL, NULL, _key) x;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 7b: the replay returned % rows', _n; END IF;
  RAISE NOTICE 'PASS 7 (exception lets them in; the replay branch has 16 columns)';
END;
$a$;

-- 8. MODE OFF asks the gate nothing and refuses nobody.
DO $a$
DECLARE _md UUID; _sess UUID; _orphan UUID; _n INT;
BEGIN
  SELECT md,sess INTO _md,_sess FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);
  PERFORM church.set_kids_consent_mode(_md,'off');

  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZOffKid','Gate',true) RETURNING id INTO _orphan;

  -- One call again: a second would be a duplicate check-in, not a re-read.
  CREATE TEMP TABLE r8 AS
  SELECT * FROM church.check_in_children(_sess, ARRAY[_orphan]);

  IF (SELECT count(*) FROM r8 WHERE refused) <> 0 THEN
    RAISE EXCEPTION 'FAIL 8: mode off still refused a child with no guardian at all';
  END IF;
  -- ...and says nothing either. With consent off the gate is never asked, so
  -- there is no state to report and none should be invented.
  IF EXISTS (SELECT 1 FROM r8 WHERE consent_state IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 8b: mode off still annotated the row';
  END IF;
  DROP TABLE r8;
  RAISE NOTICE 'PASS 8 (off is off)';
END;
$a$;
