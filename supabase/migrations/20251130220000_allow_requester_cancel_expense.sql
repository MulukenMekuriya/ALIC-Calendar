-- Allow requesters to cancel their own pending expense requests
-- This policy allows users to update their own expense requests from 'pending_leader' to 'cancelled'

CREATE POLICY "Users can cancel own pending expense requests"
  ON budget.expense_requests FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid()
    AND status = 'pending_leader'
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'cancelled'
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );
