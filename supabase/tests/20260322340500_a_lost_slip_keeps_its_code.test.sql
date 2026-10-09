-- Assertions for 20260322340500, inside BEGIN/ROLLBACK.
--
-- A reprint now prints the code the family already has, because that code is
-- also on every child's tag. Group 1 is what the parent and the teacher see;
-- the rest is the fallback, which must still produce a slip that works.

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
    VALUES (_md,'ZZ Slip Family') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZSMum','Slip',false) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZAlpha','Slip',true) RETURNING id INTO _a;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZBeta','Slip',true) RETURNING id INTO _b;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZGamma','Slip',true) RETURNING id INTO _c;
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

  PERFORM church.set_kids_consent_mode(_md,'warn');

  ALTER TABLE t ADD COLUMN a UUID; ALTER TABLE t ADD COLUMN b UUID;
  ALTER TABLE t ADD COLUMN c UUID; ALTER TABLE t ADD COLUMN sess UUID;
  UPDATE t SET a=_a, b=_b, c=_c, sess=_sess;
END;
$setup$;

-- 0. The function the desk and the kiosk call has not changed shape.
DO $a$
BEGIN
  IF pg_get_function_result('church.reprint_pickup_label(uuid,text,text)'::regprocedure)
     <> 'TABLE(batch_id uuid, pickup_code text, pickup_token text, household_name text, '
        'check_in_id uuid, child_name text, room_name text, tag_number integer, '
        'allergy_label text, guardian_phone text)' THEN
    RAISE EXCEPTION 'FAIL 0: reprint_pickup_label changed its columns - every '
                    'client still reads the old ones';
  END IF;
  IF NOT has_function_privilege('authenticated',
       'church.reprint_pickup_label(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0b: the desk can no longer reprint';
  END IF;
  IF has_function_privilege('anon',
       'church.reprint_pickup_label(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0c: anon can reprint a pickup slip';
  END IF;
  RAISE NOTICE 'PASS 0';
END;
$a$;

-- 1. CHECK-IN KEEPS THE CODE, AND A REPRINT PRINTS IT AGAIN.
DO $a$
DECLARE
  _sess UUID; _a UUID; _b UUID; _c UUID;
  _batch UUID; _code TEXT; _token TEXT; _hash BYTEA; _rotated TIMESTAMPTZ;
  _n INT;
BEGIN
  SELECT sess,a,b,c INTO _sess,_a,_b,_c FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  SELECT batch_id, pickup_code, pickup_token INTO _batch, _code, _token
  FROM church.check_in_children(_sess, ARRAY[_a,_b,_c])
  WHERE NOT refused LIMIT 1;
  IF _batch IS NULL THEN RAISE EXCEPTION 'FAIL 1: the family did not check in'; END IF;

  IF NOT EXISTS (SELECT 1 FROM church.kids_check_in_secrets s
                  WHERE s.batch_id = _batch
                    AND s.pickup_code = _code AND s.pickup_token = _token
                    AND s.code_hash = church.hash_pickup(_code)
                    AND s.token_hash = church.hash_pickup(_token)) THEN
    RAISE EXCEPTION 'FAIL 1a: check_in_children did not keep the code it printed';
  END IF;

  SELECT code_hash, rotated_at INTO _hash, _rotated
  FROM church.kids_check_in_secrets WHERE batch_id = _batch;

  CREATE TEMP TABLE rp AS
  SELECT * FROM church.reprint_pickup_label(_batch, 'left it in the car');

  SELECT count(*) INTO _n FROM rp;
  IF _n <> 3 THEN RAISE EXCEPTION 'FAIL 1b: % rows for 3 children still in', _n; END IF;

  IF EXISTS (SELECT 1 FROM rp WHERE pickup_code IS DISTINCT FROM _code) THEN
    RAISE EXCEPTION 'FAIL 1c: the reprint printed % - the children''s tags say %',
      (SELECT pickup_code FROM rp LIMIT 1), _code;
  END IF;
  IF EXISTS (SELECT 1 FROM rp WHERE pickup_token IS DISTINCT FROM _token) THEN
    RAISE EXCEPTION 'FAIL 1d: same code, new QR - the old slip would scan as unknown';
  END IF;

  IF (SELECT code_hash FROM church.kids_check_in_secrets WHERE batch_id = _batch)
       <> _hash
     OR (SELECT rotated_at FROM church.kids_check_in_secrets WHERE batch_id = _batch)
       <> _rotated THEN
    RAISE EXCEPTION 'FAIL 1e: the secret was rotated under a kept code';
  END IF;

  -- The code on the children's tags, and on the slip the parent may still
  -- find, still collects them.
  SELECT count(*) INTO _n FROM church.resolve_pickup(_sess, _code);
  IF _n <> 3 THEN
    RAISE EXCEPTION 'FAIL 1f: the original code resolves to % children after a reprint', _n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM church.check_in_audit
                  WHERE batch_id = _batch AND action = 'label_reprint'
                    AND detail->>'code_kept' = 'true'
                    AND detail->>'reason' = 'left it in the car') THEN
    RAISE EXCEPTION 'FAIL 1g: the reprint left no audit row saying the code was kept';
  END IF;

  -- Twice is the same as once.
  IF EXISTS (SELECT 1 FROM church.reprint_pickup_label(_batch)
              WHERE pickup_code IS DISTINCT FROM _code) THEN
    RAISE EXCEPTION 'FAIL 1h: a second reprint changed the code';
  END IF;

  ALTER TABLE t ADD COLUMN batch UUID; ALTER TABLE t ADD COLUMN code TEXT;
  UPDATE t SET batch = _batch, code = _code;
  DROP TABLE rp;
  RAISE NOTICE 'PASS 1 (code % kept)', _code;
END;
$a$;

-- 2. A BATCH WITH NO CODE ON FILE - checked in before this migration - still
--    reprints, by rotating exactly as it used to, and keeps what it minted.
DO $a$
DECLARE _sess UUID; _batch UUID; _old TEXT; _new TEXT; _n INT;
BEGIN
  SELECT sess, batch, code INTO _sess, _batch, _old FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  UPDATE church.kids_check_in_secrets
     SET pickup_code = NULL, pickup_token = NULL
   WHERE batch_id = _batch;

  SELECT pickup_code INTO _new FROM church.reprint_pickup_label(_batch) LIMIT 1;

  IF _new IS NULL OR _new = _old THEN
    RAISE EXCEPTION 'FAIL 2: no code on file, and the reprint returned %', _new;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM church.kids_check_in_secrets s
                  WHERE s.batch_id = _batch AND s.pickup_code = _new
                    AND s.code_hash = church.hash_pickup(_new)) THEN
    RAISE EXCEPTION 'FAIL 2a: the rotated code was not kept, so the next reprint rotates again';
  END IF;
  SELECT count(*) INTO _n FROM church.resolve_pickup(_sess, _new);
  IF _n <> 3 THEN RAISE EXCEPTION 'FAIL 2b: the new code resolves to % children', _n; END IF;
  IF NOT EXISTS (SELECT 1 FROM church.check_in_audit
                  WHERE batch_id = _batch AND action = 'label_reprint'
                    AND detail->>'code_kept' = 'false') THEN
    RAISE EXCEPTION 'FAIL 2c: a rotation was audited as kept';
  END IF;

  UPDATE t SET code = _new;
  RAISE NOTICE 'PASS 2 (% rotated to %)', _old, _new;
