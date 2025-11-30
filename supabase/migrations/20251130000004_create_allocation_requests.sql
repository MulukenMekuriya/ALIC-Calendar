-- =====================================================
-- Create Budget Allocation Requests Table
-- Allows ministry leaders to request budget allocations
-- =====================================================

-- Create enum for allocation period type
CREATE TYPE budget.allocation_period_type AS ENUM ('annual', 'quarterly', 'monthly');

-- Create enum for allocation request status
CREATE TYPE budget.allocation_request_status AS ENUM (
  'draft',
  'pending',
  'approved',
  'partially_approved',
  'denied',
  'cancelled'
);

-- Create the allocation requests table
CREATE TABLE budget.allocation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES budget.fiscal_years(id) ON DELETE CASCADE,
  ministry_id UUID NOT NULL REFERENCES budget.ministries(id) ON DELETE CASCADE,

  -- Request details
  requester_id UUID NOT NULL REFERENCES auth.users(id),
  requester_name TEXT NOT NULL,

  -- Period configuration
  period_type budget.allocation_period_type NOT NULL DEFAULT 'annual',

  -- For annual: NULL (applies to whole year)
  -- For quarterly: 1, 2, 3, or 4
  -- For monthly: 1-12 (Jan=1, Dec=12)
  period_number INTEGER,

  -- Amount requested
  requested_amount DECIMAL(12, 2) NOT NULL CHECK (requested_amount > 0),

  -- Justification for the request
  justification TEXT NOT NULL,

  -- Optional: breakdown of how the funds will be used
  budget_breakdown JSONB,

  -- Status tracking
  status budget.allocation_request_status NOT NULL DEFAULT 'draft',

  -- Admin review
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,

  -- If partially approved, the approved amount
  approved_amount DECIMAL(12, 2),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_period_number CHECK (
    (period_type = 'annual' AND period_number IS NULL) OR
    (period_type = 'quarterly' AND period_number BETWEEN 1 AND 4) OR
    (period_type = 'monthly' AND period_number BETWEEN 1 AND 12)
  )
);

-- Create indexes for common queries
CREATE INDEX idx_allocation_requests_org ON budget.allocation_requests(organization_id);
CREATE INDEX idx_allocation_requests_fiscal_year ON budget.allocation_requests(fiscal_year_id);
CREATE INDEX idx_allocation_requests_ministry ON budget.allocation_requests(ministry_id);
CREATE INDEX idx_allocation_requests_requester ON budget.allocation_requests(requester_id);
CREATE INDEX idx_allocation_requests_status ON budget.allocation_requests(status);
CREATE INDEX idx_allocation_requests_created ON budget.allocation_requests(created_at DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_allocation_requests_updated_at
  BEFORE UPDATE ON budget.allocation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create allocation request history table for audit trail
CREATE TABLE budget.allocation_request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES budget.allocation_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'submitted', 'approved', 'denied', 'cancelled', etc.
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  actor_name TEXT NOT NULL,
  old_status budget.allocation_request_status,
  new_status budget.allocation_request_status,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_allocation_request_history_request ON budget.allocation_request_history(request_id);

-- RLS Policies
ALTER TABLE budget.allocation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget.allocation_request_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view allocation requests for their organization
CREATE POLICY "Users can view org allocation requests"
ON budget.allocation_requests FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.user_organizations
    WHERE user_id = auth.uid()
  )
);

-- Policy: Users can insert allocation requests for their ministry
CREATE POLICY "Users can create allocation requests"
ON budget.allocation_requests FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.user_organizations
    WHERE user_id = auth.uid()
  )
  AND requester_id = auth.uid()
);

-- Policy: Users can update their own draft requests, admins can update any
CREATE POLICY "Users can update allocation requests"
ON budget.allocation_requests FOR UPDATE
TO authenticated
USING (
  (requester_id = auth.uid() AND status = 'draft') OR
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
    AND organization_id = budget.allocation_requests.organization_id
    AND app_role IN ('admin', 'superadmin')
  )
);

-- Policy: Users can delete their own draft requests
CREATE POLICY "Users can delete draft allocation requests"
ON budget.allocation_requests FOR DELETE
TO authenticated
USING (requester_id = auth.uid() AND status = 'draft');

-- Policy: Users can view history for requests they can see
CREATE POLICY "Users can view allocation request history"
ON budget.allocation_request_history FOR SELECT
TO authenticated
USING (
  request_id IN (
    SELECT id FROM budget.allocation_requests
    WHERE organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  )
);

-- Policy: System can insert history
CREATE POLICY "Authenticated users can insert history"
ON budget.allocation_request_history FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

-- Helper function to get period label
CREATE OR REPLACE FUNCTION budget.get_period_label(
  p_period_type budget.allocation_period_type,
  p_period_number INTEGER
) RETURNS TEXT AS $$
BEGIN
  IF p_period_type = 'annual' THEN
    RETURN 'Annual';
  ELSIF p_period_type = 'quarterly' THEN
    RETURN 'Q' || p_period_number;
  ELSIF p_period_type = 'monthly' THEN
    RETURN TO_CHAR(TO_DATE(p_period_number::TEXT, 'MM'), 'Month');
  END IF;
  RETURN 'Unknown';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON TABLE budget.allocation_requests IS 'Budget allocation requests from ministry leaders';
COMMENT ON TABLE budget.allocation_request_history IS 'Audit trail for allocation request changes';
