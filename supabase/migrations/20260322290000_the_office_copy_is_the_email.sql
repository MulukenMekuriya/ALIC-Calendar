-- =====================================================
-- The office copy is the email
-- =====================================================
--
-- The "consent form filed" note told the Kids Ministry admins that "the
-- church's copy is on the household record in the app, where opening it is
-- recorded". That was written assuming an audited download would exist.
--
-- The ministry has decided it does not want one: the parent gets their copy
-- by email when they sign, and that is enough. Reasonable - but it left a
-- live email promising a screen that will not be built, and an office that
-- would go looking for a button that is not there.
--
-- So the sentence now says what is true. THE REASON FOR NOT ATTACHING THE PDF
-- IS UNCHANGED and still worth stating in the email itself, because it is the
-- kind of decision somebody will otherwise try to "fix": kids_leaders_to_
-- notify returns TWELVE people today, and attaching a named minor's
-- allergies, medications and emergency medical authorisation would put that
-- in twelve personal mailboxes permanently, outside every access control
-- here, with no way to remove it if a parent withdraws consent.
--
-- ONLY THE OFFICE NOTE CHANGES. The family's own email, with the PDF
-- attached, is untouched - which the assertions check.

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
         || 'The family has been emailed their own copy with the form '
         || 'attached. We have deliberately not attached it here: it names a '
         || 'child''s allergies and medications, and this note goes to '
         || 'everyone on the Kids Ministry list. If you need to see a '
         || 'completed form, ask the family for their copy, or the church '
         || 'office can request it from them.'
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

NOTIFY pgrst, 'reload schema';
