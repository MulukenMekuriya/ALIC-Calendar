-- =====================================================
-- Ministry Flags - Advance Payment Document Tracking
-- =====================================================

-- Create the flag_type enum in budget schema
CREATE TYPE budget.ministry_flag_type AS ENUM (
  'missing_receipts',
  'unreturned_funds'
);

-- Create the ministry_flags table
CREATE TABLE budget.ministry_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id UUID REFERENCES budget.ministries(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  flag_type budget.ministry_flag_type NOT NULL,
  expense_request_id UUID REFERENCES budget.expense_requests(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  created_by_name TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by_name TEXT,
  notes TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE budget.ministry_flags ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_ministry_flags_ministry_id ON budget.ministry_flags(ministry_id);
CREATE INDEX idx_ministry_flags_organization_id ON budget.ministry_flags(organization_id);
CREATE INDEX idx_ministry_flags_expense_request_id ON budget.ministry_flags(expense_request_id);
CREATE INDEX idx_ministry_flags_unresolved ON budget.ministry_flags(ministry_id) WHERE resolved_at IS NULL;

-- Updated_at trigger
CREATE TRIGGER update_budget_ministry_flags_updated_at
  BEFORE UPDATE ON budget.ministry_flags
  FOR EACH ROW
  EXECUTE FUNCTION budget.update_updated_at_column();

-- =====================================================
-- RLS Policies
-- =====================================================

-- All org members can view flags (needed for blocking check)
CREATE POLICY "Users can view ministry flags in their organizations"
  ON budget.ministry_flags FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Finance can create flags
CREATE POLICY "Finance can create ministry flags"
  ON budget.ministry_flags FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'finance'
    )
  );

-- Admin/Finance can update flags (resolve them)
CREATE POLICY "Admin and Finance can update ministry flags"
  ON budget.ministry_flags FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role IN ('admin', 'finance')
    )
  );

-- Admin can delete flags
CREATE POLICY "Admin can delete ministry flags"
  ON budget.ministry_flags FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Helper function: Check if ministry is blocked
-- =====================================================
CREATE OR REPLACE FUNCTION budget.is_ministry_blocked(_ministry_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = budget, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM budget.ministry_flags
    WHERE ministry_id = _ministry_id
      AND resolved_at IS NULL
  )
$$;

-- =====================================================
-- Notification trigger: Email requester when flagged
-- =====================================================
CREATE OR REPLACE FUNCTION budget.notify_ministry_flag_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _supabase_url text;
  _service_role_key text;
BEGIN
  -- Read secrets from vault
  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF _supabase_url IS NULL OR _service_role_key IS NULL THEN
    RAISE WARNING 'Vault secrets not configured for ministry flag notifications';
    RETURN NEW;
  END IF;

  -- Fire async HTTP request to edge function
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/handle-ministry-flag-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object(
      'flag_id', NEW.id::text,
      'ministry_id', NEW.ministry_id::text,
      'organization_id', NEW.organization_id::text,
      'flag_type', NEW.flag_type::text,
      'expense_request_id', COALESCE(NEW.expense_request_id::text, ''),
      'created_by_name', NEW.created_by_name,
      'notes', COALESCE(NEW.notes, '')
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER ministry_flag_created_notification
  AFTER INSERT ON budget.ministry_flags
  FOR EACH ROW
  EXECUTE FUNCTION budget.notify_ministry_flag_created();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON budget.ministry_flags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget.ministry_flags TO service_role;
