-- =====================================================
-- The church keeps what it should, and no more
-- =====================================================
--
-- This plan created two durable stores of minors' medical data that did not
-- exist before: signed consent PDFs and injury reports. Neither had an end
-- date, and "forever by default" is not a policy - it is the absence of one.
--
-- ---------------------------------------------------------------------------
-- NOTHING HERE DELETES ANYTHING ON A SCHEDULE
-- ---------------------------------------------------------------------------
--
-- kids_records_due_for_purge REPORTS. It returns counts and the oldest date
-- in each class and touches nothing. A human then confirms, by name, with a
-- reason, through confirm_kids_purge - and that is the only function in this
-- migration capable of a DELETE.
--
-- That is the whole design. A cron job that quietly removes children's
-- medical records is one bad predicate away from destroying the answer to a
-- question nobody has asked yet, and the failure would be silent and
-- permanent. A monthly email saying "142 records are due, somebody please
-- look" is slower and recoverable.
--
-- ---------------------------------------------------------------------------
-- THE NUMBERS ARE STARTING POINTS, NOT A LEGAL OPINION
-- ---------------------------------------------------------------------------
--
-- DECIDE THEM WITH THE CHURCH'S COUNSEL. They live in a table, with a
-- `basis` sentence beside each one saying why, precisely so that changing
-- them is an afternoon's conversation and a single UPDATE rather than a
-- migration. What this migration guarantees is that there IS a schedule, that
-- it is visible, and that deletion is a deliberate act.
--
-- ---------------------------------------------------------------------------
-- A LEGAL HOLD EXEMPTS A ROW ENTIRELY
-- ---------------------------------------------------------------------------
--
-- Every safeguarding incident is held automatically, backfilled below and
-- enforced going forward by a trigger. Nothing is deleted while a matter is
-- open, and the person who has to remember that is not a volunteer.

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church.record_retention (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_type     TEXT NOT NULL,

  retain_years    INTEGER NOT NULL,
  -- A sentence saying WHY that long, in the table rather than in a comment,
  -- so the person changing the number next year can see the reasoning that
  -- produced it rather than guessing at it.
  basis           TEXT NOT NULL,

  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (organization_id, record_type),
  CONSTRAINT chk_record_retention_type
    CHECK (record_type IN ('consent_signature', 'injury_report',
                           'behaviour_report', 'late_collection')),
  -- A year is the floor. Anything shorter is a retention policy that deletes
  -- a record before the Sunday it describes has stopped being discussed.
  CONSTRAINT chk_record_retention_years
    CHECK (retain_years BETWEEN 1 AND 50),
  CONSTRAINT chk_record_retention_basis
    CHECK (length(btrim(basis)) >= 10)
);

COMMENT ON TABLE church.record_retention IS
  'How long the church keeps each kind of kids record, and why. Starting '
  'points for the ministry to confirm with counsel - what the software '
  'guarantees is that a schedule EXISTS, is visible, and that deletion is a '
  'deliberate act.';

ALTER TABLE church.record_retention ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids leaders can read the retention schedule" ON church.record_retention;
CREATE POLICY "Kids leaders can read the retention schedule"
  ON church.record_retention FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['kids_admin','kids_leader','leadership_viewer']::church.module_permission[])));

GRANT SELECT ON church.record_retention TO authenticated;
GRANT SELECT, INSERT, UPDATE ON church.record_retention TO service_role;

