-- =====================================================
-- The Board sees only what was sent to it
-- =====================================================
--
-- "Board shouldn't see the budget request until the local admin sends it to
-- their review." Until now that was only a filter in the browser: any member
-- of the branch could read every request.
--
-- A user whose role in a branch is Board can read that branch's requests (and
-- their monthly amounts and history) only once they are with the Board or
-- decided: board_review, approved, partially_approved, denied. RESTRICTIVE, so
-- it narrows the existing permissive read policies without replacing them.
-- Nobody else's access changes; the Board's own writes go through the
-- SECURITY DEFINER functions, which are not subject to this.
--
-- Ships with the Board's new screen, which only asks for these.

DROP POLICY IF EXISTS "The Board reads only what was sent to it" ON budget.allocation_requests;
CREATE POLICY "The Board reads only what was sent to it"
  ON budget.allocation_requests
  AS RESTRICTIVE
  FOR SELECT
  USING (
    NOT public.is_board(organization_id)
    OR status IN ('board_review', 'approved', 'partially_approved', 'denied')
  );

DROP POLICY IF EXISTS "The Board reads only what was sent to it" ON budget.allocation_period_amounts;
CREATE POLICY "The Board reads only what was sent to it"
  ON budget.allocation_period_amounts
  AS RESTRICTIVE
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM budget.allocation_requests r
      WHERE r.id = allocation_period_amounts.allocation_request_id
    )
  );

DROP POLICY IF EXISTS "The Board reads only what was sent to it" ON budget.allocation_request_history;
CREATE POLICY "The Board reads only what was sent to it"
  ON budget.allocation_request_history
  AS RESTRICTIVE
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM budget.allocation_requests r
      WHERE r.id = allocation_request_history.request_id
    )
  );

NOTIFY pgrst, 'reload schema';
