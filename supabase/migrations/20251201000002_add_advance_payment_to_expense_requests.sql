-- =====================================================
-- Add Advance Payment flag to expense requests
-- =====================================================

-- Add is_advance_payment column to expense_requests table (defaults to false)
ALTER TABLE budget.expense_requests
  ADD COLUMN is_advance_payment BOOLEAN NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN budget.expense_requests.is_advance_payment IS 'Indicates if this is an advance payment request (payment before expense is incurred)';
