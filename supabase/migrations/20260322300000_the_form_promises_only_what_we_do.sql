-- =====================================================
-- The form promises only what we do
-- =====================================================
--
-- The ministry has decided the parent's emailed PDF is the whole of it: no
-- audited download in the app, no office reissue. That is a reasonable call,
-- but the form and the emails were written for a world where the office could
-- produce another copy, and they say so to parents. On a legal consent, a
-- sentence the church cannot honour is worse than no sentence.
--
-- Three promises are corrected here, and one gap is named out loud.
--
-- 1. THE FORM ITSELF said "you may ask the church office for another copy at
--    any time". The office cannot. It now tells the parent to keep the email,
--    because that email IS their copy.
--
-- 2. THE FAMILY'S EMAIL repeated the same offer. Same correction.
--
-- 3. TEN HOUSEHOLDS HAVE NO ADULT EMAIL ADDRESS. Those families would sign a
--    consent and receive nothing at all - no attachment, and now no reissue
--    either. The form no longer implies otherwise, and the signing screen
--    asks for an address before they sign rather than apologising after.
--
-- AMENDING VERSION 1 IN PLACE, WHICH IS ONLY SAFE BECAUSE NOTHING IS SIGNED.
-- A consent document is hashed precisely so that a stored signature can name
-- the words it agreed to; editing one under a live signature would make every
-- stored body_sha256 a lie. There are ZERO signatures today, so v1 has never
-- been agreed to by anybody and correcting it is the honest move rather than
-- publishing a v2 whose only difference is a sentence nobody ever read. The
-- guard below refuses to run if that stops being true.

DO $amend$
DECLARE _n INTEGER; _org UUID; _body JSONB; _old TEXT; _new TEXT;
BEGIN
  SELECT count(*) INTO _n FROM church.consent_signatures;
  IF _n > 0 THEN
    RAISE EXCEPTION 'cannot amend a signed document: % signatures exist. '
                    'Publish a new version with publish_consent_document '
                    'instead, so the stored hashes keep meaning something.', _n;
  END IF;

  _new := 'What you write here is held by ALIC Church and read by the Kids '
       || 'Ministry leaders and the church office. Your child''s allergy '
       || 'information is printed on their classroom label so the volunteers '
       || 'caring for them can see it. When you sign, we email you a copy of '
       || 'this completed form - please keep that email, because it is your '
       || 'copy and the church cannot send it again. If you would rather we '
       || 'did not email it, or we have no address for you, tell the person '
       || 'at the desk before you sign. If you want to change an answer or '
       || 'withdraw your consent, tell any of the Kids Ministry team or write '
       || 'to the church office, and we will act on it.';

  FOR _org IN SELECT organization_id FROM church.consent_documents
               WHERE code = 'kids_parent_consent' AND retired_at IS NULL
  LOOP
    SELECT d.body INTO _body FROM church.consent_documents d
     WHERE d.organization_id = _org AND d.code = 'kids_parent_consent'
       AND d.retired_at IS NULL;

    SELECT jsonb_agg(
             CASE WHEN s->>'key' = 'data_handling'
                  THEN jsonb_set(s, '{text}', to_jsonb(_new))
                  ELSE s END
             ORDER BY o)
      INTO _body
    FROM jsonb_array_elements(_body) WITH ORDINALITY AS t(s, o);

    -- The hash MUST be recomputed with the text. A body and a sha256 that
    -- disagree is the one state this design exists to make impossible.
    UPDATE church.consent_documents
       SET body = _body,
           body_sha256 = church.consent_document_sha256(_body)
     WHERE organization_id = _org AND code = 'kids_parent_consent'
       AND retired_at IS NULL;
  END LOOP;
END;
$amend$;

-- Belt and braces: the stored hash matches the stored body, for every live
-- document. If this ever fails, no signature taken afterwards means anything.
DO $verify$
DECLARE _bad INTEGER;
BEGIN
  SELECT count(*) INTO _bad FROM church.consent_documents d
   WHERE d.body_sha256 <> church.consent_document_sha256(d.body);
  IF _bad > 0 THEN
    RAISE EXCEPTION '% consent documents have a hash that does not match '
                    'their text', _bad;
  END IF;
END;
$verify$;

-- ---------------------------------------------------------------------------
-- And the family's email stops offering a reissue too
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
    || 'Children''s and Youth Ministry. Your copy is attached to this email. '
    || 'Please keep it - it is your record of what you agreed to, and the '
    || 'church is not able to send it to you again.' || E'\n\n'
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
