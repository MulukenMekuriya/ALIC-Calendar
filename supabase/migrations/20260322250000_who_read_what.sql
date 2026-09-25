-- =====================================================
-- Who read what
-- =====================================================
--
-- church.station_child_safety_card has written a `sensitive_viewed` audit row
-- on every call since 20260320011300. The consent PDF, the incident detail
-- and the kiosk prefill now do the same. Nothing has ever displayed one.
--
-- AN AUDIT TRAIL NOBODY CAN READ IS A PROMISE, NOT A CONTROL. This makes it
-- readable, makes it provably append-only, and presents it as a summary
-- rather than a list - because a thousand undifferentiated rows is the same
-- as no answer.
--
-- ---------------------------------------------------------------------------
-- 1. APPEND-ONLY, ENFORCED
-- ---------------------------------------------------------------------------
--
-- service_role held UPDATE and DELETE on check_in_audit. Nothing used them,
-- but the edge functions run as service_role, so an audit trail describing
-- who read a child's medical record could be silently rewritten by the same
-- credential that writes it. That is not an audit trail; it is a log.
--
-- Both are revoked, and a trigger raises on either - belt and braces, because
-- a GRANT can be restored by anyone who can grant, while a trigger has to be
-- disabled, which is itself a deliberate and visible act.
--
-- ---------------------------------------------------------------------------
-- 2. READING THE LOG IS RECORDED
-- ---------------------------------------------------------------------------
--
-- "Who looked at the access log" is a real safeguarding question, and a
-- control that exempts itself is not a control. It is recorded as
-- `access_log_read` rather than `sensitive_viewed`, deliberately: reusing the
-- latter would put reads of the report INTO the report, and by next month the
-- signal would be mostly people checking the signal.
--
-- ---------------------------------------------------------------------------
-- 3. SUMMARY BEFORE DETAIL, AND BREADTH IS THE SIGNAL
-- ---------------------------------------------------------------------------
--
-- The thing worth noticing is not that somebody opened forty safety cards. It
-- is that somebody opened forty DIFFERENT CHILDREN'S safety cards. One
-- volunteer re-reading one child's allergy card all morning is a volunteer
-- doing their job; one person reading across forty families is a question.
-- So the summary counts distinct children and orders by it, and the screen
-- puts that column first.

-- ---------------------------------------------------------------------------
-- Append-only
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON church.check_in_audit FROM service_role;

CREATE OR REPLACE FUNCTION church.check_in_audit_is_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = church, public
AS $$
BEGIN
  RAISE EXCEPTION 'check_in_audit is append only'
    USING HINT = 'An audit row that can be changed is not an audit row. If a '
                 'row is wrong, the correction is another row.';
END;
$$;

DROP TRIGGER IF EXISTS trg_check_in_audit_append_only ON church.check_in_audit;
CREATE TRIGGER trg_check_in_audit_append_only
  BEFORE UPDATE OR DELETE ON church.check_in_audit
  FOR EACH ROW EXECUTE FUNCTION church.check_in_audit_is_append_only();

COMMENT ON TABLE church.check_in_audit IS
  'Append only, enforced by trigger as well as by grants. Rows here outlive '
  'the records they describe - a purge of children''s records leaves its own '
  'audit row behind, and that row is the only remaining evidence that the '
  'purge happened.';

