-- =====================================================
-- A signed form is a notification too
-- =====================================================
--
-- The family gets their copy of the form, with the PDF attached. The Kids
-- Ministry admins get a note that it was filed, with no attachment and no
-- medical detail. And the injury report that has been promising a PDF since
-- 20260322200700 finally carries one.
--
-- ---------------------------------------------------------------------------
-- THE BYTES DO NOT TRAVEL IN notification_log
-- ---------------------------------------------------------------------------
--
-- claim_queued_notifications returns SETOF church.notification_log, so a
-- base64 column would be pulled on every drain of fifty rows whether or not
-- any of them had an attachment. Instead three nullable columns say WHERE the
-- object is, and the drainer downloads it with the service role only for the
-- rows that have one. The 748 existing rows get NULL and behave byte for byte
-- as they do today.
--
-- ---------------------------------------------------------------------------
-- ORDERING REMOVES A WHOLE CLASS OF FAILURE
-- ---------------------------------------------------------------------------
--
-- The PDF is rendered and its path written BEFORE the notification row is
-- inserted - queue_consent_notifications is called from record_consent_pdf,
-- not from sign_kids_consent. So a queued row always has an object behind it,
-- and there is no "send it without the attachment and say nothing" branch to
-- write, test, or get wrong. A signature whose render failed simply has no
-- email yet, which is visible in pdf_error rather than arriving as a letter
-- promising a document that is not there.
--
-- ---------------------------------------------------------------------------
-- WHO GETS THE COPY
-- ---------------------------------------------------------------------------
--
-- THE PERSON WHO SIGNED, plus a co-signing second guardian. Deliberately NOT
-- notify_targets_for_child, which fans out to every adult in the household
-- AND every recorded guardian across households - for a medical PDF that
-- would mean posting a child's allergy record to a separated parent's address
-- that the signer never named.
--
-- ---------------------------------------------------------------------------
-- THE ADMINS GET THE NOTE, THE PARENT GETS THE DOCUMENT
-- ---------------------------------------------------------------------------
--
-- kids_leaders_to_notify returns every kids_admin plus every org admin -
-- currently seven people, at gmail and yahoo addresses. Attaching the PDF
-- would put a named minor's allergies, medications and emergency medical
-- authorisation into seven personal mailboxes, permanently, outside every
-- access control this system has, with no way to remove it when a parent
-- revokes consent. They read it in the app, where consent_pdf_signed_url
-- audits the read. The admin note names the household, the signer and the
-- children, and no medical detail at all.

-- ---------------------------------------------------------------------------
-- Where the attachment lives
-- ---------------------------------------------------------------------------
ALTER TABLE church.notification_log
  ADD COLUMN IF NOT EXISTS attachment_bucket TEXT;
ALTER TABLE church.notification_log
  ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE church.notification_log
  ADD COLUMN IF NOT EXISTS attachment_filename TEXT;

-- The signature this row is about, so queueing can be idempotent without
-- guessing from timestamps. A re-render must not post a second copy of the
-- same form.
ALTER TABLE church.notification_log
  ADD COLUMN IF NOT EXISTS consent_signature_id UUID
    REFERENCES church.consent_signatures(id) ON DELETE SET NULL;

-- All three or none. Half an attachment is a row the drainer cannot act on
-- and cannot report sensibly either.
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_attachment;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_attachment
  CHECK (num_nulls(attachment_bucket, attachment_path, attachment_filename) IN (0, 3));

-- An attachment only makes sense on an email.
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_attachment_email;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_attachment_email
  CHECK (attachment_path IS NULL OR channel = 'email');

COMMENT ON COLUMN church.notification_log.attachment_path IS
  'Where the object is, never the bytes. claim_queued_notifications returns '
  'SETOF this table, so a base64 column would be pulled on every drain of '
  'fifty rows whether or not any had an attachment.';

CREATE INDEX IF NOT EXISTS idx_notification_log_consent_signature
  ON church.notification_log (consent_signature_id)
  WHERE consent_signature_id IS NOT NULL;

-- The two new kinds. Name: chk_notification_kind, singular - the plural and
-- the Postgres default are both dropped as well, because getting this wrong
-- leaves the old constraint standing and the failure appears at the first
-- write rather than at deploy.
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS notification_log_kind_check;
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_log_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind
  CHECK (kind = ANY (ARRAY[
    'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
    'kids_access_granted', 'kids_late_pickup', 'kids_check_in_held',
    'kids_hold_presented', 'kids_incident_raised', 'kids_incident_to_parent',
    'kids_medical_updated', 'kids_consent_resign_needed',
    'kids_consent_resign_reminder', 'kids_consent_resign_overdue',
    -- new at 20260322210700
    'kids_consent_signed', 'kids_consent_filed']));

