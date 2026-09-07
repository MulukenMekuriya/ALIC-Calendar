-- =====================================================
-- Follow-up workflows: the card that says somebody owes a phone call
-- =====================================================
--
-- THE HOLE THIS FILLS
-- -------------------
-- church.station_register_visitor_family (20260321000300) creates a visitor
-- household at the check-in desk, marks everyone in it 'visitor', and then
-- nothing whatsoever happens to them. There is no list of people who came
-- once, no record that anyone rang them, and no way to notice that nobody
-- did. For a church whose growth runs through assimilation, that is the most
-- expensive missing table in the schema.
--
-- THE SHAPE, AND WHY THIS ONE
-- ---------------------------
-- A workflow is an ordered list of steps. A card is one PERSON travelling
-- through them, held by one assignee, with a due date. Cards carry their own
-- activity log so that "we called twice and they never rang back" survives
-- the person who made the calls leaving the team.
--
-- The alternative — a status column on church.people — was rejected because
-- it cannot express who owns the next action, when it is due, or what was
-- said, and because a person can legitimately be in two pipelines at once
-- (new-visitor follow-up and a bereavement care list).
--
-- WHAT IS DELIBERATELY NOT HERE
-- -----------------------------
-- No automation engine, no email templates, no branching. A step becoming
-- due does not send anything; it appears on a human's list. Every attempt to
-- automate pastoral follow-up ends with a family receiving a form letter
-- signed by a person who has never met them.

-- ---------------------------------------------------------------------------
-- Definitions
-- ---------------------------------------------------------------------------
CREATE TABLE church.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  name TEXT NOT NULL,
  description TEXT,
  -- Loose grouping for the dashboard: 'visitor', 'membership', 'care', ...
  category TEXT,

  -- When a person is created carrying this membership status code, a card is
  -- opened automatically. NULL means the workflow is entered by hand only.
  -- A code rather than an FK to membership_statuses, because the statuses are
  -- seeded per organization and the codes are the stable part.
  auto_add_on_status_code TEXT,

  -- Who picks it up when nothing more specific applies.
  default_assignee_person_id UUID,

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_workflows_id_org UNIQUE (id, organization_id),
  CONSTRAINT uq_workflows_org_name UNIQUE (organization_id, name),
  CONSTRAINT fk_workflows_default_assignee
    FOREIGN KEY (default_assignee_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE SET NULL
);

CREATE TABLE church.workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  workflow_id UUID NOT NULL,

  sequence INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- Days after a card lands on this step before it is overdue. NULL means the
  -- step has no clock, which is a real answer for a final "keep an eye out".
  expected_days INTEGER,

  -- Steps are retired, not deleted: a completed card still points at the step
  -- it finished on, and history that rewrites itself is not history.
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_workflow_steps_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_workflow_steps_workflow
    FOREIGN KEY (workflow_id, organization_id)
    REFERENCES church.workflows(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT uq_workflow_steps_sequence UNIQUE (workflow_id, sequence),
  CONSTRAINT chk_workflow_steps_sequence CHECK (sequence > 0),
  CONSTRAINT chk_workflow_steps_expected_days
    CHECK (expected_days IS NULL OR expected_days BETWEEN 0 AND 365)
);

