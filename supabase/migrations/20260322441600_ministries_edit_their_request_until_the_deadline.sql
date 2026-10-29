-- =====================================================
-- A ministry can change its own request until the deadline
-- =====================================================
--
-- The finance office reviews before 1 November in case ministries need to make
-- changes, so a ministry may keep editing its request until the deadline even
-- after the local leaders have started on it. Until now the requester could
-- only update while it was draft or pending.
--
--   * A requester may update their own request while it is under_review or
--     conditionally_approved. The season lock already closes this for
--     contributors at the deadline; admins are unaffected.
--   * Changing the figures of a conditionally approved request takes it back to
--     under_review (allocation_request_freeze, 441200): it is no longer what
--     was approved. A request with the Board stays frozen.
--   * A requester may change what they asked for, never how it was decided:
--     status, approved amount, notes and reviewer are not theirs to set.
--   * Each edit made after review began leaves a history line, so the local
--     leaders can see what changed and when.

DROP POLICY IF EXISTS "Requesters can edit their request until the deadline" ON budget.allocation_requests;
CREATE POLICY "Requesters can edit their request until the deadline"
  ON budget.allocation_requests
  FOR UPDATE
  USING (requester_id = auth.uid() AND status IN ('under_review', 'conditionally_approved'))
  WITH CHECK (requester_id = auth.uid() AND status IN ('under_review', 'conditionally_approved'));

DROP POLICY IF EXISTS "Requesters can edit their period amounts until the deadline" ON budget.allocation_period_amounts;
CREATE POLICY "Requesters can edit their period amounts until the deadline"
  ON budget.allocation_period_amounts
  FOR UPDATE
  USING (
    allocation_request_id IN (
      SELECT r.id FROM budget.allocation_requests r
      WHERE r.requester_id = auth.uid() AND r.status IN ('under_review', 'conditionally_approved')
    )
  );

CREATE OR REPLACE FUNCTION budget.requester_edit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
BEGIN
  -- Only the requester's own direct edit. The office and the Board act through
  -- functions run by an admin or Board member, who are not covered here.
  IF auth.uid() IS NULL OR OLD.requester_id IS DISTINCT FROM auth.uid()
     OR public.is_org_admin(OLD.organization_id) OR public.is_board(OLD.organization_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_amount IS DISTINCT FROM OLD.approved_amount
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'You can change what you asked for, not how it was decided.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.status IN ('under_review', 'conditionally_approved')
     AND (NEW.requested_amount IS DISTINCT FROM OLD.requested_amount
       OR NEW.budget_breakdown IS DISTINCT FROM OLD.budget_breakdown
       OR NEW.justification IS DISTINCT FROM OLD.justification
       OR NEW.period_type IS DISTINCT FROM OLD.period_type) THEN
    INSERT INTO budget.allocation_request_history
      (request_id, action, actor_id, actor_name, old_status, new_status, notes)
    VALUES
      (OLD.id, 'edited_by_requester', auth.uid(), budget.current_actor_name(),
       OLD.status, NEW.status,
       format('Changed by the ministry after review began: $%s to $%s',
              to_char(OLD.requested_amount, 'FM999,999,990.00'),
              to_char(NEW.requested_amount, 'FM999,999,990.00')));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS requester_edit_guard ON budget.allocation_requests;
-- Named so it runs after allocation_request_freeze, whose reset to under_review
-- the history line should record.
CREATE TRIGGER zz_requester_edit_guard
  BEFORE UPDATE ON budget.allocation_requests
  FOR EACH ROW EXECUTE FUNCTION budget.requester_edit_guard();

REVOKE ALL ON FUNCTION budget.requester_edit_guard() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
