-- =====================================================
-- The family hears it from the church
-- =====================================================
--
-- A signed-off incident report can be sent to the child's parents. It is a
-- separate, deliberate act after sign-off, never automatic, and the leader
-- chooses what the family reads.
--
-- A SAFEGUARDING REPORT IS NEVER SENT. Not gated, not permissioned - the
-- action does not exist for it. In a safeguarding concern the parent may BE
-- the concern, and a button that can be pressed wrongly eventually will be.
-- The table CHECK from 20260322200500 already blocks sent_at on a safeguarding
-- row; this function refuses before it gets that far so the leader reads a
-- sentence rather than a constraint violation.
--
-- WHAT THE FAMILY READS, and why it is a choice. Three options:
--
--   'admin'  - the leader's own summary. The usual choice for a behaviour
--              note: measured, already thought about.
--   'teacher'- the teacher's account verbatim. Right when the detail matters
--              and the leader has nothing to add.
--   'both'   - the account, then the leader's note.
--
-- Whichever is chosen is FROZEN into parent_message at send time, so the email
-- and any later record cannot drift apart, and so "what were they actually
-- told" has one answer.
--
-- THE TEACHER'S NAME IS NOT IN IT. Naming the volunteer who wrote a report to
-- an unhappy parent is how a church loses volunteers. The name is on the
-- record, for leaders.

ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS check_in_audit_action_check;
ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS chk_check_in_audit_action;
ALTER TABLE church.check_in_audit ADD CONSTRAINT chk_check_in_audit_action
  CHECK (action = ANY (ARRAY[
    'check_in', 'check_out', 'transfer', 'code_failed', 'override',
    'sensitive_viewed', 'restricted_pickup_attempt', 'restricted_pickup_override',
    'pin_failed', 'auto_expired', 'label_reprint', 'shift_opened', 'shift_closed',
    'visitor_registered',
    'late_pickup_recorded', 'late_pickup_notified', 'late_pickup_dismissed',
    'hold_raised', 'hold_lifted', 'hold_settled', 'check_in_held',
    'incident_raised', 'incident_noted', 'incident_severity_changed',
    'incident_reviewed', 'incident_signed_off', 'incident_declined',
    'incident_external_report',
    -- new at 20260322200700
    'incident_sent']));

ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind
  CHECK (kind IN (
    'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
    'kids_access_granted', 'kids_late_pickup', 'kids_check_in_held',
    'kids_hold_presented', 'kids_incident_raised',
    -- new at 20260322200700
    'kids_incident_to_parent'));

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

  -- Reuses the whole pipeline: consent, household resolution, the guardian
  -- fallback, and the trigger that wakes the sender. check_in_id may be NULL
  -- on a report raised away from the desk, in which case there is nobody
  -- resolvable and the send is refused rather than silently doing nothing.
  IF i.check_in_id IS NULL THEN
    RAISE EXCEPTION 'no_check_in_to_resolve_family'
      USING HINT = 'This report is not tied to a check-in, so the desk cannot '
                   'work out who to write to. Speak with the family directly.';
  END IF;

  SELECT church.queue_child_notification(
           'kids_incident_to_parent', i.check_in_id, _body, _subj, 'email',
           NULL, _actor)
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
                             'source', _source, 'recipients', _n));

  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_send_incident_to_parent(UUID, TEXT)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
