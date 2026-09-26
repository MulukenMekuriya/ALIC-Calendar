-- Assertions for 20260322240000.

-- 1. THE REPORT CANNOT DELETE. Not by convention — kids_records_due_for_purge
--    is declared STABLE, and Postgres forbids a STABLE function from writing.
DO $a$
DECLARE _vol CHAR;
BEGIN
  SELECT p.provolatile INTO _vol FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='church' AND p.proname='kids_records_due_for_purge';
  IF _vol <> 's' THEN
    RAISE EXCEPTION 'FAIL 1: the "report what is due" function is volatile (%), '
                    'so nothing stops it deleting', _vol;
  END IF;

  -- And exactly one function here CAN delete.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='church'
         AND p.proname IN ('kids_records_due_for_purge','kids_retention_sweep',
                           'kids_set_legal_hold','confirm_kids_purge')
         AND pg_get_functiondef(p.oid) ILIKE '%DELETE FROM%') <> 1 THEN
    RAISE EXCEPTION 'FAIL 1b: more than one retention function can delete';
  END IF;
  RAISE NOTICE 'PASS 1 (only confirm_kids_purge can delete)';
END;
$a$;

-- 2. The schedule is seeded, with a reason against every number.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _n INT;
BEGIN
  -- Named, not counted. This asserted `count(*) = 4` until 20260322260000
  -- added safeguarding_report as a fifth, and a bare count turns every
  -- legitimate addition into a failure while quietly tolerating a
  -- substitution - four rows is four rows even if the wrong one went
  -- missing. What matters is that these four are THERE.
  SELECT count(*) INTO _n FROM unnest(ARRAY[
    'consent_signature','injury_report','behaviour_report','late_collection']) t
   WHERE NOT EXISTS (SELECT 1 FROM church.record_retention r
                      WHERE r.organization_id=_md AND r.record_type=t);
  IF _n > 0 THEN
    RAISE EXCEPTION 'FAIL 2: % of the four seeded record types have no '
                    'retention period, so nothing says how long the church '
                    'keeps them', _n;
  END IF;
  IF EXISTS (SELECT 1 FROM church.record_retention
              WHERE organization_id=_md AND length(btrim(basis)) < 10) THEN
    RAISE EXCEPTION 'FAIL 2b: a retention period has no stated basis';
  END IF;
  SELECT count(*) INTO _n FROM church.record_retention WHERE organization_id=_md;
  RAISE NOTICE 'PASS 2 (% periods, the four seeded ones present, each with a reason)', _n;
END;
$a$;

-- 3-7. Holds, due-ness, and the purge.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _kid UUID; _safe UUID; _beh UUID; _held UUID; _r RECORD; _n INT; _ok BOOLEAN;
  _before INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,birth_year)
    VALUES (_md,'ZZRetKid','R',true,1990) RETURNING id INTO _kid;

  -- 3. EVERY SAFEGUARDING ROW IS HELD, automatically, on insert.
  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, reported_narrative, reported_by_name)
  VALUES (_md,_kid,current_date - 4000,'safeguarding',
    'Something a child said that a leader needs to know about today.','ZZ Teacher')
  RETURNING id INTO _safe;

  IF NOT (SELECT legal_hold FROM church.kids_incidents WHERE id=_safe) THEN
    RAISE EXCEPTION 'FAIL 3: a safeguarding report was not held automatically';
  END IF;

  -- ...and cannot be released, because the trigger puts it straight back.
  PERFORM church.kids_set_legal_hold('injury_report', _safe, false, 'trying to release it');
  IF NOT (SELECT legal_hold FROM church.kids_incidents WHERE id=_safe) THEN
    RAISE EXCEPTION 'FAIL 3b: a safeguarding hold was released';
  END IF;

  -- 4. An old behaviour note IS due, and a held one is NOT.
  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, reported_narrative, reported_by_name)
  VALUES (_md,_kid,current_date - 4000,'behaviour',
    'Found it hard to settle during the story and needed time out of the circle.','ZZ Teacher')
  RETURNING id INTO _beh;
  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, reported_narrative, reported_by_name, legal_hold)
  VALUES (_md,_kid,current_date - 4000,'behaviour',
    'Another old note, but this one is wanted for an open matter.','ZZ Teacher', true)
  RETURNING id INTO _held;

  SELECT * INTO _r FROM church.kids_records_due_for_purge(_md)
   WHERE record_type='behaviour_report';
  IF _r.due_count < 1 THEN RAISE EXCEPTION 'FAIL 4: an old note is not due'; END IF;
  IF _r.held_count < 1 THEN RAISE EXCEPTION 'FAIL 4b: the held note is not counted as held'; END IF;

  -- 5. THE REPORT DELETES NOTHING. Called twice, the rows are still there.
  SELECT count(*) INTO _before FROM church.kids_incidents WHERE child_person_id=_kid;
  PERFORM church.kids_records_due_for_purge(_md);
  PERFORM church.kids_records_due_for_purge(_md);
  IF (SELECT count(*) FROM church.kids_incidents WHERE child_person_id=_kid) <> _before THEN
    RAISE EXCEPTION 'FAIL 5: reporting what is due removed something';
  END IF;

  -- 6. A purge needs a REASON, and it is the only thing that removes rows.
  _ok := false;
  BEGIN
    PERFORM church.confirm_kids_purge(_md,'behaviour_report','no');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%reason_required%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 6: records were purged with no reason'; END IF;

  SELECT church.confirm_kids_purge(
    _md,'behaviour_report','Agreed at the ministry meeting, two-year schedule') INTO _n;
  IF _n < 1 THEN RAISE EXCEPTION 'FAIL 6b: the purge removed nothing'; END IF;

  -- 7. THE HELD ROW SURVIVED, and so did the safeguarding one.
  IF NOT EXISTS (SELECT 1 FROM church.kids_incidents WHERE id=_held) THEN
    RAISE EXCEPTION 'FAIL 7: A ROW UNDER LEGAL HOLD WAS DELETED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM church.kids_incidents WHERE id=_safe) THEN
    RAISE EXCEPTION 'FAIL 7b: a safeguarding report was deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM church.kids_incidents WHERE id=_beh) THEN
    RAISE EXCEPTION 'FAIL 7c: the due note was not actually removed';
  END IF;

  -- The audit row outlives the records it describes.
  IF NOT EXISTS (SELECT 1 FROM church.check_in_audit
                  WHERE action='records_purged'
                    AND detail->>'record_type'='behaviour_report'
                    AND (detail->>'removed')::INT >= 1) THEN
    RAISE EXCEPTION 'FAIL 7d: the purge left no audit row';
  END IF;

  RAISE NOTICE 'PASS 3-7 (holds survive, only a confirmed purge deletes)';
