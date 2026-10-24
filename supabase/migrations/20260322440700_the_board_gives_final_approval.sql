-- =====================================================
-- The Leadership Council reviews, the Board gives final approval
-- =====================================================
--
-- Asked for by the finance office on 24 October 2026, and settled by the user
-- the same day:
--
--   Submitted (pending) -> Under Review -> Conditionally Approved
--     -> Sent for Board Review -> Final Approval (approved / partially_approved)
--
--   - The Leadership Council is the branch's admins (the user: "Leadership
--     Council is just admin"). It edits, moves a request to Under Review
--     (automatically, on its first edit), conditionally approves or denies.
--     Admins could already edit any request, so no new edit policy is needed.
--   - The Board gives the FINAL approval, which is the step that credits the
--     ministry's budget_allocations. It can also return a request to the
--     Council, or deny it. This replaces the 26 September design, in which the
--     Board only advised and the office approved.
--   - The Board signs in as one shared login, board@alic.org, holding the
--     'board' tier in each branch. Sending requests to the Board emails
--     board@alic.org once per batch, not once per request.
--
-- Every step is a SECURITY DEFINER function rather than a client-side UPDATE:
-- a board member has no write access to allocation_requests or
-- budget_allocations, final approval has to change both at once, and each
-- function refuses a request that is not at the step it acts on, so two
-- people on the same request cannot credit a ministry twice.
--
-- Needs 20260322440600 (the enum values) committed first.

-- ---------------------------------------------------------------------------
-- 1. 'board' is staff
-- ---------------------------------------------------------------------------
--
-- public.is_staff() is the allowlist every RESTRICTIVE policy from
-- 20260321001600 consults; a tier not in it reaches nothing, not even the
-- ministry list. A board member therefore sees what a contributor sees -
-- calendar, budget, inventory, staff directory - in each branch they hold the
-- tier in. Children's records are module grants, which no tier confers.

CREATE OR REPLACE FUNCTION public.is_staff(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = _organization_id
      AND role IN ('admin', 'contributor', 'treasury', 'finance', 'board')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff_anywhere()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'contributor', 'treasury', 'finance', 'board')
  )
$$;

-- SECURITY DEFINER for the same reason as is_org_admin: it is read from
-- policies, and a policy that reads user_organizations through a plain
-- subquery recurses.
CREATE OR REPLACE FUNCTION public.is_board(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = _organization_id
      AND role = 'board'
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. What the Board says, per request
-- ---------------------------------------------------------------------------
--
-- Comments and a recommended figure, kept alongside the decision. With one
-- shared login this is mostly one row per request, but the table keys on the
-- person so individual board logins work too if the Board ever wants them.

CREATE TABLE IF NOT EXISTS budget.allocation_board_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES budget.allocation_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board_member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_member_name text NOT NULL,
  recommended_amount numeric(12,2),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT allocation_board_feedback_one_per_member UNIQUE (request_id, board_member_id),
  CONSTRAINT allocation_board_feedback_says_something
    CHECK (recommended_amount IS NOT NULL OR nullif(btrim(comment), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_allocation_board_feedback_request
  ON budget.allocation_board_feedback(request_id);
CREATE INDEX IF NOT EXISTS idx_allocation_board_feedback_org
  ON budget.allocation_board_feedback(organization_id);

DROP TRIGGER IF EXISTS update_allocation_board_feedback_updated_at
  ON budget.allocation_board_feedback;
CREATE TRIGGER update_allocation_board_feedback_updated_at
  BEFORE UPDATE ON budget.allocation_board_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE budget.allocation_board_feedback ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON budget.allocation_board_feedback TO authenticated;

-- Read: the Council (admins) and the Board. Not the requesting ministry: what the
-- ministry is owed is the decision, and it gets that in admin_notes.
DROP POLICY IF EXISTS "Office and board can read board feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Office and board can read board feedback"
  ON budget.allocation_board_feedback FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(organization_id) OR public.is_board(organization_id)
  );

DROP POLICY IF EXISTS "Board members write their own feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Board members write their own feedback"
  ON budget.allocation_board_feedback FOR INSERT
  TO authenticated
  WITH CHECK (board_member_id = auth.uid() AND public.is_board(organization_id));

DROP POLICY IF EXISTS "Board members revise their own feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Board members revise their own feedback"
  ON budget.allocation_board_feedback FOR UPDATE
  TO authenticated
  USING (board_member_id = auth.uid() AND public.is_board(organization_id))
  WITH CHECK (board_member_id = auth.uid() AND public.is_board(organization_id));

DROP POLICY IF EXISTS "Board members withdraw their own feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Board members withdraw their own feedback"
  ON budget.allocation_board_feedback FOR DELETE
  TO authenticated
  USING (board_member_id = auth.uid() AND public.is_board(organization_id));

-- ---------------------------------------------------------------------------
-- 3. The steps
-- ---------------------------------------------------------------------------

-- Who is acting, for the history row: the profile name, or the email.
CREATE OR REPLACE FUNCTION budget.actor_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(btrim(p.full_name), ''), u.email, 'Unknown')
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid()
$$;

-- The Leadership Council's decisions on one request.
--
--   'review'      pending -> under_review   (also done by the app on the
--                 Council's first edit)
--   'conditional' pending | under_review -> conditionally_approved
--   'deny'        pending | under_review | conditionally_approved -> denied
--
-- Conditional approval credits nothing: the money is promised only at the
-- Board's final approval.
CREATE OR REPLACE FUNCTION budget.council_decide(
  _request_id uuid,
  _decision text,
  _notes text DEFAULT NULL
)
RETURNS budget.allocation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _r budget.allocation_requests;
  _old budget.allocation_request_status;
  _to budget.allocation_request_status;
  _from budget.allocation_request_status[];
BEGIN
  SELECT * INTO _r FROM budget.allocation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That budget request does not exist.' USING ERRCODE = 'no_data_found';
  END IF;
  _old := _r.status;

  IF NOT public.is_org_admin(_r.organization_id) THEN
    RAISE EXCEPTION 'Only the Leadership Council (an admin of this branch) can do this.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  CASE _decision
    WHEN 'review' THEN
      _to := 'under_review';
      _from := ARRAY['pending']::budget.allocation_request_status[];
    WHEN 'conditional' THEN
      _to := 'conditionally_approved';
      _from := ARRAY['pending', 'under_review']::budget.allocation_request_status[];
    WHEN 'deny' THEN
      _to := 'denied';
      _from := ARRAY['pending', 'under_review', 'conditionally_approved']::budget.allocation_request_status[];
      IF nullif(btrim(_notes), '') IS NULL THEN
        RAISE EXCEPTION 'Give the ministry a reason for the denial.' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown decision "%".', _decision USING ERRCODE = 'invalid_parameter_value';
  END CASE;

  IF NOT (_old = ANY (_from)) THEN
    RAISE EXCEPTION 'This request is % now, so it cannot be moved that way. Refresh to see where it is.',
      replace(_old::text, '_', ' ')
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE budget.allocation_requests
  SET status = _to,
      admin_notes = CASE WHEN nullif(btrim(_notes), '') IS NULL THEN admin_notes ELSE btrim(_notes) END,
      reviewed_by = CASE WHEN _to = 'under_review' THEN reviewed_by ELSE auth.uid() END,
      reviewed_at = CASE WHEN _to = 'under_review' THEN reviewed_at ELSE now() END
  WHERE id = _request_id
  RETURNING * INTO _r;

  INSERT INTO budget.allocation_request_history
    (request_id, action, actor_id, actor_name, old_status, new_status, notes)
  VALUES
    (_request_id,
     CASE _decision WHEN 'review' THEN 'review_started'
                    WHEN 'conditional' THEN 'conditionally_approved'
                    ELSE 'denied' END,
     auth.uid(), budget.actor_name(), _old, _to, nullif(btrim(_notes), ''));

  RETURN _r;
END;
$$;

-- Send conditionally approved requests to the Board, one or many.
--
-- Returns how many moved; a request no longer conditionally approved, or in a
-- branch this admin does not run, is skipped rather than failing the batch.
-- One email to board@alic.org for the whole batch: the per-row status trigger
-- still fires, and handle-workflow-notification sends nothing for a single
-- request reaching 'board_review'.
CREATE OR REPLACE FUNCTION budget.send_to_board(_request_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _moved uuid[];
  _supabase_url text;
  _service_role_key text;
BEGIN
  WITH moved AS (
    UPDATE budget.allocation_requests ar
    SET status = 'board_review'
    WHERE ar.id = ANY (_request_ids)
      AND ar.status = 'conditionally_approved'
      AND public.is_org_admin(ar.organization_id)
    RETURNING ar.id
  )
  SELECT array_agg(id) INTO _moved FROM moved;

  IF _moved IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO budget.allocation_request_history
    (request_id, action, actor_id, actor_name, old_status, new_status)
  SELECT id, 'sent_to_board', auth.uid(), budget.actor_name(),
         'conditionally_approved', 'board_review'
  FROM unnest(_moved) AS id;

  SELECT decrypted_secret INTO _supabase_url
  FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _service_role_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF _supabase_url IS NOT NULL AND _service_role_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := _supabase_url || '/functions/v1/handle-workflow-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      ),
      body := jsonb_build_object(
        'table', 'allocation_requests',
        'kind', 'sent_to_board',
        'record_ids', to_jsonb(_moved),
        'new_status', 'board_review'
      )
    );
  END IF;

  RETURN coalesce(array_length(_moved, 1), 0);
END;
$$;

-- The Board's decision on one request.
--
--   'approve'  board_review -> approved (or partially_approved, below the ask)
--              and the amount is ADDED to the ministry's budget_allocations
--              row for the year, exactly as office approval used to do.
--   'return'   board_review -> under_review, back to the Council with notes.
--   'deny'     board_review -> denied.
--
-- An admin of the branch may act for the Board, so the year cannot stall if
-- board@alic.org is not set up yet; the history row names who did it.
CREATE OR REPLACE FUNCTION budget.board_decide(
  _request_id uuid,
  _decision text,
  _approved_amount numeric DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS budget.allocation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _r budget.allocation_requests;
  _to budget.allocation_request_status;
  _amount numeric;
  _notes_clean text := nullif(btrim(_notes), '');
BEGIN
  SELECT * INTO _r FROM budget.allocation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That budget request does not exist.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (public.is_board(_r.organization_id) OR public.is_org_admin(_r.organization_id)) THEN
    RAISE EXCEPTION 'Only the Board can give final approval.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _r.status <> 'board_review' THEN
    RAISE EXCEPTION 'This request is % now, not with the Board. Refresh to see where it is.',
      replace(_r.status::text, '_', ' ')
      USING ERRCODE = 'check_violation';
  END IF;

  IF _decision = 'approve' THEN
    _amount := coalesce(_approved_amount, _r.requested_amount);
    IF _amount <= 0 THEN
      RAISE EXCEPTION 'The approved amount must be more than $0.' USING ERRCODE = 'check_violation';
    END IF;
    _to := CASE WHEN _amount = _r.requested_amount THEN 'approved' ELSE 'partially_approved' END;

    UPDATE budget.allocation_requests
    SET status = _to, approved_amount = _amount,
        admin_notes = coalesce(_notes_clean, admin_notes),
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _request_id
    RETURNING * INTO _r;

    UPDATE budget.budget_allocations
    SET allocated_amount = allocated_amount + _amount,
        approved_by = auth.uid(), approved_at = now(),
        notes = coalesce(_notes_clean || ' ', '') || format('(Board added $%s)', to_char(_amount, 'FM999,999,990.00'))
    WHERE ministry_id = _r.ministry_id AND fiscal_year_id = _r.fiscal_year_id;

    IF NOT FOUND THEN
      INSERT INTO budget.budget_allocations
        (organization_id, ministry_id, fiscal_year_id, allocated_amount, approved_by, approved_at, notes)
      VALUES
        (_r.organization_id, _r.ministry_id, _r.fiscal_year_id, _amount, auth.uid(), now(), _notes_clean);
    END IF;

  ELSIF _decision = 'return' THEN
    IF _notes_clean IS NULL THEN
      RAISE EXCEPTION 'Tell the Leadership Council what to look at again.' USING ERRCODE = 'check_violation';
    END IF;
    _to := 'under_review';
    UPDATE budget.allocation_requests
    SET status = _to, admin_notes = _notes_clean
    WHERE id = _request_id
    RETURNING * INTO _r;

  ELSIF _decision = 'deny' THEN
    IF _notes_clean IS NULL THEN
      RAISE EXCEPTION 'Give the ministry a reason for the denial.' USING ERRCODE = 'check_violation';
    END IF;
    _to := 'denied';
    UPDATE budget.allocation_requests
    SET status = _to, admin_notes = _notes_clean,
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _request_id
    RETURNING * INTO _r;

  ELSE
    RAISE EXCEPTION 'Unknown decision "%".', _decision USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO budget.allocation_request_history
    (request_id, action, actor_id, actor_name, old_status, new_status, notes)
  VALUES
    (_request_id,
     CASE _decision WHEN 'approve' THEN 'board_approved'
                    WHEN 'return' THEN 'returned_to_council'
                    ELSE 'board_denied' END,
     auth.uid(), budget.actor_name(), 'board_review', _to, _notes_clean);

  RETURN _r;
END;
$$;

REVOKE ALL ON FUNCTION budget.council_decide(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION budget.send_to_board(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION budget.board_decide(uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION budget.actor_name() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION budget.council_decide(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION budget.send_to_board(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION budget.board_decide(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_board(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
