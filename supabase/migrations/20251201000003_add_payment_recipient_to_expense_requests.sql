-- =====================================================
-- Add Payment Recipient fields to expense requests
-- For when the payment recipient is different from the requester
-- =====================================================

-- Add flag to indicate if recipient is different from requester
ALTER TABLE budget.expense_requests
  ADD COLUMN is_different_recipient BOOLEAN NOT NULL DEFAULT false;

-- Add recipient fields (required when is_different_recipient is true)
ALTER TABLE budget.expense_requests
  ADD COLUMN recipient_name TEXT;

ALTER TABLE budget.expense_requests
  ADD COLUMN recipient_phone TEXT;

ALTER TABLE budget.expense_requests
  ADD COLUMN recipient_email TEXT;

-- Add comments for documentation
COMMENT ON COLUMN budget.expense_requests.is_different_recipient IS 'Indicates if the payment recipient is different from the requester';
COMMENT ON COLUMN budget.expense_requests.recipient_name IS 'Name of the payment recipient (required if is_different_recipient is true)';
COMMENT ON COLUMN budget.expense_requests.recipient_phone IS 'Phone number of the payment recipient (required if is_different_recipient is true)';
COMMENT ON COLUMN budget.expense_requests.recipient_email IS 'Email of the payment recipient (required if is_different_recipient is true)';
