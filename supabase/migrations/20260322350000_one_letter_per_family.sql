-- =====================================================
-- One letter per family, in the church's own voice, and none thrown away
-- =====================================================
--
-- On the last two Sundays most parent emails never arrived: 405 of 591 on
-- 27 September, 293 of 472 on 4 October. The church's Resend account stops at
-- about 200 a day. Only a paid plan removes that; this migration does what the
-- database can about the rest, and the ministry approved every part of it.
--
-- 1. ONE EMAIL PER FAMILY, NOT PER CHILD. A family with three children and two
--    parents was sent six check-in emails and six pickup emails. The triggers
--    on kids_check_ins now fold every child checked in (or out) in the same
--    transaction into one email per adult: "Hana and Abel are checked in". On
--    27 September that is 326 emails instead of 489. check_in_ids records
--    which check-ins each email covers; check_in_id keeps the first.
--
--    "The same transaction" is created_at = now(). now() is fixed for a whole
--    transaction, and the sender cannot claim a row it cannot see, so a row
--    found that way is still being written by the call that is checking in
--    this family.
--
-- 2. THE PICKUP CODE IS IN THE CHECK-IN EMAIL. It was only ever sent by text,
--    and no texting service is connected, so no parent has received one. It
--    is read from the code kept since 20260322340500, and only when that copy
--    still matches its hash. It is the code already printed on the child's
--    tag; the email goes to the adults the system already notifies.
--
--    An adult with a live pickup restriction for a child is told nothing about
--    that child, and gets no code if they are restricted for any child the
--    code collects. Nothing checked this before; production has had no
--    restricted check-in in 60 days, so today nobody notices the difference.
--
--    A replayed check-in (a retry after a lost response) used to rotate the
--    code, which would now leave the emailed code dead. It reuses the kept
--    code instead, as a reprint does.
--
-- 3. NOTHING THROWN AWAY FOR BEING EARLY. A refused email was retried once a
--    minute and abandoned after five tries, so everything queued after the
--    daily limit was gone within five minutes, including consent-form copies
--    the email itself says cannot be sent again. complete_notification takes
--    a _retry_after: a "limit reached" or "too many requests" answer is a
--    wait, not a failed attempt, and not_before holds the row until then.
--    Check-in, pickup and urgent classroom notices more than three hours old
--    are skipped instead of arriving the next day.
--
-- 4. ONE SENDER AT A TIME. Every check-in started its own sending run on top of
--    the one each minute, and together they broke Resend's 10-a-second limit.
--    claim_queued_notifications now hands out nothing while another run is
--    mid-batch; the edge function paces itself.
--
-- 5. THE WORDING. Greeting, blessing, scripture and the church's name and
--    colours are added by send-kids-notification, around these bodies. The
--    bodies here change where the approved draft changed them: check-in and
--    pickup, the late-pickup note, the signed consent copy, and the subject of
--    a classroom's urgent message.

ALTER TABLE church.notification_log
  ADD COLUMN IF NOT EXISTS not_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_in_ids UUID[];

COMMENT ON COLUMN church.notification_log.not_before IS
  'Not to be claimed before this time. Set when the email service says to wait.';
COMMENT ON COLUMN church.notification_log.check_in_ids IS
  'Every check-in a family email covers. check_in_id is the first of them.';

-- ---------------------------------------------------------- helpers

/** Whether this adult is barred today from collecting this child. */
CREATE OR REPLACE FUNCTION church.kids_is_restricted_from(
  _person_id UUID, _child_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM church.kids_pickup_restrictions r
    WHERE r.restricted_person_id = _person_id
      AND r.child_person_id = _child_person_id
      AND r.lifted_at IS NULL
      AND r.effective_from <= CURRENT_DATE
      AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE));
$$;

REVOKE ALL ON FUNCTION church.kids_is_restricted_from(UUID, UUID) FROM PUBLIC, anon, authenticated;

/** "Hana", "Hana and Abel", "Hana, Abel and Ruth". */
CREATE OR REPLACE FUNCTION church.kids_join_names(_names TEXT[])
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = church, public
AS $$
  SELECT CASE coalesce(array_length(_names, 1), 0)
    WHEN 0 THEN NULL
    WHEN 1 THEN _names[1]
    ELSE array_to_string(_names[1:array_length(_names, 1) - 1], ', ')
         || ' and ' || _names[array_length(_names, 1)]
  END;
$$;

REVOKE ALL ON FUNCTION church.kids_join_names(TEXT[]) FROM PUBLIC, anon, authenticated;

/**
 * The subject and body of a family's check-in or pickup email.
 *
 * Built from the check-ins it covers, so the same function writes the first
 * child's email and rewrites it as each sibling joins. The greeting and the
 * blessing are not here: send-kids-notification puts them around every
 * parent's email, so the bodies stay plain sentences.
 */
