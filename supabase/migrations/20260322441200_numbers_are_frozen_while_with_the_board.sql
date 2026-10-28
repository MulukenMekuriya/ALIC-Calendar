-- =====================================================
-- The numbers do not move while a request is with the Board
-- =====================================================
--
-- The Board decides on the figures it was sent. Until now nothing stopped a
-- local leader (any admin policy allows the UPDATE) changing them under its
-- feet, or a request being created already approved.
--
--   1. While a request is in board_review, what is being decided cannot be
--      changed: amount, monthly lines, period, ministry, year, branch. The
--      Board's own move out of board_review (approved / back to under review)
--      changes status, not these, so it passes. A request that needs changing
--      is sent back first.
--   2. The same for its period amounts (the annual/quarterly rows).
--   3. A request is created as a draft or pending, never as anything further
--      along. RESTRICTIVE, so it narrows the existing permissive policy.
--   4. Changing the figures of a conditionally approved request takes it back
--      to under review: it is no longer what was approved.

CREATE OR REPLACE FUNCTION budget.allocation_request_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = budget, public
AS $$
BEGIN
  IF OLD.status = 'board_review'
     AND (NEW.requested_amount IS DISTINCT FROM OLD.requested_amount
       OR NEW.budget_breakdown IS DISTINCT FROM OLD.budget_breakdown
       OR NEW.period_type IS DISTINCT FROM OLD.period_type
       OR NEW.justification IS DISTINCT FROM OLD.justification
       OR NEW.ministry_id IS DISTINCT FROM OLD.ministry_id
       OR NEW.fiscal_year_id IS DISTINCT FROM OLD.fiscal_year_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'This request is with the Board, so its figures cannot change. Ask the Board to send it back first.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'conditionally_approved' AND NEW.status = 'conditionally_approved'
     AND (NEW.requested_amount IS DISTINCT FROM OLD.requested_amount
       OR NEW.budget_breakdown IS DISTINCT FROM OLD.budget_breakdown
       OR NEW.period_type IS DISTINCT FROM OLD.period_type) THEN
    NEW.status := 'under_review';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocation_request_freeze ON budget.allocation_requests;
CREATE TRIGGER allocation_request_freeze
  BEFORE UPDATE ON budget.allocation_requests
  FOR EACH ROW EXECUTE FUNCTION budget.allocation_request_freeze();

CREATE OR REPLACE FUNCTION budget.allocation_period_amount_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = budget, public
AS $$
DECLARE
  _request uuid := coalesce(NEW.allocation_request_id, OLD.allocation_request_id);
BEGIN
  IF EXISTS (SELECT 1 FROM budget.allocation_requests WHERE id = _request AND status = 'board_review') THEN
    RAISE EXCEPTION 'This request is with the Board, so its figures cannot change. Ask the Board to send it back first.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS allocation_period_amount_freeze ON budget.allocation_period_amounts;
CREATE TRIGGER allocation_period_amount_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON budget.allocation_period_amounts
  FOR EACH ROW EXECUTE FUNCTION budget.allocation_period_amount_freeze();

DROP POLICY IF EXISTS "Requests are created as drafts or pending" ON budget.allocation_requests;
CREATE POLICY "Requests are created as drafts or pending"
  ON budget.allocation_requests
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (status IN ('draft', 'pending'));

NOTIFY pgrst, 'reload schema';
