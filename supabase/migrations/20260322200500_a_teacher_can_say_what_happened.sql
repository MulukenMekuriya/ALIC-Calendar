-- =====================================================
-- A teacher can say what happened
-- =====================================================
--
-- A classroom teacher writes an account of something that happened in their
-- room. A Kids Ministry admin reads it, signs it off, and decides whether the
-- family hears it from the church. That decision is a human's, every time.
--
-- This replaces an earlier design of behaviour strikes with an automatic
-- three-strike ban. The ban was dropped deliberately: an account that reaches
-- a leader who decides is better than a counter that decides on nobody's
-- behalf, and it gives the family somebody to talk to.
--
-- SEVERITY DECIDES ALMOST EVERYTHING, including whether a parent may be told
-- at all:
--
--   behaviour     row only; a plain email at the admin's discretion.
--   injury        a PDF record is generated and the parent is ALWAYS told.
--                 This is the one asked about months later.
--   safeguarding  leadership only. NEVER auto-sent to a parent, and the send
--                 action does not exist for it - in a safeguarding concern the
--                 parent may BE the concern. Enforced by a CHECK below, not
--                 only by the UI.
--
-- THE TEACHER'S ACCOUNT IS NEVER OVERWRITTEN. reported_narrative is immutable
-- after submission, enforced by a trigger. An incident report is a
-- contemporaneous record; altering one is a serious integrity problem in any
-- safeguarding context, and the teacher may be asked in a year what they saw.
-- The admin keeps full editorial control over what the family reads - they
-- exercise it by writing admin_summary, not by rewriting what somebody else
-- wrote.

CREATE TABLE IF NOT EXISTS church.kids_incidents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  child_person_id  UUID NOT NULL,

  kids_session_id  UUID REFERENCES church.kids_sessions(id) ON DELETE SET NULL,
  room_id          UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  check_in_id      UUID REFERENCES church.kids_check_ins(id) ON DELETE SET NULL,
  occurred_on      DATE NOT NULL,

  severity         TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'submitted',

  -- The teacher's own words. Written once.
  reported_narrative    TEXT NOT NULL,
  reported_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_by_person_id UUID,
  reported_by_name      TEXT NOT NULL,
  reported_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The admin's words. Separate, so neither overwrites the other.
  admin_summary      TEXT,
  signed_off_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_off_by_name TEXT,
  signed_off_at      TIMESTAMPTZ,
  decline_reason     TEXT,

  -- Whether anyone reported this to the authorities. The software never
  -- reports on anybody's behalf and never claims to; it records whether a
  -- human did, so the church can show it took the concern seriously.
  external_report_made      BOOLEAN,
  external_report_reference TEXT,
  external_reported_at      TIMESTAMPTZ,
  external_report_note      TEXT,

  -- What actually went to the family, frozen at send time so the email and
  -- any PDF can never disagree.
  parent_message   TEXT,
  sent_at          TIMESTAMPTZ,

  pdf_storage_path TEXT,
  pdf_sha256       TEXT,
  pdf_generated_at TIMESTAMPTZ,

  -- Exempts the row from any retention purge. Safeguarding defaults to held.
  legal_hold       BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_kids_incident_child
    FOREIGN KEY (child_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE,

  CONSTRAINT chk_kids_incident_severity
    CHECK (severity IN ('behaviour', 'injury', 'safeguarding')),
  CONSTRAINT chk_kids_incident_status
    CHECK (status IN ('submitted', 'under_review', 'signed_off', 'sent', 'declined')),

  -- A report nobody can act on is worse than no report, and this text may be
  -- read back in a year.
  CONSTRAINT chk_kids_incident_narrative
    CHECK (length(btrim(reported_narrative)) >= 20),

  CONSTRAINT chk_kids_incident_signed_off
    CHECK (status <> 'signed_off' OR signed_off_by_name IS NOT NULL),
  CONSTRAINT chk_kids_incident_declined
    CHECK (status <> 'declined' OR length(btrim(coalesce(decline_reason, ''))) >= 5),
  CONSTRAINT chk_kids_incident_sent
    CHECK (status <> 'sent' OR parent_message IS NOT NULL),

  -- THE SAFEGUARDING RULE, in the database and not only in the UI.
  CONSTRAINT chk_kids_incident_safeguarding_never_sent
    CHECK (severity <> 'safeguarding' OR sent_at IS NULL),

  -- A safeguarding report cannot be signed off until somebody has answered
  -- the reporting question. 'no' is a permitted answer; silence is not.
  CONSTRAINT chk_kids_incident_safeguarding_answered
    CHECK (severity <> 'safeguarding'
           OR status NOT IN ('signed_off', 'sent')
           OR external_report_made IS NOT NULL)
);

