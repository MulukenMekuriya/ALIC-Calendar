-- Assertions for 20260322210600, inside BEGIN/ROLLBACK.

-- 1. THE BUCKETS ARE CLOSED TO AUTHENTICATED WRITES. Checked as an absence,
--    not trusted. A signed medical release is not something a browser session
--    should be able to add to or replace, and the whole argument for a
--    server-side renderer collapses if a policy quietly opens the door.
DO $a$
DECLARE _n INT;
BEGIN
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND cmd <> 'SELECT'
     AND (qual ILIKE '%kids-consent-forms%' OR with_check ILIKE '%kids-consent-forms%'
          OR qual ILIKE '%kids-incident-reports%' OR with_check ILIKE '%kids-incident-reports%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 1: % non-SELECT storage policies on the PDF buckets', _n;
  END IF;

  -- Both buckets are private, PDF-only, and bounded.
  IF EXISTS (SELECT 1 FROM storage.buckets
              WHERE id IN ('kids-consent-forms','kids-incident-reports')
                AND (public OR file_size_limit IS NULL OR file_size_limit > 2097152
                     OR allowed_mime_types <> ARRAY['application/pdf'])) THEN
    RAISE EXCEPTION 'FAIL 1b: a PDF bucket is public, unbounded, or accepts other types';
  END IF;

  IF (SELECT count(*) FROM storage.buckets
       WHERE id IN ('kids-consent-forms','kids-incident-reports')) <> 2 THEN
    RAISE EXCEPTION 'FAIL 1c: a bucket is missing';
  END IF;
  RAISE NOTICE 'PASS 1 (buckets private, PDF-only, no authenticated writes)';
END;
$a$;

-- 2. The read policies find the id in the FILENAME. storage.foldername drops
--    the last segment, so a policy that indexed into it would deny every
--    read and the bug would look like a permissions problem forever.
DO $a$
DECLARE _p TEXT;
BEGIN
  SELECT qual INTO _p FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname='Consent forms are readable by those who may see them';
  IF _p IS NULL THEN RAISE EXCEPTION 'FAIL 2: the consent read policy is missing'; END IF;
  IF _p NOT ILIKE '%filename%' THEN
    RAISE EXCEPTION 'FAIL 2b: the consent policy does not read the filename';
  END IF;

  -- The path shape the renderer writes must be the one the policy parses.
  IF church.uuid_or_null(regexp_replace(
       storage.filename('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/'
                     || 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22/'
                     || 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33.pdf'), '\.pdf$', ''))
     <> 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::UUID THEN
    RAISE EXCEPTION 'FAIL 2c: the consent path shape does not parse to the signature id';
  END IF;

  IF church.uuid_or_null(regexp_replace(
       storage.filename('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11/'
                     || 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33.pdf'), '\.pdf$', ''))
     <> 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'::UUID THEN
    RAISE EXCEPTION 'FAIL 2d: the incident path shape does not parse to the incident id';
  END IF;

  -- A stray file must deny, not raise. A policy that raises is a 500 for
  -- every reader of the bucket rather than a denial of one object.
  IF church.uuid_or_null(regexp_replace(storage.filename('org/notes.txt'), '\.pdf$','')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2e: a non-uuid filename did not resolve to NULL';
  END IF;
  RAISE NOTICE 'PASS 2 (paths parse, strays deny rather than raise)';
END;
$a$;

-- 3-9. A signature, its PDF, and who may open it.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _volu   UUID := '13708053-2a4d-4c19-bd74-afd88da4cfee';
  _h UUID; _mum UUID; _kid UUID; _sig UUID; _answers JSONB;
  _payload JSONB; _r RECORD; _ok BOOLEAN; _n INT; _audit_before INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);

  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Pdf') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZPdfMum','P',false) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,birth_year,birth_month)
    VALUES (_md,'ZZPdfKid','P',true,2019,7) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');

  SELECT jsonb_object_agg(r,'true') INTO _answers
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;

  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h,ARRAY[_kid],_mum,'ZZ Pdf Mum','kiosk',_answers);

  -- 3. The payload is complete enough to render without the renderer looking
  --    anything up for itself.
  _payload := church.consent_pdf_payload(_sig);
  IF _payload IS NULL THEN RAISE EXCEPTION 'FAIL 3: no payload'; END IF;
  IF _payload->'document'->>'sha256' IS NULL THEN
    RAISE EXCEPTION 'FAIL 3b: the payload carries no document fingerprint';
  END IF;
  IF jsonb_array_length(_payload->'document'->'body') <> 13 THEN
    RAISE EXCEPTION 'FAIL 3c: the payload carries % sections',
      jsonb_array_length(_payload->'document'->'body');
  END IF;
  IF jsonb_array_length(_payload->'children') <> 1 THEN
    RAISE EXCEPTION 'FAIL 3d: the payload names % children',
      jsonb_array_length(_payload->'children');
  END IF;
  -- The FROZEN name, not a live join.
  IF _payload->'children'->0->>'name' <> 'ZZPdfKid P' THEN
    RAISE EXCEPTION 'FAIL 3e: the payload did not use the frozen child name';
  END IF;

  -- 4. THE PAYLOAD SURVIVES A RENAME. This is the whole reason names are
  --    frozen: the PDF prints them, and a later correction must not make a
  --    stored document a lie.
  UPDATE church.people SET last_name = 'Renamed' WHERE id = _kid;
  IF church.consent_pdf_payload(_sig)->'children'->0->>'name' <> 'ZZPdfKid P' THEN
    RAISE EXCEPTION 'FAIL 4: renaming the child changed what the stored form says';
  END IF;

  -- 5. THE PAYLOAD SURVIVES A NEW DOCUMENT VERSION. A form regenerated later
  --    must show the words that were signed, not this year's wording.
  PERFORM church.publish_consent_document(_md,'kids_parent_consent','v2 wording',
    '[{"key":"acknowledgment","heading":"10.","kind":"signature","surface":"both",
       "text":"completely different words",
       "options":[{"key":"parent_acknowledgment","text":"I agree."}]}]'::jsonb,
    ARRAY['parent_acknowledgment']);
  _payload := church.consent_pdf_payload(_sig);
  IF (_payload->'document'->>'version')::INT <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: the payload followed the current version, not the signed one';
  END IF;
  IF jsonb_array_length(_payload->'document'->'body') <> 13 THEN
    RAISE EXCEPTION 'FAIL 5b: the payload picked up v2''s body over a v1 signature';
  END IF;

  -- 6. Reading before the bytes exist is a real answer, not a broken link.
  _ok := false;
  BEGIN
    PERFORM church.consent_pdf_signed_url(_sig);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%pdf_not_ready%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 6: a missing PDF did not say so'; END IF;

  -- The renderer records it.
  PERFORM church.record_consent_pdf(_sig, _md||'/'||_h||'/'||_sig||'.pdf',
    repeat('a',64), 31000);
  IF (SELECT pdf_storage_path FROM church.consent_signatures WHERE id=_sig) IS NULL THEN
    RAISE EXCEPTION 'FAIL 6b: the path was not recorded';
  END IF;

  -- 7. EVERY READ IS AUDITED, and the row goes in BEFORE the path is handed
  --    over. The other order loses exactly the reads that matter most.
  SELECT count(*) INTO _audit_before FROM church.check_in_audit
   WHERE action='sensitive_viewed' AND detail->>'record'='consent_pdf';
  SELECT * INTO _r FROM church.consent_pdf_signed_url(_sig);
  IF _r.storage_path IS NULL THEN RAISE EXCEPTION 'FAIL 7: no path returned'; END IF;
  IF _r.expires_in > 60 THEN RAISE EXCEPTION 'FAIL 7b: the URL lives too long'; END IF;
  IF (SELECT count(*) FROM church.check_in_audit
       WHERE action='sensitive_viewed' AND detail->>'record'='consent_pdf') <> _audit_before + 1 THEN
    RAISE EXCEPTION 'FAIL 7c: opening a consent PDF wrote no audit row';
  END IF;

  -- 8. A KIDS VOLUNTEER CANNOT OPEN IT. They get the allergy on the label and
  --    the safety card; the family's signed medical release is not theirs.
  PERFORM set_config('request.jwt.claim.sub', _volu::TEXT, true);
  IF church.can_read_consent_pdf(_sig) THEN
    RAISE EXCEPTION 'FAIL 8: a kids_volunteer can read a consent PDF';
  END IF;
  _ok := false;
  BEGIN
    PERFORM church.consent_pdf_signed_url(_sig);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 8b: the signed-url RPC opened for a volunteer'; END IF;

  -- 9. The household can. That is the point of "a form we can hand back".
  UPDATE church.people SET profile_id=NULL WHERE profile_id=_volu AND organization_id=_md;
  UPDATE church.people SET profile_id=_volu WHERE id=_mum;
  IF NOT church.can_read_consent_pdf(_sig) THEN
    RAISE EXCEPTION 'FAIL 9: the family cannot read their own signed form';
  END IF;

  RAISE NOTICE 'PASS 3-9 (payload frozen, reads audited, volunteer refused, family allowed)';
END;
$a$;

-- 10-13. Incident reports.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _volu   UUID := '13708053-2a4d-4c19-bd74-afd88da4cfee';
  _kid UUID; _inc UUID; _p JSONB; _ok BOOLEAN; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZIncKid','I',true) RETURNING id INTO _kid;

  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, reported_narrative, reported_by_name, reported_by)
  VALUES (_md,_kid,current_date,'injury',
    'Fell from the step by the door and grazed a knee. Cleaned and a plaster applied.',
    'ZZ Teacher', _adminu)
  RETURNING id INTO _inc;

  -- 10. An injury is queued for a PDF. It is the one asked about months later.
  IF NOT EXISTS (SELECT 1 FROM church.consent_pdfs_pending(50)
                  WHERE kind='incident' AND id=_inc) THEN
    RAISE EXCEPTION 'FAIL 10: an injury report was not queued for a PDF';
  END IF;

  -- 11. A behaviour note is NOT. "Selam had a hard morning" does not need a
  --     PDF, and generating one for every one of them would bury the reports
  --     that matter.
  DECLARE _beh UUID;
  BEGIN
    INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
      severity, reported_narrative, reported_by_name, reported_by)
    VALUES (_md,_kid,current_date,'behaviour',
      'Found it hard to settle during the story and needed some time out of the circle.',
      'ZZ Teacher', _adminu)
    RETURNING id INTO _beh;
    IF EXISTS (SELECT 1 FROM church.consent_pdfs_pending(50) WHERE kind='incident' AND id=_beh) THEN
      RAISE EXCEPTION 'FAIL 11: a behaviour note was queued for a PDF';
    END IF;
  END;

  -- 12. The payload carries the teacher's words as written.
  _p := church.incident_pdf_payload(_inc);
  IF _p->>'reported_narrative' NOT LIKE 'Fell from the step%' THEN
    RAISE EXCEPTION 'FAIL 12: the payload lost the teacher''s account';
  END IF;

  -- 13. A leader may open it; a volunteer may not, and neither may a parent -
  --     there is no portal view of incidents and this is part of what stops
  --     one appearing by accident.
  PERFORM church.record_incident_pdf(_inc, _md||'/'||_inc||'.pdf', repeat('b',64));
  SELECT count(*) INTO _n FROM church.check_in_audit
   WHERE action='sensitive_viewed' AND detail->>'record'='incident_pdf';
  PERFORM church.incident_pdf_signed_url(_inc);
  IF (SELECT count(*) FROM church.check_in_audit
       WHERE action='sensitive_viewed' AND detail->>'record'='incident_pdf') <> _n + 1 THEN
    RAISE EXCEPTION 'FAIL 13: opening an incident PDF wrote no audit row';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', _volu::TEXT, true);
  IF church.can_read_incident_pdf(_inc) THEN
    RAISE EXCEPTION 'FAIL 13b: a kids_volunteer can read an incident PDF';
  END IF;

  RAISE NOTICE 'PASS 10-13 (injury queued, behaviour not, incident reads audited)';
