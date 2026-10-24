-- =====================================================
-- budget.actor_name() is budget.current_actor_name()
-- =====================================================
--
-- 20260322440700 named its "who is acting" helper budget.actor_name(). The
-- generated TypeScript types put every budget function beside the budget
-- tables, and a function called actor_name shadows the actor_name COLUMN of
-- expense_history and allocation_request_history: the generated Row types
-- lost that column and the expense code stopped typechecking. Nothing was
-- wrong at runtime. Renamed so it collides with nothing, and the three step
-- functions that call it are re-created unchanged apart from that call.

CREATE OR REPLACE FUNCTION budget.current_actor_name()
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

REVOKE ALL ON FUNCTION budget.current_actor_name() FROM PUBLIC;

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
     auth.uid(), budget.current_actor_name(), _old, _to, nullif(btrim(_notes), ''));

  RETURN _r;
END;
$$;

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
  SELECT id, 'sent_to_board', auth.uid(), budget.current_actor_name(),
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
     auth.uid(), budget.current_actor_name(), 'board_review', _to, _notes_clean);

  RETURN _r;
END;
$$;

DROP FUNCTION IF EXISTS budget.actor_name();

NOTIFY pgrst, 'reload schema';
