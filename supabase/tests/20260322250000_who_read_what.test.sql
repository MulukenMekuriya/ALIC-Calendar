-- Assertions for 20260322250000.

-- 1. THE AUDIT TRAIL IS APPEND ONLY, and not merely by convention. An audit
--    row that the same credential which writes it can rewrite is a log, not
--    an audit trail.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _id UUID; _ok BOOLEAN;
BEGIN
  INSERT INTO church.check_in_audit (organization_id, action, outcome, actor_name)
  VALUES (_md,'sensitive_viewed','success','ZZ Probe') RETURNING id INTO _id;

  _ok := false;
  BEGIN
    UPDATE church.check_in_audit SET actor_name='Somebody Else' WHERE id=_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append only%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 1: AN AUDIT ROW WAS REWRITTEN'; END IF;

  _ok := false;
  BEGIN
    DELETE FROM church.check_in_audit WHERE id=_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append only%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 1b: AN AUDIT ROW WAS DELETED'; END IF;

  -- The grants are gone too, so it is not resting on the trigger alone.
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema='church' AND table_name='check_in_audit'
                AND grantee='service_role' AND privilege_type IN ('UPDATE','DELETE')) THEN
    RAISE EXCEPTION 'FAIL 1c: service_role can still rewrite the audit trail';
  END IF;
  RAISE NOTICE 'PASS 1 (append only, by trigger and by grant)';
END;
$a$;

-- 2-5. The summary, and what it is for.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _admin UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _k1 UUID; _k2 UUID; _k3 UUID; _r RECORD; _n INT; _before INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _admin::TEXT, true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZLogA','L',true) RETURNING id INTO _k1;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZLogB','L',true) RETURNING id INTO _k2;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZLogC','L',true) RETURNING id INTO _k3;

  -- Narrow reader: one child, many times. Broad reader: three children once
  -- each. The second is the one worth noticing.
  INSERT INTO church.check_in_audit (organization_id,action,outcome,actor_name,child_person_id,detail)
  SELECT _md,'sensitive_viewed','success','ZZ Narrow',_k1,'{"record":"safety_card"}'::jsonb
  FROM generate_series(1,8);
  INSERT INTO church.check_in_audit (organization_id,action,outcome,actor_name,child_person_id,detail)
  VALUES (_md,'sensitive_viewed','success','ZZ Broad',_k1,'{"record":"safety_card"}'::jsonb),
         (_md,'sensitive_viewed','success','ZZ Broad',_k2,'{"record":"consent_pdf"}'::jsonb),
         (_md,'sensitive_viewed','success','ZZ Broad',_k3,'{"record":"incident"}'::jsonb);

  -- 2. BREADTH ORDERS THE LIST. ZZ Broad read fewer times but across more
  --    children, and comes first - that is the whole point of the view.
  SELECT * INTO _r FROM church.kids_sensitive_access_summary(_md, current_date, current_date) LIMIT 1;
  IF _r.actor_name <> 'ZZ Broad' THEN
    RAISE EXCEPTION 'FAIL 2: the summary leads with %, not the person who read '
                    'across the most children', _r.actor_name;
  END IF;
  IF _r.children_seen <> 3 THEN RAISE EXCEPTION 'FAIL 2b: children_seen is %', _r.children_seen; END IF;
  IF array_length(_r.record_types,1) <> 3 THEN
    RAISE EXCEPTION 'FAIL 2c: the record types were not collected';
  END IF;

  -- The narrow reader is present and correctly described: many reads, one child.
  SELECT * INTO _r FROM church.kids_sensitive_access_summary(_md, current_date, current_date)
   WHERE actor_name='ZZ Narrow';
  IF _r.reads <> 8 OR _r.children_seen <> 1 THEN
    RAISE EXCEPTION 'FAIL 2d: the narrow reader reads % over % children', _r.reads, _r.children_seen;
  END IF;

  -- 3. READING THE LOG IS RECORDED. A control that exempts itself is not one.
  SELECT count(*) INTO _before FROM church.check_in_audit WHERE action='access_log_read';
  PERFORM church.kids_sensitive_access_summary(_md, current_date, current_date);
  IF (SELECT count(*) FROM church.check_in_audit WHERE action='access_log_read') <= _before THEN
    RAISE EXCEPTION 'FAIL 3: reading the access log left no trace';
  END IF;

  -- 4. ...but NOT as sensitive_viewed, or by next month the report would be
  --    mostly people checking the report.
  IF EXISTS (SELECT 1 FROM church.check_in_audit
              WHERE action='sensitive_viewed' AND detail->>'view' IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 4: reads of the report were written into the report';
  END IF;

  -- 5. The detail filters, so "why did X open..." can be answered.
  SELECT count(*) INTO _n FROM church.kids_sensitive_access_report(
    _md, current_date, current_date, NULL, _k2);
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 5: filtering by child gave % rows', _n; END IF;

  SELECT count(*) INTO _n FROM church.kids_sensitive_access_report(
    _md, current_date, current_date, NULL, NULL, 'incident');
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 5b: filtering by record type gave % rows', _n; END IF;

  -- 6. And the other direction: everything one child's record has shown.
  SELECT count(*) INTO _n FROM church.kids_child_access_history(_k1);
  IF _n <> 9 THEN
    RAISE EXCEPTION 'FAIL 6: a child''s own history shows % reads, expected 9', _n;
  END IF;

  RAISE NOTICE 'PASS 2-6 (breadth first, self-recording, filterable both ways)';
END;
$a$;

-- 7. kids_admin only, in every direction.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _vol UUID := '13708053-2a4d-4c19-bd74-afd88da4cfee';
  _kid UUID; _ok BOOLEAN;
BEGIN
  SELECT id INTO _kid FROM church.people WHERE first_name='ZZLogA' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', _vol::TEXT, true);

  FOR _ok IN SELECT false LOOP END LOOP;

  _ok := false;
  BEGIN PERFORM church.kids_sensitive_access_summary(_md, current_date, current_date);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 7: a volunteer read the access summary'; END IF;

  _ok := false;
  BEGIN PERFORM church.kids_sensitive_access_report(_md, current_date, current_date);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 7b: a volunteer read the access detail'; END IF;

  _ok := false;
  BEGIN PERFORM church.kids_child_access_history(_kid);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 7c: a volunteer read a child''s access history'; END IF;

  RAISE NOTICE 'PASS 7 (admin only, all three doors)';
END;
$a$;