-- ---------------------------------------------------------------------------
-- Who read what, per person
-- ---------------------------------------------------------------------------
--
-- The control. Detail is available below, but this is what somebody actually
-- looks at, and it is ordered by the number of distinct children rather than
-- by the number of reads.
CREATE OR REPLACE FUNCTION church.kids_sensitive_access_summary(
  _organization_id UUID,
  _from DATE,
  _to   DATE
)
RETURNS TABLE (
  actor_name       TEXT,
  actor_auth_user_id UUID,
  reads            INTEGER,
  children_seen    INTEGER,
  record_types     TEXT[],
  first_read       TIMESTAMPTZ,
  last_read        TIMESTAMPTZ,
  /* Reads of children this person has no obvious connection to. Not an
     accusation and not a block - a leader legitimately reads across the whole
     ministry. It is the column that makes the list worth scanning. */
  on_days          INTEGER
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
#variable_conflict use_column
DECLARE _reader TEXT;
BEGIN
  -- kids_admin only. Reading who read what is itself a sensitive act, and a
  -- read-only reporting role is not a safeguarding role.
  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Reading the access log is a Kids Ministry admin action.';
  END IF;

  _reader := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Someone');

  -- A control that exempts itself is not a control. Recorded as
  -- access_log_read, NOT sensitive_viewed: reusing the latter would put reads
  -- of this report into this report.
  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_organization_id, 'access_log_read', 'success', auth.uid(), _reader,
          jsonb_build_object('from', _from, 'to', _to, 'view', 'summary'));

  RETURN QUERY
  SELECT coalesce(au.actor_name, 'Unknown'),
         au.actor_auth_user_id,
         count(*)::INTEGER,
         count(DISTINCT au.child_person_id)::INTEGER,
         array_agg(DISTINCT coalesce(au.detail->>'record', 'safety_card')),
         min(au.created_at),
         max(au.created_at),
         count(DISTINCT au.created_at::DATE)::INTEGER
  FROM church.check_in_audit au
  WHERE au.organization_id = _organization_id
    AND au.action = 'sensitive_viewed'
    AND au.created_at >= _from::TIMESTAMPTZ
    AND au.created_at < (_to + 1)::TIMESTAMPTZ
  GROUP BY coalesce(au.actor_name, 'Unknown'), au.actor_auth_user_id
  -- Breadth first. One volunteer re-reading one child's card all morning is
  -- a volunteer doing their job; one person reading across forty families is
  -- a question.
  ORDER BY count(DISTINCT au.child_person_id) DESC, count(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_sensitive_access_summary(UUID, DATE, DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- The detail behind one line of it
-- ---------------------------------------------------------------------------
--
-- Replaces the version from 20260322210600, which returned an undifferentiated
-- list of a thousand rows and took no filters. Same audit rows, but reachable
-- by person and by child, so a question that starts "why did X open..." can
-- actually be answered.
DROP FUNCTION IF EXISTS church.kids_sensitive_access_report(UUID, DATE, DATE);

CREATE FUNCTION church.kids_sensitive_access_report(
  _organization_id UUID,
  _from DATE,
  _to   DATE,
  _actor_auth_user_id UUID DEFAULT NULL,
  _child_person_id    UUID DEFAULT NULL,
  _record_type        TEXT DEFAULT NULL
)
RETURNS TABLE (
  viewed_at  TIMESTAMPTZ,
  actor_name TEXT,
  record     TEXT,
  child_name TEXT,
  detail     JSONB
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
#variable_conflict use_column
DECLARE _reader TEXT;
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Reading the access log is a Kids Ministry admin action.';
  END IF;

  _reader := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Someone');

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name,
    child_person_id, detail)
  VALUES (_organization_id, 'access_log_read', 'success', auth.uid(), _reader,
          _child_person_id,
          jsonb_build_object('from', _from, 'to', _to, 'view', 'detail',
                             'about_actor', _actor_auth_user_id));

  RETURN QUERY
  SELECT au.created_at,
         coalesce(au.actor_name, 'Unknown'),
         coalesce(au.detail->>'record', 'safety_card'),
         CASE WHEN p.id IS NOT NULL
              THEN coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name END,
         au.detail
  FROM church.check_in_audit au
  LEFT JOIN church.people p ON p.id = au.child_person_id
  WHERE au.organization_id = _organization_id
    AND au.action = 'sensitive_viewed'
    AND au.created_at >= _from::TIMESTAMPTZ
    AND au.created_at < (_to + 1)::TIMESTAMPTZ
    AND (_actor_auth_user_id IS NULL OR au.actor_auth_user_id = _actor_auth_user_id)
    AND (_child_person_id IS NULL OR au.child_person_id = _child_person_id)
    AND (_record_type IS NULL
         OR coalesce(au.detail->>'record', 'safety_card') = _record_type)
  ORDER BY au.created_at DESC
  LIMIT 2000;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_sensitive_access_report(
  UUID, DATE, DATE, UUID, UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Everything a child's record has ever shown anybody
-- ---------------------------------------------------------------------------
--
-- The other direction, and the one a parent's question actually takes: "who
-- has seen my child's medical information?" A ministry that cannot answer
-- that has an audit trail for its own benefit rather than the family's.
CREATE OR REPLACE FUNCTION church.kids_child_access_history(_child_person_id UUID)
RETURNS TABLE (
  viewed_at  TIMESTAMPTZ,
  actor_name TEXT,
  record     TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
#variable_conflict use_column
DECLARE _org UUID; _reader TEXT;
BEGIN
  SELECT organization_id INTO _org FROM church.people WHERE id = _child_person_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'child_not_found'; END IF;

  IF NOT church.has_permission_in_org(
           _org, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _reader := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Someone');

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name,
    child_person_id, detail)
  VALUES (_org, 'access_log_read', 'success', auth.uid(), _reader,
          _child_person_id, jsonb_build_object('view', 'child_history'));

  RETURN QUERY
  SELECT au.created_at,
         coalesce(au.actor_name, 'Unknown'),
         coalesce(au.detail->>'record', 'safety_card')
  FROM church.check_in_audit au
  WHERE au.child_person_id = _child_person_id
    AND au.action = 'sensitive_viewed'
  ORDER BY au.created_at DESC
  LIMIT 500;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_child_access_history(UUID) TO authenticated;

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
    'incident_external_report', 'incident_sent',
    'consent_signed', 'consent_revoked', 'consent_child_withdrawn',
    'consent_reviewed', 'medical_updated', 'consent_exception',
    'kiosk_search_miss', 'records_purged', 'legal_hold_changed',
    -- new at 20260322250000
    'access_log_read']));

NOTIFY pgrst, 'reload schema';