END;
$a$;

-- 8. AN INJURY FOR A CHILD WHOSE AGE IS UNKNOWN IS NEVER DUE. 415 of 534
--    children have no grade and only 117 a birth year; quietly deleting an
--    injury record for a child who might still be fifteen is not a risk
--    worth taking to tidy a table.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _kid UUID; _inc UUID; _r RECORD; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZNoAgeKid','N',true) RETURNING id INTO _kid;
  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, reported_narrative, reported_by_name)
  VALUES (_md,_kid,current_date - 5000,'injury',
    'Fell from the step by the door and grazed a knee, a very long time ago.','ZZ Teacher')
  RETURNING id INTO _inc;

  SELECT church.confirm_kids_purge(
    _md,'injury_report','Routine seven-year clear-out') INTO _n;

  IF NOT EXISTS (SELECT 1 FROM church.kids_incidents WHERE id=_inc) THEN
    RAISE EXCEPTION 'FAIL 8: an injury record was deleted for a child whose age '
                    'nobody knows';
  END IF;
  RAISE NOTICE 'PASS 8 (unknown age is never due)';
END;
$a$;

-- 9. A CONSENT STILL IN FORCE IS NEVER DUE, however old. The form is the
--    evidence of a consent that has not been withdrawn.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _h UUID; _mum UUID; _kid UUID; _sig UUID; _ans JSONB; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Ret') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZRetMum','R',false) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZRetChild','R',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');
  SELECT jsonb_object_agg(r,'true') INTO _ans
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;
  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h,ARRAY[_kid],_mum,'ZZ Ret Mum','kiosk',_ans);

  -- Make it ancient, but leave it in force.
  UPDATE church.consent_signatures SET updated_at = now() - interval '20 years'
   WHERE id = _sig;

  SELECT church.confirm_kids_purge(
    _md,'consent_signature','Routine clear-out of superseded forms') INTO _n;

  IF NOT EXISTS (SELECT 1 FROM church.consent_signatures WHERE id=_sig) THEN
    RAISE EXCEPTION 'FAIL 9: a consent still in force was deleted for being old';
  END IF;
  RAISE NOTICE 'PASS 9 (a live consent is never due)';
END;
$a$;

-- 10. Only a kids_admin may purge.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _ok BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','13708053-2a4d-4c19-bd74-afd88da4cfee',true);
  BEGIN
    PERFORM church.confirm_kids_purge(_md,'behaviour_report','a volunteer trying it on');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 10: a volunteer purged children''s records'; END IF;
  RAISE NOTICE 'PASS 10 (purging is kids_admin only)';
END;
$a$;
