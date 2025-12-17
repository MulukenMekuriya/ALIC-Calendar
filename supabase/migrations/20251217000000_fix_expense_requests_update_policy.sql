-- Fix: Ensure users can update their own draft expense requests
-- The existing policy should work, but we'll recreate it to be safe

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can update own draft expense requests" ON budget.expense_requests;

-- Recreate with explicit WITH CHECK clause
CREATE POLICY "Users can update own draft expense requests"
  ON budget.expense_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid()
    AND status = 'draft'
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    requester_id = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );
