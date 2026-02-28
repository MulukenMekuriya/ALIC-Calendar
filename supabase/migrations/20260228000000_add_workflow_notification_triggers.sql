-- ============================================================================
-- Migration: Server-Side Workflow Notification Triggers
--
-- Replaces client-side email notifications with database-driven triggers.
-- When expense_requests or allocation_requests status changes, a trigger
-- calls the handle-workflow-notification edge function via pg_net.
--
-- PREREQUISITE: Before running this migration, add these Supabase Vault secrets:
--   SELECT vault.create_secret('https://oyewjuvpnavwhmdiqfve.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('<your-service-role-key>', 'service_role_key');
-- ============================================================================

-- Step 1: Enable pg_net extension for HTTP calls from PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Step 2: Trigger function for expense_requests status changes
CREATE OR REPLACE FUNCTION budget.notify_expense_status_change()
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
    RAISE WARNING 'Vault secrets not configured for workflow notifications';
    RETURN NEW;
  END IF;

  -- Fire async HTTP request to edge function
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/handle-workflow-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object(
      'table', 'expense_requests',
      'record_id', NEW.id::text,
      'old_status', OLD.status::text,
      'new_status', NEW.status::text
    )
  );

  RETURN NEW;
END;
$$;

-- Step 3: Trigger function for allocation_requests status changes
CREATE OR REPLACE FUNCTION budget.notify_allocation_status_change()
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
    RAISE WARNING 'Vault secrets not configured for workflow notifications';
    RETURN NEW;
  END IF;

  -- Fire async HTTP request to edge function
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/handle-workflow-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body := jsonb_build_object(
      'table', 'allocation_requests',
      'record_id', NEW.id::text,
      'old_status', OLD.status::text,
      'new_status', NEW.status::text
    )
  );

  RETURN NEW;
END;
$$;

-- Step 4: Create triggers (only fire when status actually changes)
CREATE TRIGGER expense_status_notification
  AFTER UPDATE ON budget.expense_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION budget.notify_expense_status_change();

CREATE TRIGGER allocation_status_notification
  AFTER UPDATE ON budget.allocation_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION budget.notify_allocation_status_change();
