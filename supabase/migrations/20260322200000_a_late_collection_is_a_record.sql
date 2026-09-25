-- =====================================================
-- A late collection is a record, not a punishment
-- =====================================================
--
-- The Children's Ministry asked to be able to see which families collect late.
-- This records it. It does NOT count toward anything, it does not accumulate,
-- and nothing here refuses a child at the desk — an earlier design with a
-- three-strike counter and an automatic ban was deliberately dropped, because
-- a counter decides on nobody's behalf.
--
-- NOTHING IS SENT AUTOMATICALLY EITHER. Detection is automatic; telling a
-- parent is not. A row lands at status 'recorded' and stays there until a
-- leader reads it and chooses. That matches how incident reports work, and it
-- means the quiet failure mode is silence rather than a form letter nobody
-- reviewed.
--
-- WHY A NEW GRACE COLUMN. check_in_closes_minutes_after (30) governs ARRIVAL.
-- auto_expire_minutes_after_end (240) is the four-hour data-hygiene backstop,
-- so a child collected two hours late would never be noticed at all. Silver
-- Spring's service ends 13:30, so 15 minutes puts the line at 13:45 — the walk
-- from the sanctuary plus a conversation.

ALTER TABLE church.kids_events
  ADD COLUMN IF NOT EXISTS late_pickup_grace_minutes INTEGER NOT NULL DEFAULT 15;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'church.kids_events'::regclass
                    AND conname = 'chk_kids_events_late_grace') THEN
    ALTER TABLE church.kids_events
      ADD CONSTRAINT chk_kids_events_late_grace CHECK (
        late_pickup_grace_minutes >= 0
        -- A grace longer than the expiry window means the row is expired
        -- before it can ever be late, so nothing would ever be recorded.
        AND late_pickup_grace_minutes < auto_expire_minutes_after_end);
  END IF;
END $$;

COMMENT ON COLUMN church.kids_events.late_pickup_grace_minutes IS
  'Minutes after the service ends before a collection counts as late. Distinct '
  'from check_in_closes_minutes_after, which governs arrival, and from '
  'auto_expire_minutes_after_end, which is the four-hour hygiene backstop.';

