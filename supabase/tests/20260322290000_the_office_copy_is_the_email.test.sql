DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _h UUID; _mum UUID; _kid UUID; _sig UUID; _ans JSONB; _office TEXT; _family TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','0c2dd974-ba40-4d99-8db5-63804c38ed65',true);
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Copy') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZCopyMum','C',false,'zzcopy@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZCopyKid','C',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');
  SELECT jsonb_object_agg(r,'true') INTO _ans
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;
  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h,ARRAY[_kid],_mum,'ZZ Copy Mum','kiosk',_ans);
  PERFORM church.record_consent_pdf(_sig, _md||'/'||_h||'/'||_sig||'.pdf', repeat('a',64), 31000);

  SELECT body INTO _office FROM church.notification_log
   WHERE consent_signature_id=_sig AND kind='kids_consent_filed' LIMIT 1;
  SELECT body INTO _family FROM church.notification_log
   WHERE consent_signature_id=_sig AND kind='kids_consent_signed' LIMIT 1;

  -- 1. The office note no longer promises a screen that does not exist.
  IF _office ILIKE '%on the household record in the app%' THEN
    RAISE EXCEPTION 'FAIL 1: the office is still told to open it in the app';
  END IF;
  IF _office NOT ILIKE '%ask the family for their copy%' THEN
    RAISE EXCEPTION 'FAIL 1b: the office is not told where the copy actually is';
  END IF;

  -- 2. It still explains WHY the PDF is not attached, because that is the
  --    decision somebody will otherwise try to "helpfully" reverse.
  IF _office NOT ILIKE '%deliberately not attached%' THEN
    RAISE EXCEPTION 'FAIL 2: the reasoning was dropped along with the promise';
  END IF;
  IF _office ILIKE '%peanut%' OR _office ILIKE '%allergies:%' THEN
    RAISE EXCEPTION 'FAIL 2b: the office note now contains medical detail';
  END IF;

  -- 3. THE FAMILY'S EMAIL IS UNTOUCHED, attachment and all.
  IF _family NOT ILIKE '%attached to this email%' THEN
    RAISE EXCEPTION 'FAIL 3: the family is no longer told their copy is attached';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM church.notification_log
                  WHERE consent_signature_id=_sig AND kind='kids_consent_signed'
                    AND attachment_path IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 3b: THE FAMILY LOST THEIR ATTACHMENT';
  END IF;
  IF EXISTS (SELECT 1 FROM church.notification_log
              WHERE consent_signature_id=_sig AND kind='kids_consent_filed'
                AND attachment_path IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 3c: the office note gained an attachment';
  END IF;

  RAISE NOTICE 'PASS 1-3 (office told the truth, family untouched)';
END;
$a$;
