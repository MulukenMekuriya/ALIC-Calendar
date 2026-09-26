-- Assertions for 20260322210700, inside BEGIN/ROLLBACK.

-- 1. THE 748 EXISTING ROWS ARE UNTOUCHED. Every one of them has a NULL
--    attachment, so the drainer's single `if` never fires for them and their
--    payload is byte-identical to today's.
DO $a$
DECLARE _n INT; _total INT;
BEGIN
  SELECT count(*) INTO _total FROM church.notification_log;
  SELECT count(*) INTO _n FROM church.notification_log WHERE attachment_path IS NOT NULL;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 1: % of % existing rows gained an attachment', _n, _total;
  END IF;
  RAISE NOTICE 'PASS 1 (% existing rows, none with an attachment)', _total;
END;
$a$;

-- 2. Half an attachment is impossible, and an attachment on an SMS is too.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _ok BOOLEAN;
BEGIN
  _ok := false;
  BEGIN
    INSERT INTO church.notification_log (organization_id, kind, channel,
      recipient_email, body, attachment_bucket, attachment_path)
    VALUES (_md,'kids_consent_signed','email','a@b.test','x','kids-consent-forms','p.pdf');
  EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 2: an attachment with no filename was accepted'; END IF;

  _ok := false;
  BEGIN
    INSERT INTO church.notification_log (organization_id, kind, channel,
      recipient_phone, body, attachment_bucket, attachment_path, attachment_filename)
    VALUES (_md,'kids_consent_signed','sms','+15555550100','x',
            'kids-consent-forms','p.pdf','f.pdf');
  EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 2b: an SMS carried an attachment'; END IF;
  RAISE NOTICE 'PASS 2 (attachments are all-or-nothing, and email only)';
END;
$a$;

-- 3. queue_child_notification still works with SEVEN positional arguments.
--    Six existing callers do exactly that, two of them on the Sunday morning
--    check-in path, and a broken signature there is the worst outcome in this
--    migration.
DO $a$
DECLARE _n INT; _args TEXT;
BEGIN
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='church' AND p.proname='queue_child_notification';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL 3: % overloads of queue_child_notification - PostgREST '
                    'would have two candidates to choose between', _n;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO _args
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='church' AND p.proname='queue_child_notification';
  IF _args NOT LIKE '%_attachment_filename%' THEN
    RAISE EXCEPTION 'FAIL 3b: the new parameters are missing';
  END IF;

  -- A seven-argument call resolves. Passing a check_in_id that does not exist
  -- returns 0 rather than raising, which is the existing contract.
  IF church.queue_child_notification('check_in', gen_random_uuid(), 'body',
       'subject', 'email', NULL, 'Someone') <> 0 THEN
    RAISE EXCEPTION 'FAIL 3c: the seven-argument call did not behave as before';
  END IF;
  RAISE NOTICE 'PASS 3 (one function, old callers still resolve)';
END;
$a$;