COMMENT ON TABLE church.kids_incidents IS
  'A teacher''s account of something that happened in their classroom, and what '
  'a Kids Ministry admin decided to do about it. reported_narrative is '
  'immutable after submission. A safeguarding report can never be sent to a '
  'parent - the parent may be the concern.';

COMMENT ON COLUMN church.kids_incidents.reported_narrative IS
  'The teacher''s own words, written once and never edited. A contemporaneous '
  'record; the admin adds admin_summary rather than rewriting this.';

COMMENT ON COLUMN church.kids_incidents.external_report_made IS
  'Whether a human reported this to the local department or law enforcement. '
  'The software never reports on anyone''s behalf. NULL means nobody has '
  'answered yet, which blocks sign-off on a safeguarding report.';

CREATE INDEX IF NOT EXISTS idx_kids_incidents_queue
  ON church.kids_incidents (organization_id, reported_at DESC)
  WHERE status IN ('submitted', 'under_review');
CREATE INDEX IF NOT EXISTS idx_kids_incidents_child
  ON church.kids_incidents (child_person_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_kids_incidents_reporter
  ON church.kids_incidents (reported_by, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_kids_incidents_org
  ON church.kids_incidents (organization_id, occurred_on DESC);

DROP TRIGGER IF EXISTS trg_kids_incidents_updated_at ON church.kids_incidents;
CREATE TRIGGER trg_kids_incidents_updated_at
  BEFORE UPDATE ON church.kids_incidents
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- The account is immutable, and severity only ever goes up
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_incident_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = church, public, extensions
AS $$
DECLARE _old INT; _new INT;
BEGIN
  IF NEW.reported_narrative IS DISTINCT FROM OLD.reported_narrative THEN
    RAISE EXCEPTION 'narrative_is_immutable'
      USING HINT = 'Add a note or an admin summary instead. What a teacher '
                   'wrote at the time is the record.';
  END IF;
  IF NEW.reported_by_name IS DISTINCT FROM OLD.reported_by_name
     OR NEW.reported_at IS DISTINCT FROM OLD.reported_at THEN
    RAISE EXCEPTION 'attribution_is_immutable';
  END IF;

  -- An admin may RAISE severity but never lower it. A teacher who thought
  -- something was serious does not get quietly downgraded; that is a
  -- leadership conversation, and the audit row says who changed it.
  _old := CASE OLD.severity WHEN 'behaviour' THEN 1 WHEN 'injury' THEN 2 ELSE 3 END;
  _new := CASE NEW.severity WHEN 'behaviour' THEN 1 WHEN 'injury' THEN 2 ELSE 3 END;
  IF _new < _old THEN
    RAISE EXCEPTION 'cannot_lower_severity'
      USING HINT = 'Severity can be raised but not lowered.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kids_incident_guard ON church.kids_incidents;
CREATE TRIGGER trg_kids_incident_guard
  BEFORE UPDATE ON church.kids_incidents
  FOR EACH ROW EXECUTE FUNCTION church.kids_incident_guard();

-- ---------------------------------------------------------------------------
-- The thread. Append-only: a correction is a new note, never an edit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church.kids_incident_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  incident_id     UUID NOT NULL REFERENCES church.kids_incidents(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  visibility      TEXT NOT NULL DEFAULT 'internal',
  author_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_kids_incident_note_body CHECK (length(btrim(body)) >= 2),
  CONSTRAINT chk_kids_incident_note_visibility
    CHECK (visibility IN ('internal', 'parent'))
);

COMMENT ON TABLE church.kids_incident_notes IS
  'Append-only thread on an incident. Nothing here is ever updated or deleted; '
  'a correction is a new note. This is where an admin asks the teacher a '
  'question and the teacher answers, without either touching the original '
  'account.';

CREATE INDEX IF NOT EXISTS idx_kids_incident_notes_incident
  ON church.kids_incident_notes (incident_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE church.kids_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.kids_incident_notes ENABLE ROW LEVEL SECURITY;

-- The reviewers see everything in their branch.
DROP POLICY IF EXISTS "Kids leaders can view incidents" ON church.kids_incidents;
CREATE POLICY "Kids leaders can view incidents"
  ON church.kids_incidents FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['kids_admin','kids_leader']::church.module_permission[])));