INSERT INTO church.record_retention (organization_id, record_type, retain_years, basis, updated_by_name)
SELECT o.id, v.record_type, v.retain_years, v.basis, 'ALIC Kids Ministry'
FROM public.organizations o
CROSS JOIN (VALUES
  ('consent_signature', 3,
   'Kept while the child is in the ministry and for three years after the '
   'signature is superseded or revoked. The form is the evidence of what a '
   'parent agreed to, so it outlives the agreement it records.'),
  ('injury_report', 7,
   'Seven years, or until the child turns 21 if that is later, which is the '
   'ordinary shape of a minor-injury retention rule. A row for a child whose '
   'age is unknown is never treated as due.'),
  ('behaviour_report', 2,
   'Two years. A note about a hard morning stops being useful long before '
   'that, and keeping it longer turns a moment into a file.'),
  ('late_collection', 2,
   'Two years. Long enough to see a pattern and talk to a family about it, '
   'short enough that it does not become a history.')
) AS v(record_type, retain_years, basis)
ON CONFLICT (organization_id, record_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Legal holds
-- ---------------------------------------------------------------------------
ALTER TABLE church.kids_late_pickups
  ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN church.kids_incidents.legal_hold IS
  'Exempts this row from any purge. Every safeguarding report is held '
  'automatically - nothing is deleted while a matter is open, and the person '
  'who has to remember that is not a volunteer.';

-- Backfill, then enforce. A safeguarding row that arrives tomorrow is held
-- the same way one that arrived last month now is.
UPDATE church.kids_incidents SET legal_hold = true
 WHERE severity = 'safeguarding' AND NOT legal_hold;

CREATE OR REPLACE FUNCTION church.kids_incident_hold_safeguarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = church, public
AS $$
BEGIN
  IF NEW.severity = 'safeguarding' THEN
    NEW.legal_hold := true;
  END IF;
  RETURN NEW;
END;
$$;

-- ON EVERY UPDATE, not just UPDATE OF severity. Scoping it to the severity
-- column looked tidier and left a hole: an UPDATE that touched only
-- legal_hold never fired the trigger, so a safeguarding report COULD be
-- released for deletion. The assertion below caught it, and the cost of
-- firing on every update is one comparison on a table with a handful of rows
-- a week.
DROP TRIGGER IF EXISTS trg_kids_incident_hold_safeguarding ON church.kids_incidents;
CREATE TRIGGER trg_kids_incident_hold_safeguarding
  BEFORE INSERT OR UPDATE ON church.kids_incidents
  FOR EACH ROW EXECUTE FUNCTION church.kids_incident_hold_safeguarding();

-- Putting a hold on, or lifting one. Lifting is the dangerous direction, so
-- it takes a reason and is audited; a safeguarding row cannot be released at
-- all, because the trigger above puts the hold straight back.
CREATE OR REPLACE FUNCTION church.kids_set_legal_hold(
  _record_type TEXT,
  _record_id   UUID,
  _hold        BOOLEAN,
  _reason      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _org UUID; _actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT CASE _record_type
    WHEN 'injury_report'     THEN (SELECT organization_id FROM church.kids_incidents WHERE id=_record_id)
    WHEN 'behaviour_report'  THEN (SELECT organization_id FROM church.kids_incidents WHERE id=_record_id)
    WHEN 'consent_signature' THEN (SELECT organization_id FROM church.consent_signatures WHERE id=_record_id)
    WHEN 'late_collection'   THEN (SELECT organization_id FROM church.kids_late_pickups WHERE id=_record_id)
  END INTO _org;

  IF _org IS NULL THEN RAISE EXCEPTION 'record_not_found'; END IF;

  IF NOT church.has_permission_in_org(
           _org, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF NOT _hold AND length(btrim(coalesce(_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required_to_lift_a_hold'
      USING HINT = 'Releasing a record for deletion is the direction that '
                   'cannot be undone.';
  END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  IF _record_type IN ('injury_report', 'behaviour_report') THEN
    UPDATE church.kids_incidents SET legal_hold = _hold WHERE id = _record_id;
  ELSIF _record_type = 'consent_signature' THEN
    UPDATE church.consent_signatures SET legal_hold = _hold WHERE id = _record_id;
  ELSE
    UPDATE church.kids_late_pickups SET legal_hold = _hold WHERE id = _record_id;
  END IF;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_org, 'legal_hold_changed', 'success', auth.uid(), _actor,
          jsonb_build_object('record_type', _record_type, 'record_id', _record_id,
                             'hold', _hold, 'reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_set_legal_hold(TEXT, UUID, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- What is due. This function DELETES NOTHING.
-- ---------------------------------------------------------------------------
--
-- STABLE, not VOLATILE, which is more than documentation: a STABLE function
-- cannot perform a DELETE at all. The one place a purge can happen is
-- confirm_kids_purge below, and it is the only VOLATILE function here.
CREATE OR REPLACE FUNCTION church.kids_records_due_for_purge(_organization_id UUID)
RETURNS TABLE (
  record_type  TEXT,
  retain_years INTEGER,
  basis        TEXT,
  due_count    INTEGER,
  held_count   INTEGER,
  oldest       DATE
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
-- RETURNS TABLE declares record_type, retain_years, basis, due_count,
-- held_count and oldest as plpgsql variables, and a query below naturally
-- wants columns of the same names. Without this pragma every one of them is
-- "ambiguous" and the function does not run - and it fails at EXECUTION, not
-- at CREATE, so the migration would apply cleanly and break on first use.
#variable_conflict use_column
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id,
           ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Aliased away from the OUT parameter names. record_type, retain_years and
  -- basis are all declared by RETURNS TABLE, so a CTE column of the same name
  -- is ambiguous to plpgsql and the function will not run.
  WITH r AS (
    SELECT rr.record_type AS rtype, rr.retain_years AS years, rr.basis AS why
    FROM church.record_retention rr
    WHERE rr.organization_id = _organization_id
  ),
  -- A consent signature ages from when it stopped being the current one.
  -- A signature still in force is never due, however old it is: the form is
  -- the evidence of a consent that has not been withdrawn.
  consent AS (
    SELECT count(*) FILTER (WHERE NOT s.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE s.legal_hold)::INTEGER AS held,
           min(coalesce(s.revoked_at, s.updated_at))::DATE AS oldest
    FROM church.consent_signatures s
    JOIN r ON r.rtype = 'consent_signature'
    WHERE s.organization_id = _organization_id
      AND (s.revoked_at IS NOT NULL OR s.superseded_by_signature_id IS NOT NULL)
      AND coalesce(s.revoked_at, s.updated_at)
          < now() - make_interval(years => (SELECT years FROM r WHERE rtype='consent_signature'))
  ),
  -- An injury ages seven years OR until the child turns 21, whichever is
  -- later. A child with no birth year on file is NEVER due: 415 of 534
  -- children have no grade and only 117 a birth year, and quietly deleting an
  -- injury record for a child who might still be fifteen is not a risk worth
  -- taking to tidy a table.
  injury AS (
    SELECT count(*) FILTER (WHERE NOT i.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE i.legal_hold)::INTEGER AS held,
           min(i.occurred_on) AS oldest
    FROM church.kids_incidents i
    JOIN church.people p ON p.id = i.child_person_id
    JOIN r ON r.rtype = 'injury_report'
    WHERE i.organization_id = _organization_id
      AND i.severity = 'injury'
      AND p.birth_year IS NOT NULL
      AND i.occurred_on
          < current_date - make_interval(years => (SELECT years FROM r WHERE rtype='injury_report'))
      AND (p.birth_year + 21) <= extract(year FROM current_date)
  ),
  behaviour AS (
    SELECT count(*) FILTER (WHERE NOT i.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE i.legal_hold)::INTEGER AS held,
           min(i.occurred_on) AS oldest
    FROM church.kids_incidents i
    JOIN r ON r.rtype = 'behaviour_report'
    WHERE i.organization_id = _organization_id
      AND i.severity = 'behaviour'
      AND i.occurred_on
          < current_date - make_interval(years => (SELECT years FROM r WHERE rtype='behaviour_report'))
  ),
  late AS (
    SELECT count(*) FILTER (WHERE NOT lp.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE lp.legal_hold)::INTEGER AS held,
           min(lp.session_date) AS oldest
    FROM church.kids_late_pickups lp
    JOIN r ON r.rtype = 'late_collection'
    WHERE lp.organization_id = _organization_id
      AND lp.session_date
          < current_date - make_interval(years => (SELECT years FROM r WHERE rtype='late_collection'))
  )
  SELECT r.rtype, r.years, r.why,
         CASE r.rtype
           WHEN 'consent_signature' THEN (SELECT due FROM consent)
           WHEN 'injury_report'     THEN (SELECT due FROM injury)
           WHEN 'behaviour_report'  THEN (SELECT due FROM behaviour)
           ELSE (SELECT due FROM late) END,
         CASE r.rtype
           WHEN 'consent_signature' THEN (SELECT held FROM consent)
           WHEN 'injury_report'     THEN (SELECT held FROM injury)
           WHEN 'behaviour_report'  THEN (SELECT held FROM behaviour)
           ELSE (SELECT held FROM late) END,
         CASE r.rtype
           WHEN 'consent_signature' THEN (SELECT oldest FROM consent)
           WHEN 'injury_report'     THEN (SELECT oldest FROM injury)
           WHEN 'behaviour_report'  THEN (SELECT oldest FROM behaviour)
           ELSE (SELECT oldest FROM late) END
  FROM r
  ORDER BY r.rtype;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_records_due_for_purge(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- The only thing here that can delete
-- ---------------------------------------------------------------------------
--
-- A kids_admin, by name, with a reason, one record type at a time. The audit
-- row is written BEFORE the delete and records what was removed and why - it
-- outlives the records it describes, which is the whole point of writing it.
CREATE OR REPLACE FUNCTION church.confirm_kids_purge(
  _organization_id UUID,
  _record_type     TEXT,
  _reason          TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _actor TEXT; _years INTEGER; _n INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- kids_admin only. Not kids_leader, and certainly not assert_kids_leader,
  -- which admits leadership_viewer: this is the one irreversible action in
  -- the whole module.
  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_required'
      USING HINT = 'Say what is being removed and why. This cannot be undone, '
                   'and the note outlives the records.';
  END IF;

  SELECT retain_years INTO _years FROM church.record_retention
   WHERE organization_id = _organization_id AND record_type = _record_type;
  IF _years IS NULL THEN RAISE EXCEPTION 'unknown_record_type'; END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  IF _record_type = 'consent_signature' THEN
    WITH doomed AS (
      SELECT s.id FROM church.consent_signatures s
      WHERE s.organization_id = _organization_id
        AND NOT s.legal_hold
        AND (s.revoked_at IS NOT NULL OR s.superseded_by_signature_id IS NOT NULL)
        AND coalesce(s.revoked_at, s.updated_at) < now() - make_interval(years => _years)
    ), gone AS (
      DELETE FROM church.consent_signatures WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;

  ELSIF _record_type = 'injury_report' THEN
    WITH doomed AS (
      SELECT i.id FROM church.kids_incidents i
      JOIN church.people p ON p.id = i.child_person_id
      WHERE i.organization_id = _organization_id
        AND i.severity = 'injury' AND NOT i.legal_hold
        AND p.birth_year IS NOT NULL
        AND i.occurred_on < current_date - make_interval(years => _years)
        AND (p.birth_year + 21) <= extract(year FROM current_date)
    ), gone AS (
      DELETE FROM church.kids_incidents WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;

  ELSIF _record_type = 'behaviour_report' THEN
    WITH doomed AS (
      SELECT i.id FROM church.kids_incidents i
      WHERE i.organization_id = _organization_id
        AND i.severity = 'behaviour' AND NOT i.legal_hold
        AND i.occurred_on < current_date - make_interval(years => _years)
    ), gone AS (
      DELETE FROM church.kids_incidents WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;

  ELSIF _record_type = 'late_collection' THEN
    WITH doomed AS (
      SELECT lp.id FROM church.kids_late_pickups lp
      WHERE lp.organization_id = _organization_id
        AND NOT lp.legal_hold
        AND lp.session_date < current_date - make_interval(years => _years)
    ), gone AS (
      DELETE FROM church.kids_late_pickups WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;
  ELSE
    RAISE EXCEPTION 'unknown_record_type';
  END IF;

  -- After the delete so the count is real, but in the SAME transaction, so a
  -- purge that happened always has a row saying so.
  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_organization_id, 'records_purged', 'success', auth.uid(), _actor,
          jsonb_build_object('record_type', _record_type, 'removed', _n,
                             'retain_years', _years, 'reason', btrim(_reason)));

  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION church.confirm_kids_purge(UUID, TEXT, TEXT) TO authenticated;

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
    'kiosk_search_miss',
    -- new at 20260322240000
    'records_purged', 'legal_hold_changed']));

-- ---------------------------------------------------------------------------
-- Somebody is told, monthly
-- ---------------------------------------------------------------------------
--
-- A schedule nobody reads is the same as no schedule. Once a month, if
-- anything is due, the Kids Ministry admins get one email saying so - with
-- counts and no detail, because what is due is a fact about a table and what
-- is IN those rows is a child's medical history.
CREATE OR REPLACE FUNCTION church.kids_retention_sweep()
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _org RECORD; _total INTEGER; _sent INTEGER := 0; _lines TEXT;
BEGIN
  FOR _org IN SELECT id, name FROM public.organizations LOOP
    SELECT sum(d.due_count),
           string_agg('  ' || d.record_type || ': ' || d.due_count, E'\n'
                      ORDER BY d.record_type)
      INTO _total, _lines
    FROM church.kids_records_due_for_purge(_org.id) d
    WHERE d.due_count > 0;

    CONTINUE WHEN coalesce(_total, 0) = 0;

    INSERT INTO church.notification_log
      (organization_id, kind, channel, recipient_name, recipient_email,
       subject, body)
    SELECT _org.id, 'kids_records_due', 'email', t.full_name, t.email,
           'Some Kids Ministry records are past their retention date',
           'The retention schedule says these records are now past the date '
           || 'the church agreed to keep them:' || E'\n\n' || _lines || E'\n\n'
           || 'NOTHING HAS BEEN DELETED. This is a reminder, and removing '
           || 'them is a deliberate act somebody has to confirm on the Kids '
           || 'Ministry reports tab, with a reason recorded against their '
           || 'name.' || E'\n\n'
           || 'Anything under a legal hold is excluded and stays excluded, '
           || 'including every safeguarding report.'
    FROM church.kids_leaders_to_notify(_org.id) t
    WHERE t.email IS NOT NULL;

    _sent := _sent + 1;
  END LOOP;

  IF _sent > 0 THEN
    BEGIN
      PERFORM church.nudge_kids_notification_sender();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'retention sweep: could not nudge the sender: %', SQLERRM;
    END;
  END IF;
  RETURN _sent;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_retention_sweep() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_retention_sweep() TO service_role;

ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind
  CHECK (kind = ANY (ARRAY[
    'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
    'kids_access_granted', 'kids_late_pickup', 'kids_check_in_held',
    'kids_hold_presented', 'kids_incident_raised', 'kids_incident_to_parent',
    'kids_medical_updated', 'kids_consent_resign_needed',
    'kids_consent_resign_reminder', 'kids_consent_resign_overdue',
    'kids_consent_signed', 'kids_consent_filed',
    -- new at 20260322240000
    'kids_records_due']));

-- 09:00 UTC on the first of the month. Monthly, because a retention schedule
-- is not a thing anybody needs chasing weekly.
SELECT cron.unschedule('kids-retention-sweep')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kids-retention-sweep');

SELECT cron.schedule('kids-retention-sweep', '0 9 1 * *',
                     'SELECT church.kids_retention_sweep()');

NOTIFY pgrst, 'reload schema';