END;
$a$;

-- 3. A STALE COPY IS NEVER PRINTED. If something rotates the hash and forgets
--    the copy, the copy is a dead code; the reprint must notice and rotate.
DO $a$
DECLARE _sess UUID; _batch UUID; _live TEXT; _stale TEXT; _got TEXT; _n INT;
BEGIN
  SELECT sess, batch, code INTO _sess, _batch, _live FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  LOOP
    _stale := church.generate_pickup_code();
    EXIT WHEN _stale <> _live;
  END LOOP;
  UPDATE church.kids_check_in_secrets SET pickup_code = _stale WHERE batch_id = _batch;

  SELECT pickup_code INTO _got FROM church.reprint_pickup_label(_batch) LIMIT 1;
  IF _got = _stale THEN
    RAISE EXCEPTION 'FAIL 3: printed the stale copy %, which resolves to nothing', _stale;
  END IF;
  SELECT count(*) INTO _n FROM church.resolve_pickup(_sess, _got);
  IF _n <> 3 THEN RAISE EXCEPTION 'FAIL 3a: the printed code resolves to % children', _n; END IF;

  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. A REPLAYED CHECK-IN rotates, as it always has, and keeps the copy in step
--    - otherwise every reprint after a lost response would rotate as well.
DO $a$
DECLARE
  _md UUID; _sess UUID; _h UUID; _kid UUID; _key TEXT := 'zz-slip-' || gen_random_uuid();
  _batch UUID; _first TEXT; _second TEXT; _kept TEXT;
BEGIN
  SELECT md, sess INTO _md, _sess FROM t;
  PERFORM set_config('request.jwt.claim.sub',(SELECT admin_u::TEXT FROM t),true);

  INSERT INTO church.households (organization_id,name)
    VALUES (_md,'ZZ Replay Family') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZDelta','Replay',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role,is_primary_household)
    VALUES (_md,_h,_kid,'child',true);

  SELECT batch_id, pickup_code INTO _batch, _first
  FROM church.check_in_children(_sess, ARRAY[_kid], NULL, NULL, _key) LIMIT 1;
  SELECT pickup_code INTO _second
  FROM church.check_in_children(_sess, ARRAY[_kid], NULL, NULL, _key) LIMIT 1;

  IF _second IS NULL THEN RAISE EXCEPTION 'FAIL 4: the replay returned no code'; END IF;
  SELECT pickup_code INTO _kept FROM church.kids_check_in_secrets WHERE batch_id = _batch;
  IF _kept IS DISTINCT FROM _second THEN
    RAISE EXCEPTION 'FAIL 4a: replay printed % but kept %', _second, _kept;
  END IF;
  IF (SELECT pickup_code FROM church.reprint_pickup_label(_batch) LIMIT 1)
       IS DISTINCT FROM _second THEN
    RAISE EXCEPTION 'FAIL 4b: a reprint after a replay did not keep the replayed code';
  END IF;

  RAISE NOTICE 'PASS 4 (% then %)', _first, _second;
END;
$a$;