-- ---------------------------------------------------------------------------
-- The rows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church.kids_late_pickups (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  child_person_id  UUID NOT NULL,

  check_in_id      UUID REFERENCES church.kids_check_ins(id) ON DELETE SET NULL,
  kids_session_id  UUID REFERENCES church.kids_sessions(id)  ON DELETE SET NULL,
  room_id          UUID REFERENCES public.rooms(id)          ON DELETE SET NULL,
  session_date     DATE,

  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  minutes_late     INTEGER,
  source           TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'recorded',
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name TEXT,
  reviewed_at      TIMESTAMPTZ,

  parent_message     TEXT,
  parent_notified_at TIMESTAMPTZ,
  dismissed_reason   TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_kids_late_pickup_child
    FOREIGN KEY (child_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE,

  CONSTRAINT chk_kids_late_pickup_source
    CHECK (source IN ('checkout', 'never_collected')),
  CONSTRAINT chk_kids_late_pickup_status
    CHECK (status IN ('recorded', 'notified', 'dismissed')),
  CONSTRAINT chk_kids_late_pickup_minutes
    CHECK (minutes_late IS NULL OR minutes_late >= 0),
  CONSTRAINT chk_kids_late_pickup_notified
    CHECK (status <> 'notified' OR parent_notified_at IS NOT NULL),
  CONSTRAINT chk_kids_late_pickup_dismissed
    CHECK (status <> 'dismissed'
           OR length(btrim(coalesce(dismissed_reason, ''))) >= 5)
);

COMMENT ON TABLE church.kids_late_pickups IS
  'One row per late collection. NOT a strike ledger: nothing counts toward '
  'anything and no check-in is ever refused because of these. A row stays at '
  'status ''recorded'' until a leader chooses to tell the family or dismiss it.';

COMMENT ON COLUMN church.kids_late_pickups.minutes_late IS
  'Measured from kids_sessions.ends_at for source ''checkout''. For '
  '''never_collected'' it is auto_expire_minutes_after_end, which is a FLOOR '
  'and not a measurement - nobody recorded a collection, so nobody knows when '
  'or whether it happened.';

-- The structural guarantee that a re-run checkout, a duplicate call or the
-- ten-minute expiry sweep cannot record the same collection twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kids_late_pickup_one_per_check_in
  ON church.kids_late_pickups (check_in_id) WHERE check_in_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kids_late_pickups_child
  ON church.kids_late_pickups (child_person_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_kids_late_pickups_org
  ON church.kids_late_pickups (organization_id, session_date DESC);
-- The review queue: unreviewed first is the only query the screen makes hot.
CREATE INDEX IF NOT EXISTS idx_kids_late_pickups_unreviewed
  ON church.kids_late_pickups (organization_id, detected_at DESC)
  WHERE status = 'recorded';

-- ---------------------------------------------------------------------------
-- RLS: readable by the leadership, written only through definer RPCs
-- ---------------------------------------------------------------------------
ALTER TABLE church.kids_late_pickups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids leaders can view late pickups" ON church.kids_late_pickups;
CREATE POLICY "Kids leaders can view late pickups"
  ON church.kids_late_pickups FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['kids_admin','kids_leader','leadership_viewer']::church.module_permission[])));

-- No INSERT/UPDATE/DELETE policy for anyone, deliberately: every write goes
-- through a SECURITY DEFINER RPC, exactly as kids_check_ins does.
--
-- kids_volunteer is excluded. With no consequence attached to these rows, a
-- classroom volunteer has no reason to need a family's collection history, and
-- it is not classroom information.
GRANT SELECT ON church.kids_late_pickups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.kids_late_pickups TO service_role;

-- ---------------------------------------------------------------------------
-- The audit actions. Carries forward ALL FOURTEEN existing values.
-- ---------------------------------------------------------------------------
-- The live constraint is from 20260321000300, not the 11-value list in the
-- core migration, and check_out_children writes 'restricted_pickup_override'
-- today. Dropping both possible names because 20260321000300 had to.
ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS check_in_audit_action_check;
ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS chk_check_in_audit_action;
ALTER TABLE church.check_in_audit ADD CONSTRAINT chk_check_in_audit_action
  CHECK (action = ANY (ARRAY[
    'check_in', 'check_out', 'transfer', 'code_failed', 'override',
    'sensitive_viewed', 'restricted_pickup_attempt', 'restricted_pickup_override',
    'pin_failed', 'auto_expired', 'label_reprint', 'shift_opened', 'shift_closed',
    'visitor_registered',
    -- new at 20260322200000
    'late_pickup_recorded', 'late_pickup_notified', 'late_pickup_dismissed']));

-- ---------------------------------------------------------------------------
-- The notification kind. Full list re-added, per 20260322150000's pattern.
-- ---------------------------------------------------------------------------
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind
  CHECK (kind IN (
    'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
    'kids_access_granted',
    'kids_late_pickup'));

COMMENT ON COLUMN church.notification_log.kind IS
  'check_in / check_out - the parent''s own children, queued by the desk. '
  'volunteer_message - a volunteer asking a parent to come. '
  'kids_auto_expired - the leaders'' notice that the board was cleared. '
  'kids_access_granted - a volunteer''s access email. '
  'kids_late_pickup - a note about collecting after the service, sent only '
  'when a leader chooses to send it; nothing queues this automatically.';

-- ---------------------------------------------------------------------------
-- The report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.kids_late_pickup_report(
  _organization_id UUID, _from DATE, _to DATE)
RETURNS TABLE (
  id UUID,
  session_date DATE,
  detected_at TIMESTAMPTZ,
  child_person_id UUID,
  child_name TEXT,
  room_name TEXT,
  minutes_late INTEGER,
  source TEXT,
  status TEXT,
  reviewed_by_name TEXT,
  parent_notified_at TIMESTAMPTZ,
  dismissed_reason TEXT,
  times_in_range BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  -- A read, so assert_kids_leader is right here: leadership_viewer legitimately
  -- reports on this. Writes below use has_permission_in_org instead.
  PERFORM church.assert_kids_leader(_organization_id);
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'invalid_date_range';
  END IF;

  RETURN QUERY
  SELECT
    lp.id,
    lp.session_date,
    lp.detected_at,
    lp.child_person_id,
    coalesce(p.first_name || ' ' || p.last_name, '(unknown child)'),
    r.name,
    lp.minutes_late,
    lp.source,
    lp.status,
    lp.reviewed_by_name,
    lp.parent_notified_at,
    lp.dismissed_reason,
    -- How many times this child has been collected late in the window, so a
    -- pattern is visible to the person who can have the conversation.
    count(*) OVER (PARTITION BY lp.child_person_id)
  FROM church.kids_late_pickups lp
  LEFT JOIN church.people p ON p.id = lp.child_person_id
  LEFT JOIN public.rooms r ON r.id = lp.room_id
  WHERE lp.organization_id = _organization_id
    AND lp.session_date BETWEEN _from AND _to
  -- Unreviewed first: the queue is the point of the screen.
  ORDER BY (lp.status = 'recorded') DESC, lp.detected_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_late_pickup_report(UUID, DATE, DATE)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