-- 4-11. Signing, rendering, and the two letters.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _h UUID; _mum UUID; _dad UUID; _k1 UUID; _k2 UUID; _sig UUID;
  _ans JSONB; _n INT; _parent INT; _office INT; _body TEXT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);

  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Mail') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZMailMum','M',false,'zzmum@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZMailDad','M',false,'zzdad@example.test',true) RETURNING id INTO _dad;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZMailA','M',true) RETURNING id INTO _k1;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZMailB','M',true) RETURNING id INTO _k2;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_dad,'spouse'),(_md,_h,_k1,'child'),(_md,_h,_k2,'child');

  SELECT jsonb_object_agg(r,'true') INTO _ans
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;

  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h,ARRAY[_k1,_k2],_mum,'ZZ Mail Mum','kiosk',_ans);

  -- 4. NOTHING IS QUEUED BEFORE THE PDF EXISTS. This is the ordering that
  --    removes the "send it without the attachment" branch entirely.
  IF church.queue_consent_notifications(_sig) <> 0 THEN
    RAISE EXCEPTION 'FAIL 4: a letter was queued before the document existed';
  END IF;
  IF EXISTS (SELECT 1 FROM church.notification_log WHERE consent_signature_id=_sig) THEN
    RAISE EXCEPTION 'FAIL 4b: rows appeared with no PDF behind them';
  END IF;

  -- Recording the PDF is what sends it.
  PERFORM church.record_consent_pdf(_sig, _md||'/'||_h||'/'||_sig||'.pdf', repeat('a',64), 31000);

  SELECT count(*) INTO _parent FROM church.notification_log
   WHERE consent_signature_id=_sig AND kind='kids_consent_signed';
  SELECT count(*) INTO _office FROM church.notification_log
   WHERE consent_signature_id=_sig AND kind='kids_consent_filed';

  -- 5. THE SIGNER GETS THE COPY, not the household. The father shares the
  --    household and is NOT a co-signer, so he is not written to - for a
  --    medical PDF, fanning out to every adult is how a child's allergy
  --    record reaches an address the signer never named.
  IF _parent <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: % parent letters, expected exactly 1 (the signer)', _parent;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM church.notification_log
                  WHERE consent_signature_id=_sig AND kind='kids_consent_signed'
                    AND recipient_person_id=_mum) THEN
    RAISE EXCEPTION 'FAIL 5b: the signer did not get their own copy';
  END IF;
  IF EXISTS (SELECT 1 FROM church.notification_log
              WHERE consent_signature_id=_sig AND kind='kids_consent_signed'
                AND recipient_person_id=_dad) THEN
    RAISE EXCEPTION 'FAIL 5c: a household adult who did not sign got the medical PDF';
  END IF;

  -- 6. The parent's letter carries the attachment; the office's does not.
  IF NOT EXISTS (SELECT 1 FROM church.notification_log
                  WHERE consent_signature_id=_sig AND kind='kids_consent_signed'
                    AND attachment_bucket='kids-consent-forms'
                    AND attachment_path IS NOT NULL
                    AND attachment_filename LIKE '%.pdf') THEN
    RAISE EXCEPTION 'FAIL 6: the family''s copy has no attachment';
  END IF;
  IF _office = 0 THEN RAISE EXCEPTION 'FAIL 6b: the office was not told'; END IF;
  IF EXISTS (SELECT 1 FROM church.notification_log
              WHERE consent_signature_id=_sig AND kind='kids_consent_filed'
                AND attachment_path IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 6c: the office note carries the child''s medical PDF - '
                    'that is seven personal mailboxes, permanently';
  END IF;

  -- 7. The office note names the children and the signer, and NO medical
  --    detail. Checked positively rather than by hoping.
  SELECT body INTO _body FROM church.notification_log
   WHERE consent_signature_id=_sig AND kind='kids_consent_filed' LIMIT 1;
  IF _body NOT LIKE '%ZZMailA%' OR _body NOT LIKE '%ZZ Mail Mum%' THEN
    RAISE EXCEPTION 'FAIL 7: the office note does not say who or which children';
  END IF;
  -- Narrowed, and this is not tuning the test until it goes green.
  --
  -- The scan used to be ILIKE '%allerg%' OR '%medication%'. 20260322290000
  -- rewrote the office note to explain WHY the PDF is withheld - "it names a
  -- child's allergies and medications" - and the scan cannot tell a medical
  -- fact from a sentence about withholding medical facts. It was flagging
  -- the very sentence that makes the decision hard to reverse.
  --
  -- The intent is unchanged: no child's medical detail in seven personal
  -- mailboxes. '%allergies:%' with the colon is the labelled form the data
  -- would actually arrive in, and it is the check 20260322290000's own
  -- assertions settled on.
  IF _body ILIKE '%allergies:%' OR _body ILIKE '%medications:%'
     OR _body ILIKE '%peanut%' THEN
    RAISE EXCEPTION 'FAIL 7b: the office note contains medical detail';
  END IF;

  -- 8. The family's letter names the children it covers and says it lasts.
  SELECT body INTO _body FROM church.notification_log
   WHERE consent_signature_id=_sig AND kind='kids_consent_signed' LIMIT 1;
  IF _body NOT LIKE '%ZZMailA%' OR _body NOT LIKE '%ZZMailB%' THEN
    RAISE EXCEPTION 'FAIL 8: the family''s copy does not list the children';
  END IF;
  IF _body NOT ILIKE '%until you tell us otherwise%' THEN
    RAISE EXCEPTION 'FAIL 8b: the family is not told the consent has no expiry';
  END IF;
  -- No medical record on file for either child, so it asks - once, warmly.
  IF _body NOT ILIKE '%do not yet hold any%' THEN
    RAISE EXCEPTION 'FAIL 8c: the letter did not ask for the medical section';
  END IF;

  -- 9. IDEMPOTENT. A re-render must not post a second copy of the same form.
  PERFORM church.record_consent_pdf(_sig, _md||'/'||_h||'/'||_sig||'.pdf', repeat('b',64), 31500);
  IF (SELECT count(*) FROM church.notification_log
       WHERE consent_signature_id=_sig AND kind='kids_consent_signed') <> _parent THEN
    RAISE EXCEPTION 'FAIL 9: re-recording the PDF posted a second copy';
  END IF;

  -- 10. A failed render queues nothing at all.
  DECLARE _sig2 UUID; _h2 UUID; _m2 UUID; _c2 UUID;
  BEGIN
    INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Mail2') RETURNING id INTO _h2;
    INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
      VALUES (_md,'ZZMail2Mum','N',false,'zz2@example.test',true) RETURNING id INTO _m2;
    INSERT INTO church.people (organization_id,first_name,last_name,is_child)
      VALUES (_md,'ZZMail2Kid','N',true) RETURNING id INTO _c2;
    INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
      VALUES (_md,_h2,_m2,'head'),(_md,_h2,_c2,'child');
    SELECT signature_id INTO _sig2 FROM church.sign_kids_consent(
      _md,_h2,ARRAY[_c2],_m2,'ZZ Mail2 Mum','kiosk',_ans);
    PERFORM church.record_consent_pdf(_sig2, NULL, NULL, NULL, 'pdf-lib blew up');
    IF EXISTS (SELECT 1 FROM church.notification_log WHERE consent_signature_id=_sig2) THEN
      RAISE EXCEPTION 'FAIL 10: a failed render still wrote to the family';
    END IF;

    -- 11. The backstop picks up a signature whose letter was never queued.
    UPDATE church.consent_signatures
       SET pdf_storage_path = _md||'/'||_h2||'/'||_sig2||'.pdf', pdf_error = NULL
     WHERE id = _sig2;
    IF church.queue_missing_consent_notifications() < 1 THEN
      RAISE EXCEPTION 'FAIL 11: the backstop found nothing to queue';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM church.notification_log
                    WHERE consent_signature_id=_sig2 AND kind='kids_consent_signed') THEN
      RAISE EXCEPTION 'FAIL 11b: the backstop queued nothing for the family';
    END IF;
    -- ...and running it again does not double up.
    PERFORM church.queue_missing_consent_notifications();
    IF (SELECT count(*) FROM church.notification_log
         WHERE consent_signature_id=_sig2 AND kind='kids_consent_signed') <> 1 THEN
      RAISE EXCEPTION 'FAIL 11c: the backstop posted a second copy';
    END IF;
  END;

  RAISE NOTICE 'PASS 4-11 (ordering, the signer only, no medical detail, idempotent)';