END;
$a$;

-- 14. A failing render is recorded and eventually stops being retried, but
--     never disappears. A queue that silently drops work is worse than one
--     that keeps failing loudly.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _h UUID; _mum UUID; _kid UUID; _sig UUID; _answers JSONB; _i INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0c2dd974-ba40-4d99-8db5-63804c38ed65'::TEXT, true);
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Fail') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZFailMum','F',false) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZFailKid','F',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');
  SELECT jsonb_object_agg(r,'true') INTO _answers
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;
  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h,ARRAY[_kid],_mum,'ZZ Fail Mum','kiosk',_answers);

  FOR _i IN 1..5 LOOP
    PERFORM church.record_consent_pdf(_sig, NULL, NULL, NULL, 'pdf-lib blew up');
  END LOOP;

  IF (SELECT pdf_error FROM church.consent_signatures WHERE id=_sig) IS NULL THEN
    RAISE EXCEPTION 'FAIL 14: the failure was not recorded on the row';
  END IF;
  IF EXISTS (SELECT 1 FROM church.consent_pdfs_pending(200) WHERE id=_sig) THEN
    RAISE EXCEPTION 'FAIL 14b: a row failing five times is still being retried';
  END IF;
  -- Still there, still findable, still a valid signature.
  IF (SELECT pdf_storage_path FROM church.consent_signatures WHERE id=_sig) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 14c: a failed render recorded a path anyway';
  END IF;
  RAISE NOTICE 'PASS 14 (failures recorded, capped, never silently dropped)';
END;
$a$;

-- 15. The access log is readable by a kids admin and nobody else.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _n INT; _ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0c2dd974-ba40-4d99-8db5-63804c38ed65'::TEXT, true);
  SELECT count(*) INTO _n FROM church.kids_sensitive_access_report(
    _md, current_date - 1, current_date);
  IF _n = 0 THEN
    RAISE EXCEPTION 'FAIL 15: the access report shows none of the reads just made';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '13708053-2a4d-4c19-bd74-afd88da4cfee'::TEXT, true);
  _ok := false;
  BEGIN
    PERFORM church.kids_sensitive_access_report(_md, current_date - 1, current_date);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 15b: a volunteer can read who-read-what';
  END IF;
  RAISE NOTICE 'PASS 15 (the access log exists and is admin-only)';
END;
$a$;
