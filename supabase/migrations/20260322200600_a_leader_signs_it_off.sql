-- =====================================================
-- A leader signs it off
-- =====================================================
--
-- The review side of incident reports. A teacher's account arrives; a Kids
-- Ministry admin reads it, asks the teacher questions if they need to, decides
-- how serious it is, and signs it off. Whether the family is told is a
-- separate, deliberate act - and for a safeguarding report it is not offered
-- at all.
--
-- THE ADMIN NEVER EDITS THE TEACHER. reported_narrative is immutable, enforced
-- by a trigger since 20260322200500. Everything the admin writes goes in
-- admin_summary, and what the family reads is frozen into parent_message at
-- send time. Three separate fields, because they answer three different
-- questions and a year from now somebody will need to know which was which.

-- ---------------------------------------------------------------------------
-- Audit actions and the kinds. All 24 and all 8 carried forward.
-- ---------------------------------------------------------------------------
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
    -- new at 20260322200600
    'incident_reviewed', 'incident_signed_off', 'incident_declined',
    'incident_external_report']));

ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind
  CHECK (kind IN (
    'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
    'kids_access_granted', 'kids_late_pickup', 'kids_check_in_held',
    'kids_hold_presented',
    -- new at 20260322200600: the leaders' alert that a report has arrived
    'kids_incident_raised'));

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_incident_queue(
  _organization_id UUID,
  _include_settled BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID, child_person_id UUID, child_name TEXT, room_name TEXT,
  occurred_on DATE, severity TEXT, status TEXT,
  reported_by_name TEXT, reported_at TIMESTAMPTZ,
  signed_off_by_name TEXT, signed_off_at TIMESTAMPTZ,
  external_report_made BOOLEAN,
  note_count BIGINT, age_hours NUMERIC,
  needs_reporting_answer BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  -- has_permission_in_org, not assert_kids_leader: the latter admits
  -- leadership_viewer, and this list carries safeguarding rows.
  IF NOT church.has_permission_in_org(
       _organization_id,
       ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.child_person_id,
    coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
    r.name, i.occurred_on, i.severity, i.status,
    i.reported_by_name, i.reported_at,
    i.signed_off_by_name, i.signed_off_at,
    i.external_report_made,
    (SELECT count(*) FROM church.kids_incident_notes n WHERE n.incident_id = i.id),
    round(EXTRACT(EPOCH FROM (now() - i.reported_at)) / 3600, 1),
    -- A safeguarding report sitting unanswered is the failure this feature
    -- exists to prevent, so the queue says so rather than waiting to be asked.
    (i.severity = 'safeguarding' AND i.external_report_made IS NULL)
  FROM church.kids_incidents i
  LEFT JOIN church.people p ON p.id = i.child_person_id
  LEFT JOIN public.rooms r ON r.id = i.room_id
  WHERE i.organization_id = _organization_id
    AND (_include_settled OR i.status IN ('submitted', 'under_review'))
  -- Unanswered safeguarding first, then severity, then oldest. A queue sorted
  -- newest-first buries exactly the report that has been waiting too long.
  ORDER BY
    (i.severity = 'safeguarding' AND i.external_report_made IS NULL) DESC,
    CASE i.severity WHEN 'safeguarding' THEN 1 WHEN 'injury' THEN 2 ELSE 3 END,
    i.reported_at
  LIMIT 300;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_incident_queue(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- Opening one. Audited, because it carries a child's medical detail.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_incident_detail(_incident_id UUID)
RETURNS TABLE (
  id UUID, child_person_id UUID, child_name TEXT, room_name TEXT,
  occurred_on DATE, severity TEXT, status TEXT,
  reported_narrative TEXT, reported_by_name TEXT, reported_at TIMESTAMPTZ,
  admin_summary TEXT, signed_off_by_name TEXT, signed_off_at TIMESTAMPTZ,
  decline_reason TEXT, parent_message TEXT, sent_at TIMESTAMPTZ,
  external_report_made BOOLEAN, external_report_reference TEXT,
  external_reported_at TIMESTAMPTZ, external_report_note TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE i church.kids_incidents%ROWTYPE; _actor TEXT; _may BOOLEAN;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE kids_incidents.id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;

  _may := (i.reported_by = auth.uid())
          OR church.has_permission_in_org(
               i.organization_id,
               ARRAY['kids_admin','kids_leader']::church.module_permission[]);
  IF NOT _may THEN RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501'; END IF;

  SELECT coalesce(full_name, 'Kids Ministry') INTO _actor
    FROM public.profiles WHERE profiles.id = auth.uid();

  -- Written on the DETAIL read only. The queue returns no narrative, so
  -- working through the list does not produce three hundred audit rows.
  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (i.organization_id, 'sensitive_viewed', 'success', i.child_person_id,
          auth.uid(), coalesce(_actor, 'Kids Ministry'),
          jsonb_build_object('record', 'incident', 'incident_id', _incident_id,
                             'severity', i.severity));

  RETURN QUERY
  SELECT i.id, i.child_person_id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         r.name, i.occurred_on, i.severity, i.status,
         i.reported_narrative, i.reported_by_name, i.reported_at,
         i.admin_summary, i.signed_off_by_name, i.signed_off_at,
         i.decline_reason, i.parent_message, i.sent_at,
         i.external_report_made, i.external_report_reference,
         i.external_reported_at, i.external_report_note
  FROM (SELECT _incident_id AS iid) anchor
  LEFT JOIN church.people p ON p.id = i.child_person_id
  LEFT JOIN public.rooms r ON r.id = i.room_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_incident_detail(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- A small helper: the admin gate, stated once
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.assert_kids_incident_admin(_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id,
       ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Reviewing an incident report is a Kids Ministry leader action.';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Picking one up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_review_incident(_incident_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE i church.kids_incidents%ROWTYPE; _actor TEXT;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  PERFORM church.assert_kids_incident_admin(i.organization_id);

  IF i.status <> 'submitted' THEN RETURN false; END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();

  UPDATE church.kids_incidents SET status = 'under_review' WHERE id = _incident_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (i.organization_id, 'incident_reviewed', 'success', i.child_person_id,
          auth.uid(), coalesce(_actor, 'A Kids Ministry leader'),
          jsonb_build_object('incident_id', _incident_id));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_review_incident(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Raising the severity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_set_incident_severity(
  _incident_id UUID, _severity TEXT, _why TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE i church.kids_incidents%ROWTYPE; _actor TEXT;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  PERFORM church.assert_kids_incident_admin(i.organization_id);

  IF _severity NOT IN ('behaviour', 'injury', 'safeguarding') THEN
    RAISE EXCEPTION 'invalid_severity';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();

  -- The trigger refuses a downgrade; this is where the audit row is written so
  -- that "who raised this to safeguarding, and when" has an answer.
  UPDATE church.kids_incidents
     SET severity = _severity,
         -- Once it is a safeguarding matter it is held from any purge.
         legal_hold = legal_hold OR _severity = 'safeguarding'
   WHERE id = _incident_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (i.organization_id, 'incident_severity_changed', 'success',
          i.child_person_id, auth.uid(), coalesce(_actor, 'A Kids Ministry leader'),
          jsonb_build_object('incident_id', _incident_id,
                             'from', i.severity, 'to', _severity, 'why', _why));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_set_incident_severity(UUID, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Answering the reporting question
-- ---------------------------------------------------------------------------
--
-- The software never reports to anybody on the church's behalf and never
-- claims to. This records whether a HUMAN did, so the church can show it took
-- the concern seriously. 'no' is a permitted answer and needs a reason;
-- silence is not an answer, and the CHECK on the table blocks sign-off until
-- this is filled in for a safeguarding report.
CREATE OR REPLACE FUNCTION church.kids_record_external_report(
  _incident_id UUID,
  _made BOOLEAN,
  _reference TEXT DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE i church.kids_incidents%ROWTYPE; _actor TEXT;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  PERFORM church.assert_kids_incident_admin(i.organization_id);

  IF _made IS NULL THEN RAISE EXCEPTION 'answer_required'; END IF;
  IF NOT _made AND length(btrim(coalesce(_note, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_required'
      USING HINT = 'Say why it was not reported. Somebody may read this back.';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();

  UPDATE church.kids_incidents
     SET external_report_made = _made,
         external_report_reference = nullif(btrim(coalesce(_reference, '')), ''),
         external_reported_at = CASE WHEN _made THEN now() ELSE NULL END,
         external_report_note = nullif(btrim(coalesce(_note, '')), '')
   WHERE id = _incident_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (i.organization_id, 'incident_external_report', 'success',
          i.child_person_id, auth.uid(), coalesce(_actor, 'A Kids Ministry leader'),
          jsonb_build_object('incident_id', _incident_id, 'reported', _made,
                             'reference', _reference));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_record_external_report(UUID, BOOLEAN, TEXT, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Signing off, and declining
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_sign_off_incident(
  _incident_id UUID,
  _admin_summary TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE i church.kids_incidents%ROWTYPE; _actor TEXT;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  PERFORM church.assert_kids_incident_admin(i.organization_id);

  IF i.status IN ('signed_off', 'sent', 'declined') THEN
    RAISE EXCEPTION 'already_settled';
  END IF;

  -- Named explicitly rather than left to the table CHECK, so the admin gets a
  -- sentence they can act on instead of a constraint violation.
  IF i.severity = 'safeguarding' AND i.external_report_made IS NULL THEN
    RAISE EXCEPTION 'reporting_answer_required'
      USING HINT = 'Record whether this was reported to the authorities first. '
                   '"No" is a valid answer; leaving it blank is not.';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();

  UPDATE church.kids_incidents
     SET status = 'signed_off',
         admin_summary = nullif(btrim(coalesce(_admin_summary, '')), ''),
         signed_off_by = auth.uid(),
         signed_off_by_name = coalesce(_actor, 'A Kids Ministry leader'),
         signed_off_at = now()
   WHERE id = _incident_id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (i.organization_id, 'incident_signed_off', 'success', i.child_person_id,
          auth.uid(), coalesce(_actor, 'A Kids Ministry leader'),
          jsonb_build_object('incident_id', _incident_id,
                             'severity', i.severity,
                             'has_admin_summary',
                             length(btrim(coalesce(_admin_summary, ''))) > 0));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_sign_off_incident(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION church.kids_decline_incident(
  _incident_id UUID, _reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE i church.kids_incidents%ROWTYPE; _actor TEXT;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  PERFORM church.assert_kids_incident_admin(i.organization_id);

  IF i.status IN ('signed_off', 'sent', 'declined') THEN
    RAISE EXCEPTION 'already_settled';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required'
      USING HINT = 'The teacher who wrote this will read the reason.';
  END IF;

  -- A safeguarding report is not something to wave away. It can be declined,
  -- but only once somebody has answered the reporting question - the same bar
  -- as signing one off.
  IF i.severity = 'safeguarding' AND i.external_report_made IS NULL THEN
    RAISE EXCEPTION 'reporting_answer_required';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();

  UPDATE church.kids_incidents
     SET status = 'declined', decline_reason = btrim(_reason),
         signed_off_by = auth.uid(),
         signed_off_by_name = coalesce(_actor, 'A Kids Ministry leader'),
         signed_off_at = now()
   WHERE id = _incident_id;

  -- The teacher is told through kids_my_incidents, which returns
  -- decline_reason. No email: a volunteer who wrote a report gets an answer
  -- where they wrote it, not in their inbox.
  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (i.organization_id, 'incident_declined', 'success', i.child_person_id,
          auth.uid(), coalesce(_actor, 'A Kids Ministry leader'),
          jsonb_build_object('incident_id', _incident_id, 'reason', btrim(_reason)));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_decline_incident(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- The leaders hear that a report has arrived
-- ---------------------------------------------------------------------------
--
-- Immediately for injury and safeguarding. A behaviour note can wait for
-- somebody to open the queue; a child who was hurt cannot.
CREATE OR REPLACE FUNCTION church.kids_notify_incident_raised(_incident_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE i church.kids_incidents%ROWTYPE; _child TEXT; _n INTEGER := 0;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF i.severity NOT IN ('injury', 'safeguarding') THEN RETURN 0; END IF;

  SELECT coalesce(p.preferred_name, p.first_name) INTO _child
    FROM church.people p WHERE p.id = i.child_person_id;

  INSERT INTO church.notification_log
    (organization_id, kind, channel, recipient_name, recipient_email,
     child_person_id, subject, body)
  SELECT i.organization_id, 'kids_incident_raised', 'email',
         t.full_name, t.email, i.child_person_id,
         CASE i.severity
           WHEN 'safeguarding' THEN 'A safeguarding report needs a leader today'
           ELSE 'An injury was reported in a classroom'
         END,
         coalesce(i.reported_by_name, 'A teacher') || ' has reported '
         || CASE i.severity WHEN 'safeguarding' THEN 'a safeguarding concern'
                            ELSE 'an injury' END
         || ' involving ' || coalesce(_child, 'a child') || ', from '
         || to_char(i.occurred_on, 'FMDay FMDD FMMonth') || '.' || E'\n\n'
         || CASE WHEN i.severity = 'safeguarding' THEN
              'Please open it today rather than at the next review. If you '
              || 'believe a child has been harmed or is at risk, reporting to '
              || 'the authorities is not something this system does for you, '
              || 'and it is not something you need permission for.' || E'\n\n'
              || 'The report cannot be signed off until somebody records '
              || 'whether it was reported. "No" is a valid answer.'
            ELSE
              'Please open it and decide whether the family should be told. '
              || 'For an injury they normally should be.'
            END || E'\n\n'
         || 'The account itself is in the Kids Ministry incident queue. It is '
         || 'deliberately not repeated in this email.'
  FROM church.kids_leaders_to_notify(i.organization_id) t
  WHERE t.email IS NOT NULL;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_notify_incident_raised(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_notify_incident_raised(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Raising a report now alerts the leaders for the two severities that cannot
-- wait. Otherwise unchanged from 20260322200500.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_raise_incident(
  _child_person_id UUID,
  _occurred_on DATE,
  _severity TEXT,
  _narrative TEXT,
  _kids_session_id UUID DEFAULT NULL,
  _room_id UUID DEFAULT NULL,
  _check_in_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a  church.resolved_actor;
  _id UUID;
  _org UUID;
BEGIN
  a := church.resolve_actor(NULL);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT p.organization_id INTO _org
  FROM church.people p
  WHERE p.id = _child_person_id AND p.is_child AND p.organization_id = a.organization_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'child_not_found'; END IF;

  IF _severity NOT IN ('behaviour', 'injury', 'safeguarding') THEN
    RAISE EXCEPTION 'invalid_severity';
  END IF;
  IF length(btrim(coalesce(_narrative, ''))) < 20 THEN
    RAISE EXCEPTION 'narrative_too_short'
      USING HINT = 'Say what happened. Somebody may read this back in a year.';
  END IF;
  IF _occurred_on IS NULL OR _occurred_on > current_date THEN
    RAISE EXCEPTION 'invalid_date';
  END IF;

  INSERT INTO church.kids_incidents
    (organization_id, child_person_id, kids_session_id, room_id, check_in_id,
     occurred_on, severity, reported_narrative, reported_by,
     reported_by_person_id, reported_by_name,
     -- A safeguarding row is held from any retention purge from the moment it
     -- is written, without anybody having to remember to set it.
     legal_hold)
  VALUES (_org, _child_person_id, _kids_session_id, _room_id, _check_in_id,
          _occurred_on, _severity, btrim(_narrative), auth.uid(),
          a.person_id, a.actor_name,
          _severity = 'safeguarding')
  RETURNING id INTO _id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, kids_session_id, child_person_id,
     room_id, actor_auth_user_id, actor_name, detail)
  VALUES (_org, 'incident_raised', 'success', _kids_session_id, _child_person_id,
          _room_id, auth.uid(), a.actor_name,
          jsonb_build_object('incident_id', _id, 'severity', _severity));

  -- The leaders hear about an injury or a safeguarding concern immediately,
  -- rather than whenever somebody next opens the queue. Never raises: a
  -- failed notification must not lose the report itself.
  BEGIN
    PERFORM church.kids_notify_incident_raised(_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kids_notify_incident_raised failed for %: %', _id, SQLERRM;
  END;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_raise_incident(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
