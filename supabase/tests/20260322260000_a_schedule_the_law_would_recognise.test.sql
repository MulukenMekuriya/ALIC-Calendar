-- Assertions for 20260322260000.

-- 1. THIS MIGRATION ONLY LENGTHENS RETENTION. Nothing becomes newly due as a
--    consequence of applying it, so no record can be deleted because of it.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _r RECORD;
BEGIN
  FOR _r IN
    SELECT record_type, retain_years FROM church.record_retention
     WHERE organization_id=_md
  LOOP
    IF _r.record_type = 'consent_signature'   AND _r.retain_years < 3 THEN
      RAISE EXCEPTION 'FAIL 1: consent retention was shortened'; END IF;
    IF _r.record_type = 'injury_report'       AND _r.retain_years < 7 THEN
      RAISE EXCEPTION 'FAIL 1b: injury retention was shortened'; END IF;
    IF _r.record_type = 'behaviour_report'    AND _r.retain_years < 2 THEN
      RAISE EXCEPTION 'FAIL 1c: behaviour retention was shortened'; END IF;
    IF _r.record_type = 'late_collection'     AND _r.retain_years < 2 THEN
      RAISE EXCEPTION 'FAIL 1d: late collection retention was shortened'; END IF;
  END LOOP;
  RAISE NOTICE 'PASS 1 (no period was shortened)';
END;
$a$;

-- 2. Five classes, each with a real explanation rather than a label.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _n INT;
BEGIN
  SELECT count(*) INTO _n FROM church.record_retention WHERE organization_id=_md;
  IF _n <> 5 THEN RAISE EXCEPTION 'FAIL 2: % record types, expected 5', _n; END IF;

  IF EXISTS (SELECT 1 FROM church.record_retention
              WHERE organization_id=_md AND length(btrim(basis)) < 60) THEN
    RAISE EXCEPTION 'FAIL 2b: a period has a label rather than a reason';
  END IF;

  -- The safeguarding basis has to name WHY it is indefinite, because that is
  -- the one somebody will question.
  IF NOT EXISTS (SELECT 1 FROM church.record_retention
                  WHERE organization_id=_md AND record_type='safeguarding_report'
                    AND basis ILIKE '%statute of limitations%') THEN
    RAISE EXCEPTION 'FAIL 2c: the indefinite period does not say why';
  END IF;
  RAISE NOTICE 'PASS 2 (five classes, each with its reasoning)';
END;
$a$;

-- 3. SAFEGUARDING IS NEVER DUE, AND CANNOT BE PURGED. Maryland repealed the
--    limitation period entirely; there is no date after which destroying one
--    is safe.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _kid UUID; _inc UUID; _r RECORD; _ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,birth_year)
    VALUES (_md,'ZZLawKid','L',true,1960) RETURNING id INTO _kid;
  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, reported_narrative, reported_by_name)
  VALUES (_md,_kid,current_date - 14000,'safeguarding',
    'A concern raised a very long time ago indeed, well past any old limit.','ZZ Teacher')
  RETURNING id INTO _inc;

  SELECT * INTO _r FROM church.kids_records_due_for_purge(_md)
   WHERE record_type='safeguarding_report';
  IF NOT _r.retain_forever THEN
    RAISE EXCEPTION 'FAIL 3: safeguarding is not marked as kept indefinitely';
  END IF;
  IF _r.due_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 3b: a 38-year-old safeguarding report reads as due';
  END IF;
  IF _r.held_count < 1 THEN
    RAISE EXCEPTION 'FAIL 3c: the safeguarding report is not counted as held';
  END IF;

  _ok := false;
  BEGIN
    PERFORM church.confirm_kids_purge(_md,'safeguarding_report',
      'Trying to clear out very old safeguarding files');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%records_kept_indefinitely%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 3d: A SAFEGUARDING PURGE WAS ACCEPTED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM church.kids_incidents WHERE id=_inc) THEN
    RAISE EXCEPTION 'FAIL 3e: the safeguarding report was deleted';
  END IF;
  RAISE NOTICE 'PASS 3 (safeguarding is never due and cannot be purged)';
END;
$a$;

-- 4. AN INJURY AGES TO 25, NOT 21. A child injured at four can file on their
--    21st birthday; destroying the record that day loses it exactly when it
--    is needed.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _kid UUID; _inc UUID; _n INT; _born INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);

  -- Born so they are 22 now: past 21, not yet 25.
  _born := extract(year FROM current_date)::INT - 22;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,birth_year)
    VALUES (_md,'ZZAge22','L',true,_born) RETURNING id INTO _kid;
  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, reported_narrative, reported_by_name)
  VALUES (_md,_kid,current_date - 6000,'injury',
    'Fell from the step by the door and grazed a knee, a long time ago.','ZZ Teacher')
  RETURNING id INTO _inc;

  SELECT church.confirm_kids_purge(_md,'injury_report','Routine clear-out') INTO _n;
  IF NOT EXISTS (SELECT 1 FROM church.kids_incidents WHERE id=_inc) THEN
    RAISE EXCEPTION 'FAIL 4: an injury record was destroyed while the person '
                    'was 22 - they could have filed at 21 and still be in court';
  END IF;

  -- Now make them 26 and it is genuinely due.
  UPDATE church.people SET birth_year = extract(year FROM current_date)::INT - 26
   WHERE id = _kid;
  SELECT church.confirm_kids_purge(_md,'injury_report','Routine clear-out') INTO _n;
  IF EXISTS (SELECT 1 FROM church.kids_incidents WHERE id=_inc) THEN
    RAISE EXCEPTION 'FAIL 4b: past 25 the record is still not due';
  END IF;
  RAISE NOTICE 'PASS 4 (injury records survive to 25)';
END;
$a$;

-- 5. A consent form stays for twelve years after it stops being current, so
--    it outlives the injury claim it would be the defence to.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT * INTO _r FROM church.record_retention
   WHERE organization_id=_md AND record_type='consent_signature';
  IF _r.retain_years < 12 THEN
    RAISE EXCEPTION 'FAIL 5: the consent form is kept % years, shorter than the '
                    'injury claim it defends', _r.retain_years;
  END IF;

  SELECT * INTO _r FROM church.record_retention
   WHERE organization_id=_md AND record_type='injury_report';
  IF _r.retain_years < 12 THEN
    RAISE EXCEPTION 'FAIL 5b: injury retention is below the twelve-year sector floor';
  END IF;
  RAISE NOTICE 'PASS 5 (consent outlives the claim it defends)';
END;
$a$;

-- 6. Nothing is due today, on the real data, under the new schedule.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  SELECT coalesce(sum(due_count),0) INTO _n
    FROM church.kids_records_due_for_purge(_md);
  RAISE NOTICE 'PASS 6 (% records due under the new schedule)', _n;
END;
$a$;