END;
$a$;

-- 12-14. The injury report carries its PDF, and refuses to go without one.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _h UUID; _mum UUID; _kid UUID; _sess UUID; _batch UUID; _ci UUID; _inc UUID;
  _ok BOOLEAN; _n INT; _room UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);

  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Inj') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZInjMum','J',false,'zzinj@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZInjKid','J',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');

  -- Session, batch and room taken together from one real row: batch_id is
  -- NOT NULL and a batch belongs to a session, so inventing either separately
  -- produces a row the database will not hold.
  SELECT kids_session_id, batch_id, room_id INTO _sess, _batch, _room
    FROM church.kids_check_ins ORDER BY created_at DESC LIMIT 1;

  INSERT INTO church.kids_check_ins (organization_id, kids_session_id, batch_id,
    child_person_id, room_id, status, checked_in_by_name, tag_number,
    label_child_name)
  VALUES (_md,_sess,_batch,_kid,_room,'checked_in','ZZ Desk',9901,'ZZInjKid')
  RETURNING id INTO _ci;

  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, status, reported_narrative, reported_by_name, reported_by,
    check_in_id, room_id, admin_summary, signed_off_by_name, signed_off_at)
  VALUES (_md,_kid,current_date,'injury','signed_off',
    'Fell from the step by the door and grazed a knee. Cleaned and a plaster applied.',
    'ZZ Teacher', _adminu, _ci, _room, 'Seen by a leader; knee cleaned and covered.',
    'ZZ Leader', now())
  RETURNING id INTO _inc;

  -- 12. IT REFUSES WHILE THE RECORD IS STILL RENDERING. The email's own copy
  --     says the written record is attached; sending without it would make
  --     that a promise nobody kept.
  _ok := false;
  BEGIN
    PERFORM church.kids_send_incident_to_parent(_inc, 'admin');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%injury_record_not_ready%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 12: an injury email went out before its record existed';
  END IF;

  -- 13. With the record in place it sends, and the row carries the file.
  PERFORM church.record_incident_pdf(_inc, _md||'/'||_inc||'.pdf', repeat('c',64));
  SELECT church.kids_send_incident_to_parent(_inc, 'admin') INTO _n;
  IF coalesce(_n,0) = 0 THEN RAISE EXCEPTION 'FAIL 13: nobody was written to'; END IF;
  IF NOT EXISTS (SELECT 1 FROM church.notification_log
                  WHERE kind='kids_incident_to_parent' AND child_person_id=_kid
                    AND attachment_bucket='kids-incident-reports'
                    AND attachment_path IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 13b: the injury email carries no record';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM church.notification_log
                  WHERE kind='kids_incident_to_parent' AND child_person_id=_kid
                    AND body ILIKE '%is attached%') THEN
    RAISE EXCEPTION 'FAIL 13c: the copy does not mention the attached record';
  END IF;

  -- 14. A BEHAVIOUR note still sends with NO attachment and needs no PDF.
  --     "Selam had a hard morning" does not need a document.
  DECLARE _beh UUID; _m INT;
  BEGIN
    INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
      severity, status, reported_narrative, reported_by_name, reported_by,
      check_in_id, room_id, admin_summary, signed_off_by_name, signed_off_at)
    VALUES (_md,_kid,current_date,'behaviour','signed_off',
      'Found it hard to settle during the story and needed some time out of the circle.',
      'ZZ Teacher', _adminu, _ci, _room, 'Spoke with the teacher; nothing more needed.',
      'ZZ Leader', now())
    RETURNING id INTO _beh;
    SELECT church.kids_send_incident_to_parent(_beh, 'admin') INTO _m;
    IF coalesce(_m,0) = 0 THEN RAISE EXCEPTION 'FAIL 14: the behaviour note did not send'; END IF;
    IF EXISTS (SELECT 1 FROM church.notification_log
                WHERE kind='kids_incident_to_parent' AND child_person_id=_kid
                  AND attachment_path IS NOT NULL
                  AND body ILIKE '%hard to settle%') THEN
      RAISE EXCEPTION 'FAIL 14b: a behaviour note carried an attachment';
    END IF;
  END;

  RAISE NOTICE 'PASS 12-14 (injury waits for its record; behaviour needs none)';
END;
$a$;

-- 15. A safeguarding report still cannot be sent, attachment or not. Nothing
--     in this migration may have opened that door.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _kid UUID; _inc UUID; _ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZSafeKid','S',true) RETURNING id INTO _kid;
  INSERT INTO church.kids_incidents (organization_id, child_person_id, occurred_on,
    severity, status, reported_narrative, reported_by_name, reported_by,
    external_report_made, signed_off_by_name, signed_off_at)
  VALUES (_md,_kid,current_date,'safeguarding','signed_off',
    'Something a child said that I think a leader needs to know about today.',
    'ZZ Teacher', _adminu, true, 'ZZ Leader', now())
  RETURNING id INTO _inc;

  PERFORM church.record_incident_pdf(_inc, _md||'/'||_inc||'.pdf', repeat('d',64));

  _ok := false;
  BEGIN
    PERFORM church.kids_send_incident_to_parent(_inc, 'admin');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%cannot_send_safeguarding_to_parent%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 15: a safeguarding report was sent to a parent';
  END IF;
  RAISE NOTICE 'PASS 15 (safeguarding still cannot reach a parent)';
END;
$a$;