-- leadership_viewer is a read-only DIRECTORY role, not a safeguarding role, so
-- safeguarding rows are excluded from it entirely.
DROP POLICY IF EXISTS "Leadership can view non-safeguarding incidents" ON church.kids_incidents;
CREATE POLICY "Leadership can view non-safeguarding incidents"
  ON church.kids_incidents FOR SELECT TO authenticated
  USING (severity <> 'safeguarding'
         AND organization_id IN (SELECT church.my_orgs_with_any(
           ARRAY['leadership_viewer']::church.module_permission[])));

-- A teacher sees their OWN reports, so they can see what became of one.
-- Deliberately reported_by = auth.uid() rather than "reports in my room": a
-- teacher who moves rooms should not acquire a history they were never part
-- of, and two accounts of one morning are two accounts - merging them in a
-- volunteer's view is how they stop being independent.
DROP POLICY IF EXISTS "A teacher can view their own reports" ON church.kids_incidents;
CREATE POLICY "A teacher can view their own reports"
  ON church.kids_incidents FOR SELECT TO authenticated
  USING (reported_by = auth.uid());

DROP POLICY IF EXISTS "Incident notes follow the incident" ON church.kids_incident_notes;
CREATE POLICY "Incident notes follow the incident"
  ON church.kids_incident_notes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM church.kids_incidents i
                  WHERE i.id = incident_id
                    AND (i.reported_by = auth.uid()
                         OR i.organization_id IN (SELECT church.my_orgs_with_any(
                              ARRAY['kids_admin','kids_leader']::church.module_permission[])))));

-- No write policy on either table for anyone. There is NO parent-facing
-- policy at all: a family receives an email and, for an injury, a PDF. There
-- is no portal view of incidents and the portal must not grow one without a
-- separate decision.
GRANT SELECT ON church.kids_incidents TO authenticated;
GRANT SELECT ON church.kids_incident_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.kids_incidents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.kids_incident_notes TO service_role;

-- ---------------------------------------------------------------------------
-- Audit actions
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
    -- new at 20260322200500
    'incident_raised', 'incident_noted', 'incident_severity_changed']));

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Who may raise one: the teacher standing in the room
-- ---------------------------------------------------------------------------
--
-- Gated on resolve_actor rather than on a module grant directly, so it picks
-- up the same eligibility rule the desk uses - including the
-- may_not_serve_with_children bar - rather than restating it and drifting.
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

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_raise_incident(UUID, DATE, TEXT, TEXT, UUID, UUID, UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Adding to the thread
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_add_incident_note(
  _incident_id UUID, _body TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  i church.kids_incidents%ROWTYPE;
  _actor TEXT;
  _id UUID;
  _may BOOLEAN;
BEGIN
  SELECT * INTO i FROM church.kids_incidents WHERE id = _incident_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident_not_found'; END IF;

  -- The reporter may answer questions on their own report; a leader may write
  -- on any. Nobody else.
  _may := (i.reported_by = auth.uid())
          OR church.has_permission_in_org(
               i.organization_id,
               ARRAY['kids_admin','kids_leader']::church.module_permission[]);
  IF NOT _may THEN RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501'; END IF;

  IF length(btrim(coalesce(_body, ''))) < 2 THEN
    RAISE EXCEPTION 'note_required';
  END IF;

  SELECT coalesce(full_name, 'Kids Ministry') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'Kids Ministry');

  INSERT INTO church.kids_incident_notes
    (organization_id, incident_id, body, author_id, author_name)
  VALUES (i.organization_id, _incident_id, btrim(_body), auth.uid(), _actor)
  RETURNING id INTO _id;

  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, child_person_id, actor_auth_user_id,
     actor_name, detail)
  VALUES (i.organization_id, 'incident_noted', 'success', i.child_person_id,
          auth.uid(), _actor, jsonb_build_object('incident_id', _incident_id));

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_add_incident_note(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- What a teacher can see of their own reports
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_my_incidents()
RETURNS TABLE (
  id UUID, child_name TEXT, room_name TEXT, occurred_on DATE,
  severity TEXT, status TEXT, reported_at TIMESTAMPTZ,
  reported_narrative TEXT, decline_reason TEXT, note_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT i.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         r.name, i.occurred_on, i.severity, i.status, i.reported_at,
         i.reported_narrative, i.decline_reason,
         (SELECT count(*) FROM church.kids_incident_notes n WHERE n.incident_id = i.id)
  FROM church.kids_incidents i
  LEFT JOIN church.people p ON p.id = i.child_person_id
  LEFT JOIN public.rooms r ON r.id = i.room_id
  -- Their own only. Not "reports in my room": a teacher who moves rooms must
  -- not acquire a history they were never part of.
  WHERE i.reported_by = auth.uid()
  ORDER BY i.reported_at DESC
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_my_incidents() TO authenticated;

NOTIFY pgrst, 'reload schema';