-- ---------------------------------------------------------------------------
-- Cards
-- ---------------------------------------------------------------------------
CREATE TABLE church.workflow_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  workflow_id UUID NOT NULL,
  person_id UUID NOT NULL,

  current_step_id UUID,
  assignee_person_id UUID,

  status TEXT NOT NULL DEFAULT 'open',

  -- Set from the step's expected_days on arrival, and editable, because
  -- "she asked me to call after Easter" is a real thing a volunteer knows.
  due_on DATE,
  snooze_until DATE,

  entered_step_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- How it ended. 'joined_group', 'became_member', 'unreachable',
  -- 'not_interested', 'moved_away' — free text, because a fixed list here
  -- would be a guess at ALIC's pastoral vocabulary.
  outcome TEXT,

  completed_at TIMESTAMPTZ,
  completed_by_name TEXT,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_workflow_cards_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_workflow_cards_workflow
    FOREIGN KEY (workflow_id, organization_id)
    REFERENCES church.workflows(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_cards_person
    FOREIGN KEY (person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_workflow_cards_step
    FOREIGN KEY (current_step_id, organization_id)
    REFERENCES church.workflow_steps(id, organization_id) ON DELETE SET NULL,
  CONSTRAINT fk_workflow_cards_assignee
    FOREIGN KEY (assignee_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE SET NULL,

  CONSTRAINT chk_workflow_cards_status CHECK (status IN
    ('open', 'snoozed', 'completed', 'removed')),
  CONSTRAINT chk_workflow_cards_snooze CHECK
    (status <> 'snoozed' OR snooze_until IS NOT NULL),
  CONSTRAINT chk_workflow_cards_completed CHECK
    ((status IN ('completed', 'removed')) = (completed_at IS NOT NULL))
);

-- One live card per person per workflow. Somebody who visits twice does not
-- get two follow-up cards; somebody who was followed up in 2025 and comes
-- back in 2027 does, because the 2025 card is completed by then.
CREATE UNIQUE INDEX uq_workflow_cards_one_live
  ON church.workflow_cards(workflow_id, person_id)
  WHERE status IN ('open', 'snoozed');

CREATE INDEX idx_workflow_cards_board
  ON church.workflow_cards(workflow_id, status, due_on);
CREATE INDEX idx_workflow_cards_assignee
  ON church.workflow_cards(assignee_person_id, status)
  WHERE status IN ('open', 'snoozed');
CREATE INDEX idx_workflow_cards_person ON church.workflow_cards(person_id);
CREATE INDEX idx_workflow_steps_workflow ON church.workflow_steps(workflow_id, sequence);

-- ---------------------------------------------------------------------------
-- What happened on a card
-- ---------------------------------------------------------------------------
CREATE TABLE church.workflow_card_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES church.workflow_cards(id) ON DELETE CASCADE,

  kind TEXT NOT NULL,
  body TEXT,

  from_step_id UUID REFERENCES church.workflow_steps(id) ON DELETE SET NULL,
  to_step_id UUID REFERENCES church.workflow_steps(id) ON DELETE SET NULL,
  assignee_person_id UUID REFERENCES church.people(id) ON DELETE SET NULL,

  actor_auth_user UUID,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_workflow_activity_kind CHECK (kind IN
    ('created', 'note', 'step_change', 'assigned', 'snoozed',
     'completed', 'reopened', 'removed'))
);

CREATE INDEX idx_workflow_card_activities_card
  ON church.workflow_card_activities(card_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER update_church_workflows_updated_at
  BEFORE UPDATE ON church.workflows
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();
CREATE TRIGGER update_church_workflow_steps_updated_at
  BEFORE UPDATE ON church.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();
CREATE TRIGGER update_church_workflow_cards_updated_at
  BEFORE UPDATE ON church.workflow_cards
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------
--
-- Deliberately NO new church.module_permission value. Following somebody up
-- means reading their phone number and household, which is members_viewer,
-- and running the pipeline means editing people's records, which is
-- members_admin. A third permission would have to imply one of those to be
-- usable, at which point it is one of those.
--
-- The one addition is that the ASSIGNEE of a card may work it — add a note,
-- move it on, finish it — without holding members_admin, so that a connections
-- volunteer can be handed six cards and nothing else.
CREATE OR REPLACE FUNCTION church.can_manage_workflows(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT church.has_permission_in_org(
    _organization_id, ARRAY['members_admin']::church.module_permission[])
$$;

CREATE OR REPLACE FUNCTION church.can_read_workflows(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT church.has_permission_in_org(
    _organization_id,
    ARRAY['members_admin', 'members_viewer', 'leadership_viewer']::church.module_permission[])
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE church.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.workflow_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.workflow_card_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workflow readers can view workflows"
  ON church.workflows FOR SELECT TO authenticated
  USING (church.can_read_workflows(organization_id));

CREATE POLICY "Members admins can write workflows"
  ON church.workflows FOR ALL TO authenticated
  USING (church.can_manage_workflows(organization_id))
  WITH CHECK (church.can_manage_workflows(organization_id));

CREATE POLICY "Workflow readers can view steps"
  ON church.workflow_steps FOR SELECT TO authenticated
  USING (church.can_read_workflows(organization_id));

CREATE POLICY "Members admins can write steps"
  ON church.workflow_steps FOR ALL TO authenticated
  USING (church.can_manage_workflows(organization_id))
  WITH CHECK (church.can_manage_workflows(organization_id));

-- A card is visible to the follow-up team, and to the volunteer holding it.
CREATE POLICY "Workflow readers and assignees can view cards"
  ON church.workflow_cards FOR SELECT TO authenticated
  USING (
    church.can_read_workflows(organization_id)
    OR assignee_person_id IN (SELECT * FROM church.my_person_ids())
  );

CREATE POLICY "Members admins can write cards"
  ON church.workflow_cards FOR ALL TO authenticated
  USING (church.can_manage_workflows(organization_id))
  WITH CHECK (church.can_manage_workflows(organization_id));

CREATE POLICY "Workflow readers and assignees can view activity"
  ON church.workflow_card_activities FOR SELECT TO authenticated
  USING (
    church.can_read_workflows(organization_id)
    OR card_id IN (
      SELECT c.id FROM church.workflow_cards c
      WHERE c.assignee_person_id IN (SELECT * FROM church.my_person_ids())
    )
  );

-- Activity rows are written by the SECURITY DEFINER functions in
-- 20260322000500, never directly: an activity log a user can hand-write is
-- not a log.

GRANT SELECT, INSERT, UPDATE, DELETE ON church.workflows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.workflow_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE ON church.workflow_cards TO authenticated;
GRANT SELECT ON church.workflow_card_activities TO authenticated;

NOTIFY pgrst, 'reload schema';