CREATE OR REPLACE FUNCTION church.kids_family_notice(
  _kind TEXT, _check_in_ids UUID[], _with_code BOOLEAN,
  OUT subject TEXT, OUT body TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _names TEXT[];
  _rooms TEXT[];
  _batch UUID;
  _at TIMESTAMPTZ;
  _by TEXT;
  _n INTEGER;
  _who TEXT;
  _them TEXT;
  _code TEXT;
  _list TEXT;
BEGIN
  SELECT array_agg(coalesce(p.preferred_name, p.first_name, ci.label_child_name)
                   ORDER BY ci.tag_number, ci.id),
         array_agg(coalesce(ci.label_room_name, 'the Children''s Ministry')
                   ORDER BY ci.tag_number, ci.id),
         (array_agg(ci.batch_id))[1],
         max(ci.checked_out_at),
         (array_agg(ci.picked_up_by_name ORDER BY ci.checked_out_at DESC NULLS LAST))[1]
    INTO _names, _rooms, _batch, _at, _by
  FROM church.kids_check_ins ci
  LEFT JOIN church.people p ON p.id = ci.child_person_id
  WHERE ci.id = ANY(_check_in_ids);

  _n := coalesce(array_length(_names, 1), 0);
  IF _n = 0 THEN RETURN; END IF;
  _who := church.kids_join_names(_names);
  _them := CASE WHEN _n = 1 THEN _who ELSE 'them' END;

  IF _kind = 'check_in' THEN
    IF _with_code THEN
      -- Only a copy that still matches its hash: a stale one is a dead code.
      SELECT s.pickup_code INTO _code
      FROM church.kids_check_in_secrets s
      WHERE s.batch_id = _batch
        AND s.pickup_code IS NOT NULL
        AND s.code_hash = church.hash_pickup(s.pickup_code);
      -- Grouped the way it is printed, so the email and the slip read alike.
      IF length(_code) = 6 THEN
        _code := left(_code, 3) || '-' || right(_code, 3);
      END IF;
    END IF;

    subject := _who || CASE WHEN _n = 1 THEN ' is checked in' ELSE ' are checked in' END;

    IF _n = 1 THEN
      body := _who || ' is checked in to ' || _rooms[1] || '.';
    ELSE
      SELECT string_agg('• ' || _names[i] || ', ' || _rooms[i], E'\n' ORDER BY i)
        INTO _list
      FROM generate_subscripts(_names, 1) AS i;
      body := _who || ' are checked in and with their teachers:' || E'\n' || _list;
    END IF;

    body := body || E'\n\n'
      || CASE WHEN _code IS NOT NULL THEN
           'Your pickup code is ' || _code || '. It is also on your printed slip and on '
           || CASE WHEN _n = 1 THEN _who || '''s name tag' ELSE 'the children''s name tags' END
           || ', and you''ll need it to collect ' || _them || '.'
         ELSE
           'Please keep your printed pickup slip with you. You''ll need it to collect '
           || _them || '.'
         END
      || E'\n\n'
      || 'We''re so glad ' || CASE WHEN _n = 1 THEN _who || ' is' ELSE 'they''re' END
      || ' with us today. Enjoy worship!';

  ELSE
    subject := _who || CASE WHEN _n = 1 THEN ' has been picked up' ELSE ' have been picked up' END;
    body := _who || CASE WHEN _n = 1 THEN ' was' ELSE ' were' END || ' picked up'
      || coalesce(' at ' || to_char(_at AT TIME ZONE 'America/New_York', 'FMHH12:MI AM'), '')
      || CASE WHEN nullif(btrim(coalesce(_by, '')), '') IS NOT NULL AND _by <> 'unrecorded'
              THEN ' by ' || _by ELSE '' END
      || '.' || E'\n\n'
      || 'Thank you for worshipping with us today. It was a joy to have ' || _them
      || ', and we look forward to seeing your family next Sunday.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_family_notice(TEXT, UUID[], BOOLEAN) FROM PUBLIC, anon, authenticated;

/**
 * Queue, or extend, this family's check-in or pickup email for every adult the
 * child's notices go to.
 *
 * Called once per child by the triggers. The first child of a family starts an
 * email per adult; each sibling in the same transaction is folded into it.
 */
CREATE OR REPLACE FUNCTION church.queue_family_notice(
  _kind TEXT, _ci church.kids_check_ins)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  t RECORD;
  _row RECORD;
  _txt RECORD;
  _ids UUID[];
  _code_ok BOOLEAN;
  _n INTEGER := 0;
BEGIN
  FOR t IN
    SELECT * FROM church.notify_targets_for_child(
      _ci.child_person_id, _ci.dropped_off_by_person_id, 'email')
  LOOP
    CONTINUE WHEN t.email IS NULL;

    -- This family's email to this adult, if this same call already started one.
    SELECT n.id, n.check_in_ids INTO _row
    FROM church.notification_log n
    WHERE n.kind = _kind
      AND n.channel = 'email'
      AND n.recipient_person_id = t.person_id
      AND n.status = 'queued'
      AND n.created_at = now()
      AND EXISTS (SELECT 1 FROM church.kids_check_ins x
                   WHERE x.id = ANY(n.check_in_ids) AND x.batch_id = _ci.batch_id)
    LIMIT 1;

    -- Barred from collecting this child: told nothing about them. An email
    -- already started for a sibling loses the code, which collects this child
    -- too.
    IF church.kids_is_restricted_from(t.person_id, _ci.child_person_id) THEN
      IF _row.id IS NOT NULL AND _kind = 'check_in' THEN
        SELECT * INTO _txt FROM church.kids_family_notice(_kind, _row.check_in_ids, false);
        UPDATE church.notification_log
           SET subject = _txt.subject, body = _txt.body
         WHERE id = _row.id;
      END IF;
      CONTINUE;
    END IF;

    _ids := coalesce(_row.check_in_ids, '{}'::UUID[]) || _ci.id;
    _code_ok := _kind = 'check_in' AND NOT EXISTS (
      SELECT 1 FROM church.kids_check_ins x
      WHERE x.batch_id = _ci.batch_id
        AND x.status = 'checked_in'
        AND church.kids_is_restricted_from(t.person_id, x.child_person_id));
    SELECT * INTO _txt FROM church.kids_family_notice(_kind, _ids, _code_ok);

    IF _row.id IS NOT NULL THEN
      UPDATE church.notification_log
         SET check_in_ids = _ids, subject = _txt.subject, body = _txt.body
       WHERE id = _row.id;
    ELSE
      INSERT INTO church.notification_log (
        organization_id, kind, channel,
        recipient_person_id, recipient_name, recipient_email,
        child_person_id, check_in_id, check_in_ids, kids_session_id,
        subject, body, sent_by_auth_user)
      VALUES (
        _ci.organization_id, _kind, 'email',
        t.person_id, t.name, t.email,
        _ci.child_person_id, _ci.id, _ids, _ci.kids_session_id,
        _txt.subject, _txt.body, auth.uid());
      _n := _n + 1;
    END IF;
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.queue_family_notice(TEXT, church.kids_check_ins) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------- triggers

CREATE OR REPLACE FUNCTION church.notify_on_check_in()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public'
AS $function$
BEGIN
  PERFORM church.queue_family_notice('check_in', NEW);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION church.notify_on_check_out()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public'
AS $function$
BEGIN
  -- Only a real pickup. An auto-expired row is a data-hygiene action, NOT a
  -- record that the child was collected, so it must never tell a parent their
  -- child was picked up.
  IF NEW.status <> 'checked_out' OR NEW.checkout_method = 'system_auto' THEN
    RETURN NEW;
  END IF;
  PERFORM church.queue_family_notice('check_out', NEW);
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------- the sender's side

CREATE OR REPLACE FUNCTION church.claim_queued_notifications(_limit integer DEFAULT 50)
 RETURNS SETOF church.notification_log
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
BEGIN
  -- One sender at a time. The lock makes the check below and the claim one
  -- step; a run that finds another mid-batch hands out nothing, and the next
  -- minute's run picks the rows up.
  PERFORM pg_advisory_xact_lock(hashtext('church.claim_queued_notifications'));
  IF EXISTS (SELECT 1 FROM church.notification_log n
              WHERE n.status = 'sending'
                AND n.claimed_at > now() - interval '2 minutes') THEN
    RETURN;
  END IF;

  -- A check-in, pickup or urgent classroom notice three hours late is worse
  -- than none: "Hana is checked in" on Monday morning helps nobody.
  UPDATE church.notification_log n
     SET status = 'skipped',
         error = 'not sent: more than 3 hours late, so no longer useful'
   WHERE n.status = 'queued'
     AND n.kind IN ('check_in', 'check_out', 'volunteer_message')
     AND n.created_at < now() - interval '3 hours';

  RETURN QUERY
  WITH claimable AS (
    SELECT n.id
    FROM church.notification_log n
    WHERE n.attempts < 5
      AND (n.not_before IS NULL OR n.not_before <= now())
      AND (
        n.status = 'queued'
        OR (n.status = 'sending' AND n.claimed_at < now() - interval '5 minutes')
      )
    ORDER BY n.created_at
    LIMIT greatest(1, least(coalesce(_limit, 50), 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE church.notification_log n
     SET status = 'sending',
         claimed_at = now(),
         attempts = n.attempts + 1
    FROM claimable c
   WHERE n.id = c.id
  RETURNING n.*;
END;
$function$;

-- A new parameter is a new signature: drop the old one, or PostgREST sees two
-- functions that both match a four-argument call.
DROP FUNCTION IF EXISTS church.complete_notification(uuid, boolean, text, text);

CREATE FUNCTION church.complete_notification(
  _id uuid, _ok boolean, _provider_message_id text DEFAULT NULL::text,
  _error text DEFAULT NULL::text, _retry_after interval DEFAULT NULL::interval)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  -- "Not now" from the service is a wait, not a failed attempt.
  _wait BOOLEAN := NOT _ok AND _retry_after IS NOT NULL;
BEGIN
  UPDATE church.notification_log n
     SET status = CASE
                    WHEN _ok THEN 'sent'
                    WHEN _wait THEN 'queued'
                    WHEN n.attempts >= 5 THEN 'failed'
                    ELSE 'queued'
                  END,
         attempts = CASE WHEN _wait THEN greatest(n.attempts - 1, 0) ELSE n.attempts END,
         not_before = CASE WHEN _wait THEN now() + _retry_after ELSE NULL END,
         provider_message_id = coalesce(_provider_message_id, n.provider_message_id),
         error = CASE WHEN _ok THEN NULL ELSE left(_error, 500) END,
         sent_at = CASE WHEN _ok THEN now() ELSE n.sent_at END,
         claimed_at = NULL
   WHERE n.id = _id;
END;
$function$;

REVOKE ALL ON FUNCTION church.complete_notification(uuid, boolean, text, text, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION church.complete_notification(uuid, boolean, text, text, interval) TO service_role;
REVOKE ALL ON FUNCTION church.claim_queued_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION church.claim_queued_notifications(integer) TO service_role;

-- ---------------------------------------------------------- wording



-- The late-pickup note, in the approved wording. Unchanged otherwise.
CREATE OR REPLACE FUNCTION church.kids_notify_late_pickup(_late_pickup_id uuid, _message text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  lp     church.kids_late_pickups%ROWTYPE;
  _actor TEXT;
  _body  TEXT;
  _subj  TEXT;
  _child TEXT;
  _room  TEXT;
  _n     INTEGER;
BEGIN
  SELECT * INTO lp FROM church.kids_late_pickups WHERE id = _late_pickup_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'late_pickup_not_found'; END IF;

  -- has_permission_in_org, NOT assert_kids_leader: kids_leader_orgs() includes
  -- leadership_viewer, a read-only reporting role that must not send a parent
  -- anything.
  IF NOT church.has_permission_in_org(
       lp.organization_id,
       ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF lp.status <> 'recorded' THEN
    RAISE EXCEPTION 'already_reviewed'
      USING HINT = 'This one has already been sent or dismissed.';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'A Kids Ministry leader');

  SELECT coalesce(p.preferred_name, p.first_name) INTO _child
    FROM church.people p WHERE p.id = lp.child_person_id;
  SELECT r.name INTO _room FROM public.rooms r WHERE r.id = lp.room_id;

  _subj := 'Collecting ' || coalesce(_child, 'your child') || ' after the service';

  -- The drafted wording, used when the leader does not write their own. Notice
  -- what it does not contain: a count, a consequence, or a next time. There is
  -- no consequence, and inventing the shadow of one is the tone the ministry
  -- asked to avoid.
  _body := coalesce(nullif(btrim(coalesce(_message, '')), ''),
    CASE WHEN lp.source = 'never_collected' THEN
      'Our records do not show ' || coalesce(_child, 'your child')
      || ' being collected from ' || coalesce(_room, 'their classroom')
      || ' at the end of the service on '
      || to_char(lp.session_date, 'FMDay FMDD FMMonth') || '. Nobody at the '
      || 'classroom door recorded a pickup.' || E'\n\n'
      || 'We are not saying that ' || coalesce(_child, 'your child')
      || ' was left with us. We are saying that we do not know, and that is '
      || 'the thing we would like to put right together. The record at the '
      || 'door is how we can tell you where your child is at any moment of a '
      || 'Sunday morning, and it only works when it is kept.' || E'\n\n'
      || 'If your child was collected and the desk simply did not record it, '
      || 'please tell any of the Children''s Ministry team and we will correct '
      || 'it gladly.'
    ELSE
      coalesce(_child, 'Your child') || ' was collected from '
      || coalesce(_room, 'their classroom') || ' about '
      || lp.minutes_late::TEXT || ' minutes after the service ended on '
      || to_char(lp.session_date, 'FMDay FMDD FMMonth') || '.' || E'\n\n'
      || 'We know Sunday mornings can run long, and we are always glad you are '
      || 'here. Our classrooms are served by volunteers whose own families are '
      || 'waiting for them too, so we would be grateful for your help in '
      || 'collecting children soon after the service.' || E'\n\n'
      || 'If something kept you this morning, please tell any of the '
      || 'Children''s Ministry team. We would love to help.'
    END);

  -- Reuses the whole existing pipeline: consent filtering, household
  -- resolution, the guardian fallback, and the statement-level trigger that
  -- wakes the sender.
  SELECT church.queue_child_notification(
           'kids_late_pickup', lp.check_in_id, _body, _subj, 'email', NULL, _actor)
    INTO _n;

  UPDATE church.kids_late_pickups
     SET status = 'notified',
         parent_message = _body,
         parent_notified_at = now(),
         reviewed_by = auth.uid(),
         reviewed_by_name = _actor,
         reviewed_at = now()
   WHERE id = _late_pickup_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, check_in_id, kids_session_id,
     child_person_id, actor_auth_user_id, actor_name, detail)
  VALUES (lp.organization_id, 'late_pickup_notified', 'success', lp.check_in_id,
          lp.kids_session_id, lp.child_person_id, auth.uid(), _actor,
          jsonb_build_object('recipients', _n, 'source', lp.source));

  RETURN coalesce(_n, 0);
END;
$function$;

-- The family's copy of a signed consent form, in the approved wording.
CREATE OR REPLACE FUNCTION church.queue_consent_notifications(_signature_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
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
    'Thank you for completing the consent and medical form for '
    || coalesce(_kids, CASE WHEN _kid_count = 1 THEN 'your child' ELSE 'your children' END)
    || '. Your copy is attached. Please keep it for your records, as we are '
    || 'not able to send it again.' || E'\n\n'
    || 'It stays in effect until you tell us otherwise. If anything changes, '
    || 'such as an allergy, a medication or who we should call, update it in '
    || 'My Church or tell any of the Children''s Ministry team.'
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
    || 'If you do not yet have a My Church login, tell any of the '
    || 'Children''s Ministry team after a service and we will set one up '
    || 'with you.'
    || E'\n\n'
    || 'Thank you for trusting us with your children. It is a privilege to '
    || 'serve your family.';

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
$function$;

-- A classroom's urgent message: the subject now names the room.
CREATE OR REPLACE FUNCTION church.send_parent_message(_check_in_id uuid, _message text, _shift_token text DEFAULT NULL::text)
 RETURNS TABLE(recipient_name text, channel text, destination text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  a church.resolved_actor;
  ci church.kids_check_ins%ROWTYPE;
  _queued INTEGER;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(_message), '') = '' THEN
    RAISE EXCEPTION 'message_required';
  END IF;

  -- Qualified: `status` is also an output column of this function.
  SELECT * INTO ci FROM church.kids_check_ins k
   WHERE k.id = _check_in_id
     AND k.organization_id = a.organization_id
     AND k.status = 'checked_in';
  IF NOT FOUND THEN RAISE EXCEPTION 'check_in_not_active'; END IF;

  _queued := church.queue_child_notification(
    'volunteer_message', _check_in_id,
    btrim(_message),
    -- Where to go, in the subject: it is what a parent reads on a lock screen
    -- in the middle of a service.
    format('Please come to %s', coalesce(ci.label_room_name, 'the Children''s Ministry')),
    'email', a.person_id, a.actor_name);

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, check_in_id, child_person_id,
    station_id, volunteer_id, actor_auth_user_id, actor_name, detail)
  VALUES (
    a.organization_id, 'sensitive_viewed',
    CASE WHEN _queued > 0 THEN 'success' ELSE 'error' END,
    _check_in_id, ci.child_person_id, a.station_id, a.volunteer_id,
    auth.uid(), a.actor_name,
    jsonb_build_object('action', 'volunteer_message', 'recipients', _queued));

  RETURN QUERY
  SELECT n.recipient_name, n.channel,
         coalesce(n.recipient_email, n.recipient_phone), n.status
  FROM church.notification_log n
  WHERE n.check_in_id = _check_in_id
    AND n.kind = 'volunteer_message'
    AND n.created_at > now() - interval '10 seconds'
  ORDER BY n.recipient_name;
END;
$function$;


-- ---------------------------------------------------------- check-in

-- Unchanged from 20260322340500 except the replay, which reuses the kept
-- code instead of rotating it. Same signature and columns.
CREATE OR REPLACE FUNCTION church.check_in_children(_kids_session_id uuid, _child_person_ids uuid[], _room_ids uuid[] DEFAULT NULL::uuid[], _shift_token text DEFAULT NULL::text, _client_batch_key text DEFAULT NULL::text, _dropped_off_by_person_id uuid DEFAULT NULL::uuid, _override_capacity boolean DEFAULT false, _assignment_reason text DEFAULT NULL::text)
 RETURNS TABLE(
  batch_id UUID, pickup_code TEXT, pickup_token TEXT, check_in_id UUID,
  child_person_id UUID, child_name TEXT, room_id UUID, room_name TEXT,
  tag_number INTEGER, allergy_label TEXT, has_restriction BOOLEAN,
  guardian_phone TEXT, refused BOOLEAN, refusal_code TEXT, refusal_message TEXT,
  -- Sixteenth column, new here. A WARNING, not a refusal: in warn mode a
  -- child with no consent form is checked in normally and this says so, so
  -- the desk can mention it while the parent is still standing there.
  -- Refusal columns mean "this child was not checked in" and must not be
  -- borrowed to carry a note.
  consent_state TEXT)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  a  church.resolved_actor;
  ks church.kids_sessions%ROWTYPE;
  ke church.kids_events%ROWTYPE;
  _batch UUID;
  _code TEXT;
  _token TEXT;
  _existing church.kids_check_in_batches%ROWTYPE;
  _child UUID;
  _idx INTEGER := 0;
  -- child id -> refusal code, and child id -> consent state.
  --
  -- JSONB maps rather than arrays running alongside _child_person_ids. Three
  -- reasons can now refuse a child, so the code has to travel per child, and
  -- parallel arrays are exactly where this goes wrong silently: in plpgsql
  -- `anyarray || NULL::anyelement` and `|| NULL::anyarray` do different
  -- things, and a misaligned array would refuse the wrong sibling with no
  -- error anywhere.
  _refusals JSONB := '{}'::jsonb;
  _states   JSONB := '{}'::jsonb;
  _hold church.kids_check_in_holds%ROWTYPE;
  _gate RECORD;
  _mode TEXT;
  _n INTEGER;
  _i INTEGER;
  _room UUID;
  _tries INTEGER := 0;
  _household UUID;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted_to_check_in' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ks FROM church.kids_sessions
   WHERE id = _kids_session_id AND organization_id = a.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF ks.status <> 'open' THEN RAISE EXCEPTION 'session_not_open'; END IF;

  -- No clock gate here. `status = 'open'`, checked immediately above, IS the
  -- gate: a session is open because the scheduler opened it or a leader did,
  -- and either way somebody has decided children may be checked in.
  --
  -- The window on kids_events governs when a session opens and closes by
  -- itself. Enforcing it a second time here meant a leader who opened a
  -- session deliberately — for a midweek programme, a delayed start, or simply
  -- to try the desk before Sunday — got `outside_check_in_window` and could
  -- check nobody in, with an open session on screen telling them they could.
  -- A session left open too long is handled by auto-close, not by refusing the
  -- volunteer standing in front of a parent.
  SELECT * INTO ke FROM church.kids_events WHERE id = ks.kids_event_id;

  IF _child_person_ids IS NULL OR array_length(_child_person_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_children_supplied';
  END IF;

  -- Idempotent retry after a lost response. The children are already checked
  -- in, so do NOT check them in again; hand back the family's code. It is the
  -- code the first call already emailed, so it is reused rather than rotated;
  -- only a batch with no live copy on file rotates, as every replay once did.
  IF _client_batch_key IS NOT NULL THEN
    SELECT * INTO _existing FROM church.kids_check_in_batches
     WHERE kids_session_id = _kids_session_id AND client_batch_key = _client_batch_key;

    -- Replay ONLY while the batch still has a child in a room. The key exists
    -- so a lost response cannot check the same children in twice; it is not a
    -- claim that this family can never check in again. Matching on the key
    -- alone meant a family returning later got a rotated code for children who
    -- were already checked OUT — the screen said success, a label printed, and
    -- the code on it resolved to nothing.
    IF FOUND AND NOT church.kids_batch_is_replayable(_existing.id) THEN
      -- The key is unique per session, so simply declining to replay would
      -- collide on the insert below and the family could not check in at all.
      -- Retire the spent batch's key instead: it only needs to be reserved
      -- while that batch is live, and the old value is kept, suffixed, so the
      -- morning's history is still readable.
      UPDATE church.kids_check_in_batches
         SET client_batch_key = client_batch_key || ':done:' || _existing.id
       WHERE id = _existing.id;
      _existing := NULL;
    END IF;

    IF _existing.id IS NOT NULL THEN
      -- Qualified throughout: batch_id, pickup_code and pickup_token are also
      -- RETURNS TABLE output parameters, and unqualified they are ambiguous.
      SELECT s.pickup_code, s.pickup_token INTO _code, _token
      FROM church.kids_check_in_secrets s
      WHERE s.batch_id = _existing.id
        AND s.pickup_code IS NOT NULL
        AND s.pickup_token IS NOT NULL
        AND s.code_hash = church.hash_pickup(s.pickup_code)
        AND s.token_hash = church.hash_pickup(s.pickup_token);

      IF FOUND THEN
        UPDATE church.kids_check_in_secrets s
           SET attempts = 0, locked_until = NULL
         WHERE s.batch_id = _existing.id;
      ELSE
        _code := church.generate_pickup_code();
        _token := encode(gen_random_bytes(16), 'base64');
        UPDATE church.kids_check_in_secrets
           SET code_hash = church.hash_pickup(_code),
               token_hash = church.hash_pickup(_token),
               pickup_code = _code,
               pickup_token = _token,
               attempts = 0, locked_until = NULL, rotated_at = now(),
               -- Rotating a code that was already consumed leaves the parent
               -- holding a label that resolves to nothing.
               consumed_at = NULL
         WHERE kids_check_in_secrets.batch_id = _existing.id;
      END IF;

      -- Sixteen columns, matching the widened RETURNS TABLE. A replay reports
      -- what was already written, and nothing in it was refused - the refusal
      -- happens on the FIRST call, before the batch exists.
      --
      -- This branch is the reason the idempotency key exists, and it is the
      -- one a signature change is most likely to miss: plpgsql validates
      -- RETURN QUERY arity at EXECUTION, not at CREATE, so a short select list
      -- here applies cleanly and then throws 42804 only on a retry after a
      -- lost response - with the batch already committed, the children already
      -- in rooms, and a pickup code nobody has seen.
      RETURN QUERY
      SELECT _existing.id, _code, _token, ci.id, ci.child_person_id,
             ci.label_child_name, ci.room_id, ci.label_room_name, ci.tag_number,
             ci.label_allergy_short, ci.has_pickup_restriction,
             church.household_contact_phone(ci.household_id),
             false, NULL::TEXT, NULL::TEXT, NULL::TEXT
      FROM church.kids_check_ins ci
      WHERE ci.batch_id = _existing.id
      ORDER BY ci.tag_number;
      RETURN;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------
  -- Pass 1: who may not be checked in this morning
  -- ---------------------------------------------------------------------
  --
  -- A refusal is returned as DATA, never raised. Every other refusal in this
  -- function is a RAISE, which aborts the transaction and would destroy the
  -- batch, the pickup secret, the audit rows and EVERY SIBLING ALREADY
  -- INSERTED. A family of three with one held child must leave the desk with
  -- two labels and an apology, not with nothing.
  --
  -- Placed AFTER the idempotent-replay branch on purpose. A replay is a report
  -- of what was already written; refusing one would leave a family holding a
  -- printed label for children who are physically in rooms, with a rotated
  -- code that resolves to nothing.
  --
  -- Placed BEFORE the batch insert on purpose too: if every child is held,
  -- there is no batch, no secret, no code minted and no SMS queued. Nothing to
  -- print and nothing to lose.
  _n := coalesce(array_length(_child_person_ids, 1), 0);

  -- Read once. With consent switched off there is no reason to ask the gate
  -- anything at all, and this is the Sunday morning path.
  SELECT p.mode INTO _mode FROM church.kids_consent_policy p
   WHERE p.organization_id = a.organization_id;

  FOR _i IN 1.._n LOOP
    -- A HOLD OUTRANKS PAPERWORK. A kids admin decided this child stays with
    -- their parents this morning; being told instead that a form is missing
    -- would send the family to the desk to fix the wrong thing.
    _hold := church.kids_live_hold_for(_child_person_ids[_i], _kids_session_id);
    IF _hold.id IS NOT NULL THEN
      _refusals := _refusals
        || jsonb_build_object(_child_person_ids[_i]::TEXT, 'check_in_held');
      PERFORM church.kids_serve_hold(_hold.id, _kids_session_id, a.actor_name);
      CONTINUE;
    END IF;

    CONTINUE WHEN coalesce(_mode, 'warn') = 'off';

    SELECT * INTO _gate
      FROM church.kids_consent_gate(_child_person_ids[_i], _kids_session_id);

    -- The note, whether or not it refuses. Covered children say nothing.
    IF _gate.state NOT IN ('covered', 'covered_elsewhere') THEN
      _states := _states
        || jsonb_build_object(_child_person_ids[_i]::TEXT, _gate.state);
    END IF;

    -- allow is false ONLY when the policy is enforcing and the date has
    -- arrived. In warn mode, and before the date, this never fires - which is
    -- what lets this migration ship today without turning anybody away.
    IF NOT _gate.allow THEN
      _refusals := _refusals
        || jsonb_build_object(_child_person_ids[_i]::TEXT,
                              coalesce(_gate.refusal_code, 'consent_not_on_file'));
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM jsonb_object_keys(_refusals)) = _n AND _n > 0 THEN
    -- Everyone was held. Nothing is written at all.
    RETURN QUERY
    SELECT NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::UUID, p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
           NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, false, NULL::TEXT,
           true,
           _refusals->>p.id::TEXT,
           church.kids_refusal_message(
             coalesce(p.preferred_name, p.first_name), _refusals->>p.id::TEXT),
           _states->>p.id::TEXT
    FROM church.people p WHERE _refusals ? p.id::TEXT;
    RETURN;
  END IF;

  SELECT hm.household_id INTO _household
  FROM church.household_members hm
  WHERE hm.person_id = _child_person_ids[1]
    AND hm.end_date IS NULL AND hm.is_primary_household
  LIMIT 1;

  INSERT INTO church.kids_check_in_batches
    (organization_id, kids_session_id, household_id, client_batch_key,
     created_by_station_id, created_by_volunteer_id, created_by_name)
  VALUES (a.organization_id, _kids_session_id, _household, _client_batch_key,
          a.station_id, a.volunteer_id, a.actor_name)
  RETURNING id INTO _batch;

  -- Generate a code unique among the live codes for this session. Collision
  -- odds are ~1e-4 across a whole morning, but retry rather than trust that.
  _token := encode(gen_random_bytes(16), 'base64');
  LOOP
    _tries := _tries + 1;
    _code := church.generate_pickup_code();
    BEGIN
      -- Kept beside their hashes, so a lost slip can be reprinted with the
      -- code already on every child's tag. See the head of this migration.
      INSERT INTO church.kids_check_in_secrets
        (batch_id, kids_session_id, code_hash, token_hash,
         pickup_code, pickup_token, expires_at)
      VALUES (_batch, _kids_session_id,
              church.hash_pickup(_code), church.hash_pickup(_token),
              _code, _token,
              greatest(ks.ends_at
                        + make_interval(mins => coalesce(ke.auto_expire_minutes_after_end, 240)),
                       now()) + interval '4 hours');
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF _tries >= 10 THEN RAISE EXCEPTION 'could_not_allocate_pickup_code'; END IF;
    END;
  END LOOP;

  FOREACH _child IN ARRAY _child_person_ids LOOP
    -- _idx advances for EVERY child, held or not. _room_ids is POSITIONAL
    -- against _child_person_ids, so skipping the increment would put each
    -- remaining sibling in the previous sibling's classroom - silently, with
    -- no error, which is the worst kind of wrong this function could be.
    _idx := _idx + 1;
    CONTINUE WHEN _refusals ? _child::TEXT;
    _room := CASE WHEN _room_ids IS NULL THEN NULL ELSE _room_ids[_idx] END;
    PERFORM church.check_in_one_child(
      a, _kids_session_id, _batch, _child, _room,
      _dropped_off_by_person_id, _override_capacity, _assignment_reason);
  END LOOP;

  -- AFTER the children are inserted, not before. Queued any earlier the
  -- message named no children, because there were none on the batch yet.
  --
  -- Never raises — a failed text must not roll back a completed check-in.
  PERFORM church.queue_pickup_code_sms(_batch, _code);

  -- Accepted first, refused last, so the existing rows[0].pickup_code on the
  -- desk still finds a real code whenever at least one child got in. A refused
  -- row carries NO code: a held child's parent must never hold one.
  RETURN QUERY
  SELECT _batch, _code, _token, ci.id, ci.child_person_id,
         ci.label_child_name, ci.room_id, ci.label_room_name, ci.tag_number,
         ci.label_allergy_short, ci.has_pickup_restriction,
         church.household_contact_phone(ci.household_id),
         false, NULL::TEXT, NULL::TEXT,
         -- An accepted child can still carry a note: in warn mode they came
         -- in without a form, and the desk can say so while the parent is
         -- still there.
         _states->>ci.child_person_id::TEXT
  FROM church.kids_check_ins ci
  WHERE ci.batch_id = _batch

  UNION ALL

  SELECT _batch, NULL::TEXT, NULL::TEXT, NULL::UUID, p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         NULL::UUID, NULL::TEXT, NULL::INTEGER, NULL::TEXT, false, NULL::TEXT,
         true,
         _refusals->>p.id::TEXT,
         church.kids_refusal_message(
           coalesce(p.preferred_name, p.first_name), _refusals->>p.id::TEXT),
         _states->>p.id::TEXT
  FROM church.people p WHERE _refusals ? p.id::TEXT

  ORDER BY 13, 9;
END;
$function$;


GRANT EXECUTE ON FUNCTION church.check_in_children(
  UUID, UUID[], UUID[], TEXT, TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
