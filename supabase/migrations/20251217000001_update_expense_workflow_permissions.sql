-- =====================================================
-- Update Expense Request Workflow Permissions
-- Change: Only ADMIN role can approve/deny at leader review stage
-- (Previously: Ministry leaders could approve their ministry's requests)
-- =====================================================

-- 1. Drop the ministry leader update policy for pending expenses
-- Ministry leaders should no longer be able to approve/deny expenses
DROP POLICY IF EXISTS "Ministry leaders can update pending expense requests" ON budget.expense_requests;

-- 2. Update the user's own draft policy to include explicit WITH CHECK
-- This fixes the 403 error when submitting for review (changing status from draft to pending_leader)
DROP POLICY IF EXISTS "Users can update own draft expense requests" ON budget.expense_requests;

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

-- 3. Create policy for ADMIN to handle pending_leader status (approve/deny)
-- Note: Admin already has "Admin can update all expense requests" policy,
-- but we create a specific one for clarity and to ensure it works correctly
DROP POLICY IF EXISTS "Admin can update all expense requests" ON budget.expense_requests;

CREATE POLICY "Admin can update all expense requests"
  ON budget.expense_requests FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Update Treasury policy with explicit WITH CHECK
DROP POLICY IF EXISTS "Treasury can update treasury-stage expense requests" ON budget.expense_requests;

CREATE POLICY "Treasury can update treasury-stage expense requests"
  ON budget.expense_requests FOR UPDATE
  TO authenticated
  USING (
    status IN ('leader_approved', 'pending_treasury')
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'treasury'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'treasury'
    )
  );

-- 5. Update Finance policy with explicit WITH CHECK
DROP POLICY IF EXISTS "Finance can update finance-stage expense requests" ON budget.expense_requests;

CREATE POLICY "Finance can update finance-stage expense requests"
  ON budget.expense_requests FOR UPDATE
  TO authenticated
  USING (
    status IN ('treasury_approved', 'pending_finance')
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'finance'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'finance'
    )
  );

-- =====================================================
-- Summary of Expense Request Workflow:
-- =====================================================
-- 1. User creates expense request (status: draft)
-- 2. User submits for review (status: pending_leader)
-- 3. ADMIN reviews and approves/denies (status: leader_approved/leader_denied)
-- 4. TREASURY reviews and approves/denies (status: treasury_approved/treasury_denied)
-- 5. FINANCE processes payment (status: completed)
-- =====================================================