-- ---------------------------------------------------------------------------
-- queue_child_notification learns to carry one
-- ---------------------------------------------------------------------------
--
-- Two trailing parameters with defaults, so all six existing callers - the
-- check-in and check-out triggers among them - keep working unchanged with
-- seven positional arguments. DROP then CREATE because adding parameters is a
-- new signature, and leaving both would give PostgREST two candidates to
-- choose between.
--
-- Everything else about it is untouched, deliberately: this is on the Sunday
-- morning path.
DROP FUNCTION IF EXISTS church.queue_child_notification(TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT);

CREATE FUNCTION church.queue_child_notification(
  _kind TEXT,
  _check_in_id UUID,
  _body TEXT,
  _subject TEXT DEFAULT NULL,
  _channel TEXT DEFAULT 'email',
  _sent_by_person_id UUID DEFAULT NULL,
  _sent_by_name TEXT DEFAULT NULL,
  _attachment_bucket TEXT DEFAULT NULL,
  _attachment_path TEXT DEFAULT NULL,
  _attachment_filename TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  ci church.kids_check_ins%ROWTYPE;
  t RECORD;
  _n INTEGER := 0;
BEGIN
  SELECT * INTO ci FROM church.kids_check_ins WHERE id = _check_in_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  FOR t IN
    SELECT * FROM church.notify_targets_for_child(
      ci.child_person_id, ci.dropped_off_by_person_id, _channel)
  LOOP
    -- No usable address for this channel: record nothing rather than a row
    -- that can never be delivered.
    CONTINUE WHEN coalesce(t.email, t.phone) IS NULL;

    INSERT INTO church.notification_log (
      organization_id, kind, channel,
      recipient_person_id, recipient_name, recipient_email, recipient_phone,
      child_person_id, check_in_id, kids_session_id,
      subject, body, sent_by_person_id, sent_by_name, sent_by_auth_user,
      attachment_bucket, attachment_path, attachment_filename)
    VALUES (
      ci.organization_id, _kind, _channel,
      t.person_id, t.name, t.email, t.phone,
      ci.child_person_id, ci.id, ci.kids_session_id,
      _subject, _body, _sent_by_person_id, _sent_by_name, auth.uid(),
      -- An attachment on an SMS is meaningless, and the CHECK would reject
      -- the whole row rather than that one field.
      CASE WHEN _channel = 'email' THEN _attachment_bucket END,
      CASE WHEN _channel = 'email' THEN _attachment_path END,
      CASE WHEN _channel = 'email' THEN _attachment_filename END);
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.queue_child_notification(
  TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.queue_child_notification(
  TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- The family's copy, and the office's note
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.queue_consent_notifications(_signature_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  s          church.consent_signatures%ROWTYPE;
  _kids      TEXT;
  _kid_count INTEGER;
  _no_medical BOOLEAN;
  _follow_up BOOLEAN;
  _filename  TEXT;
  _body      TEXT;
  _n         INTEGER := 0;
BEGIN
  SELECT * INTO s FROM church.consent_signatures WHERE id = _signature_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- No object, no letter. See the header: this is what removes the "send it
  -- without the attachment" branch entirely.
  IF s.pdf_storage_path IS NULL THEN RETURN 0; END IF;

  -- Idempotent. A re-render must not post a second copy of the same form.
  IF EXISTS (SELECT 1 FROM church.notification_log n
              WHERE n.consent_signature_id = _signature_id) THEN
    RETURN 0;
  END IF;

  SELECT string_agg(cc.child_name_at_signing, ', ' ORDER BY cc.child_name_at_signing),
         count(*)
    INTO _kids, _kid_count
  FROM church.consent_children cc
  WHERE cc.consent_signature_id = _signature_id AND cc.withdrawn_at IS NULL;

  -- Is the medical section still empty for every child on this form? If so
  -- the letter asks, warmly and once. Ten of 534 children have any medical
  -- record at all, so for most families this is the whole point of the form.
  SELECT NOT EXISTS (
    SELECT 1 FROM church.consent_children cc
    JOIN church.person_sensitive ps ON ps.person_id = cc.child_person_id
    WHERE cc.consent_signature_id = _signature_id
      AND cc.withdrawn_at IS NULL
      AND coalesce(ps.allergies, ps.medications, ps.medical_notes,
                   ps.special_needs) IS NOT NULL
  ) INTO _no_medical;

  -- Anything on the form that wants a human conversation rather than a file.
  _follow_up := coalesce(
    (s.answers->>'health_condition_known') IN ('true','yes','on')
    OR (s.answers->>'support_may_be_required') IN ('true','yes','on')
    OR (s.answers->>'off_site_declined') IN ('true','yes','on'), false);

  _filename := 'ALIC consent form - ' || to_char(s.signed_at, 'YYYY-MM-DD') || '.pdf';

  -- --- The family -----------------------------------------------------------
  _body :=
    'Thank you for filling in the consent and medical release form for our '
    || 'Children''s and Youth Ministry. Your copy is attached to this email, '
    || 'and you can ask the church office for another at any time.' || E'\n\n'
    || CASE WHEN _kid_count = 1
            THEN 'It covers ' || coalesce(_kids, 'your child') || '.'
            ELSE 'It covers ' || coalesce(_kids, 'your children') || '.' END
    || E'\n\n'
    || 'It stays in effect until you tell us otherwise. If anything changes - '
    || 'an allergy, a medication, who we should call - please update it in My '
    || 'Church or tell any of the Kids Ministry team, and we will put it '
    || 'right.'
    || CASE WHEN _no_medical THEN E'\n\n'
         || 'One thing we would still be glad to have: we do not yet hold any '
         || 'health or allergy information for '
         || CASE WHEN _kid_count = 1 THEN coalesce(_kids, 'your child')
                 ELSE 'your children' END
         || '. If there is nothing to tell us, that is a good answer and worth '
         || 'recording - it means our volunteers know we asked rather than '
         || 'that nobody did.'
       ELSE '' END
    || E'\n\n'
    || 'If you do not yet have a My Church login, tell any of the Kids '
    || 'Ministry team after a service and we will set one up with you.'
    || E'\n\n'
    || 'Thank you for trusting us with your children on a Sunday morning.';

  -- The signer, and a co-signing second guardian. NOT the household, and NOT
  -- notify_targets_for_child.
  INSERT INTO church.notification_log (
    organization_id, kind, channel, recipient_person_id, recipient_name,
    recipient_email, subject, body, consent_signature_id,
    attachment_bucket, attachment_path, attachment_filename)
  SELECT s.organization_id, 'kids_consent_signed', 'email', p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         p.email,
         'Your consent form for '
           || CASE WHEN _kid_count = 1 THEN coalesce(_kids, 'your child')
                   ELSE 'your children' END,
         _body, _signature_id,
         'kids-consent-forms', s.pdf_storage_path, _filename
  FROM church.people p
  WHERE p.id IN (s.signer_person_id, s.secondary_signer_person_id)
    AND p.is_active AND p.notify_by_email AND p.email IS NOT NULL;

  GET DIAGNOSTICS _n = ROW_COUNT;

  -- --- The office -----------------------------------------------------------
  --
  -- No attachment, and NO MEDICAL DETAIL. Where the form flags something it
  -- says only that one item wants a conversation; "has a nut allergy" would
  -- put in seven mailboxes exactly what the attachment was kept out of.
  INSERT INTO church.notification_log (
    organization_id, kind, channel, recipient_name, recipient_email,
    subject, body, consent_signature_id)
  SELECT s.organization_id, 'kids_consent_filed', 'email', t.full_name, t.email,
         'Consent form filed for ' || coalesce(_kids, 'a family'),
         coalesce(s.signer_printed_name, 'A parent') || ' filled in the consent '
         || 'form on ' || to_char(s.signed_at, 'FMDay FMDD FMMonth')
         || ', covering ' || coalesce(_kids, 'their children') || '.' || E'\n\n'
         || CASE s.source
              WHEN 'portal' THEN 'Signed in My Church.'
              ELSE 'Signed in person at a Kids Ministry check-in station'
                   || coalesce(', witnessed by ' || s.witness_name, '') || '.'
            END
         || E'\n\n'
         || 'Their copy has been emailed to them with the form attached. The '
         || 'church''s copy is on the household record in the app, where '
         || 'opening it is recorded - we have deliberately not attached it '
         || 'here.'
         || CASE WHEN _follow_up THEN E'\n\n'
              || 'One item on this form is marked as needing a follow-up '
              || 'conversation. It is on the form itself.'
            ELSE '' END,
         _signature_id
  FROM church.kids_leaders_to_notify(s.organization_id) t
  WHERE t.email IS NOT NULL;

  BEGIN
    PERFORM church.nudge_kids_notification_sender();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'consent notifications: could not nudge the sender: %', SQLERRM;
  END;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.queue_consent_notifications(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.queue_consent_notifications(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Recording the PDF is what sends the letter
-- ---------------------------------------------------------------------------
--
-- The ordering guarantee, in one place. Wrapped so a queueing failure cannot
-- roll back the path that was just recorded - losing the path would put the
-- signature back in the render queue and produce a second object.
CREATE OR REPLACE FUNCTION church.record_consent_pdf(
  _signature_id UUID,
  _storage_path TEXT,
  _sha256       TEXT,
  _bytes        INTEGER,
  _error        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF _error IS NOT NULL THEN
    UPDATE church.consent_signatures
       SET pdf_error = _error, pdf_attempts = pdf_attempts + 1
     WHERE id = _signature_id;
    RETURN;
  END IF;

  UPDATE church.consent_signatures
     SET pdf_storage_path = _storage_path,
         pdf_sha256 = _sha256,
         pdf_bytes = _bytes,
         pdf_error = NULL,
         pdf_attempts = pdf_attempts + 1
   WHERE id = _signature_id;

  BEGIN
    PERFORM church.queue_consent_notifications(_signature_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'consent PDF recorded but notifications not queued: %', SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION church.record_consent_pdf(UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.record_consent_pdf(UUID, TEXT, TEXT, INTEGER, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- The injury report finally carries its PDF
-- ---------------------------------------------------------------------------
--
-- 20260322200700 has been sending injury emails since it shipped, with the
-- copy saying the parent would receive a written record. The renderer only
-- arrived at 20260322210600, so this is where that promise is kept.
--
-- An injury send now REFUSES while the PDF is still rendering, rather than
-- going out without it. The alternative is an email that says a record is
-- attached when it is not, and a leader who thinks the family has one.
-- Waiting a minute is the cheaper mistake.
CREATE OR REPLACE FUNCTION church.kids_send_incident_to_parent(
  _incident_id UUID,
  _source TEXT DEFAULT 'admin'
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  i church.kids_incidents%ROWTYPE;
  _actor TEXT; _child TEXT; _room TEXT; _body TEXT; _subj TEXT;
  _core TEXT; _n INTEGER;
  _bucket TEXT; _path TEXT; _fname TEXT;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  PERFORM church.assert_kids_incident_admin(i.organization_id);

  -- The rule this whole feature turns on.
  IF i.severity = 'safeguarding' THEN
    RAISE EXCEPTION 'cannot_send_safeguarding_to_parent'
      USING HINT = 'In a safeguarding concern the parent may be the concern. '
                   'Speak to the safeguarding lead; this is not a decision for '
                   'an email.';
  END IF;

  -- Checked BEFORE the status test on purpose. Sending moves status to 'sent',
  -- so a second attempt would otherwise report "not signed off" - true, but a
  -- confusing thing to tell somebody who just sent it.
  IF i.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'already_sent'
      USING HINT = 'This family has already been written to about this report.';
  END IF;
  IF i.status <> 'signed_off' THEN
    RAISE EXCEPTION 'not_signed_off'
      USING HINT = 'Sign the report off first, so somebody has read it.';
  END IF;
  IF _source NOT IN ('admin', 'teacher', 'both') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;
  IF _source IN ('admin', 'both')
     AND length(btrim(coalesce(i.admin_summary, ''))) = 0 THEN
    RAISE EXCEPTION 'no_admin_summary'
      USING HINT = 'There is no leader''s note to send. Write one, or send the '
                   'teacher''s account instead.';
  END IF;

  -- An injury is always told to the parent AND always recorded as a written
  -- document. Sending before the document exists would make the email a
  -- promise nobody kept.
  IF i.severity = 'injury' THEN
    IF i.pdf_storage_path IS NULL THEN
      RAISE EXCEPTION 'injury_record_not_ready'
        USING HINT = 'The written record for this injury is still being '
                     'prepared. It takes a moment; please try again shortly.';
    END IF;
    _bucket := 'kids-incident-reports';
    _path   := i.pdf_storage_path;
    _fname  := 'Injury report - ' || to_char(i.occurred_on, 'YYYY-MM-DD') || '.pdf';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  SELECT coalesce(p.preferred_name, p.first_name) INTO _child
    FROM church.people p WHERE p.id = i.child_person_id;
  SELECT r.name INTO _room FROM public.rooms r WHERE r.id = i.room_id;

  _core := CASE _source
             WHEN 'admin'   THEN btrim(i.admin_summary)
             WHEN 'teacher' THEN btrim(i.reported_narrative)
             ELSE btrim(i.reported_narrative) || E'\n\n' || btrim(i.admin_summary)
           END;

  _subj := CASE i.severity
             WHEN 'injury' THEN coalesce(_child, 'Your child') || ' was hurt at church'
             ELSE 'A note from ' || coalesce(_child, 'your child') || '''s classroom'
           END;

  IF i.severity = 'injury' THEN
    _body :=
      coalesce(_child, 'Your child') || ' was hurt in '
      || coalesce(_room, 'their classroom') || ' on '
      || to_char(i.occurred_on, 'FMDay FMDD FMMonth') || ', and we want you to '
      || 'hear it from us rather than notice it later.' || E'\n\n'
      || _core || E'\n\n'
      || 'Our written record of what happened and what was done at the time is '
      || 'attached, so you have the same account we keep.' || E'\n\n'
      || 'If anything changes, or you would like to talk it through with the '
      || 'person who was in the room, please come and find any of the Kids '
      || 'Ministry team. We would rather have that conversation than not.';
  ELSE
    _body :=
      coalesce(_child, 'Your child') || '''s teacher in '
      || coalesce(_room, 'their classroom') || ' made a note about '
      || to_char(i.occurred_on, 'FMDay FMDD FMMonth')
      || ', and one of our Kids Ministry leaders has looked at it with them.'
      || E'\n\n' || _core || E'\n\n'
      || 'We are telling you because you know ' || coalesce(_child, 'your child')
      || ' better than we do, and a note you never hear about helps nobody. '
      || 'Nothing about this changes how welcome your child is in our '
      || 'classrooms.' || E'\n\n'
      || 'If you would like to talk it over, any of the Kids Ministry team '
      || 'would be glad to. Please do come and find us.';
  END IF;

  IF i.check_in_id IS NULL THEN
    RAISE EXCEPTION 'no_check_in_to_resolve_family'
      USING HINT = 'This report is not tied to a check-in, so the desk cannot '
                   'work out who to write to. Speak with the family directly.';
  END IF;

  SELECT church.queue_child_notification(
           'kids_incident_to_parent', i.check_in_id, _body, _subj, 'email',
           NULL, _actor, _bucket, _path, _fname)
    INTO _n;

  IF coalesce(_n, 0) = 0 THEN
    RAISE EXCEPTION 'nobody_to_write_to'
      USING HINT = 'No contactable parent or guardian is on file for this '
                   'child. Speak with the family directly.';
  END IF;

  UPDATE church.kids_incidents
     SET status = 'sent', parent_message = _body, sent_at = now()
   WHERE id = _incident_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, check_in_id, child_person_id,
     actor_auth_user_id, actor_name, detail)
  VALUES (i.organization_id, 'incident_sent', 'success', i.check_in_id,
          i.child_person_id, auth.uid(), coalesce(_actor, 'A Kids Ministry leader'),
          jsonb_build_object('incident_id', _incident_id, 'severity', i.severity,
                             'source', _source, 'recipients', _n,
                             'attachment', _path IS NOT NULL));

  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_send_incident_to_parent(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- A backstop for the letter, not just for the render
-- ---------------------------------------------------------------------------
--
-- A signature whose PDF exists but whose email was never queued - because the
-- queueing raised, or because record_consent_pdf ran before this migration -
-- would otherwise sit silently forever. Five minutes, alongside the renderer.
CREATE OR REPLACE FUNCTION church.queue_missing_consent_notifications()
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _id UUID; _n INTEGER := 0;
BEGIN
  FOR _id IN
    SELECT s.id FROM church.consent_signatures s
    WHERE s.pdf_storage_path IS NOT NULL
      AND s.revoked_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM church.notification_log n
                       WHERE n.consent_signature_id = s.id)
    ORDER BY s.signed_at
    LIMIT 50
  LOOP
    BEGIN
      PERFORM church.queue_consent_notifications(_id);
      _n := _n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'could not queue consent notifications for %: %', _id, SQLERRM;
    END;
  END LOOP;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.queue_missing_consent_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.queue_missing_consent_notifications() TO service_role;

SELECT cron.unschedule('queue-missing-consent-emails')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queue-missing-consent-emails');

SELECT cron.schedule('queue-missing-consent-emails', '*/5 * * * *',
                     'SELECT church.queue_missing_consent_notifications()');

NOTIFY pgrst, 'reload schema';
