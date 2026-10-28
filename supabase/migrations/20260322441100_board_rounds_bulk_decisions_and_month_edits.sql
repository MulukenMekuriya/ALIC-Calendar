-- =====================================================
-- Board rounds, bulk Board decisions, month edits, and the Board's totals
-- =====================================================
--
-- The finance office's review runs in rounds:
--
--   local leaders preliminary review -> Board preliminary review ->
--   local leaders updated review -> final Board review and approval
--
-- No new statuses. A request carries board_round, the number of times its
-- branch's admins have sent it to the Board. Round 0 is the leaders' first
-- review; board_review at round 1 is the Board's preliminary review; back with
-- the leaders at round >= 1 is the updated review; board_review at round >= 2
-- is the final one. The Board may give final approval in any round.
--
-- What this adds:
--
--   1. board_round, and the Board's feedback kept per round, written only
--      while a request is with the Board, with its branch and round taken from
--      the request rather than from whatever the browser sent.
--   2. send_to_board counts the round.
--   3. board_decide_many: the Board's bulk "Final approval" / "Send back".
--      Approving credits the ministry's budget exactly as asked (the Board
--      never changes a number) with an upsert, so two approvals landing
--      together cannot collide on the first credit.
--   4. edit_request_month: a local leader changes one month of a request. The
--      totals are recomputed here, not in the browser, and a stale edit is
--      refused.
--   5. ministry_budget_summary: approved budget against what has been paid,
--      by ministry, for every branch the caller works in. Totals only: the
--      Board cannot read other people's expenses, and does not need to.
--
-- Notes on ordering. The edge function handle-workflow-notification must know
-- the kinds 'board_returned' and 'board_approved' before this is applied,
-- because board_decide_many posts them. The old unique key on the feedback
-- table is kept until the old Board screen is gone (it upserts on it).

-- ---------------------------------------------------------------------------
-- 1. Rounds
-- ---------------------------------------------------------------------------

ALTER TABLE budget.allocation_requests
  ADD COLUMN IF NOT EXISTS board_round SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE budget.allocation_requests
  ADD CONSTRAINT chk_allocation_request_board_round CHECK (board_round BETWEEN 0 AND 9);

ALTER TABLE budget.allocation_board_feedback
  ADD COLUMN IF NOT EXISTS round SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE budget.allocation_board_feedback
  ADD CONSTRAINT chk_board_feedback_amount_not_negative
  CHECK (recommended_amount IS NULL OR recommended_amount >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS allocation_board_feedback_one_per_member_round
  ON budget.allocation_board_feedback (request_id, board_member_id, round);

-- Feedback is for a request that is with the Board, in the round it is in. The
-- branch and round come from the request: a client cannot file feedback on a
-- pending request, in another branch, or in a round that is not this one.
CREATE OR REPLACE FUNCTION budget.board_feedback_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _r budget.allocation_requests;
BEGIN
  SELECT * INTO _r FROM budget.allocation_requests WHERE id = NEW.request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That budget request does not exist.' USING ERRCODE = 'no_data_found';
  END IF;

  IF _r.status <> 'board_review' THEN
    RAISE EXCEPTION 'Feedback can only be given while a request is with the Board.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.organization_id := _r.organization_id;
  NEW.round := _r.board_round;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_feedback_guard ON budget.allocation_board_feedback;
CREATE TRIGGER board_feedback_guard
  BEFORE INSERT OR UPDATE ON budget.allocation_board_feedback
  FOR EACH ROW EXECUTE FUNCTION budget.board_feedback_guard();

-- ---------------------------------------------------------------------------
-- 2. send_to_board counts the round
-- ---------------------------------------------------------------------------

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
    SET status = 'board_review',
        board_round = ar.board_round + 1
    WHERE ar.id = ANY (_request_ids)
      AND ar.status = 'conditionally_approved'
      AND ar.board_round < 9
      AND public.is_org_admin(ar.organization_id)
    RETURNING ar.id, ar.board_round
  ), logged AS (
    INSERT INTO budget.allocation_request_history
      (request_id, action, actor_id, actor_name, old_status, new_status, notes)
    SELECT id, 'sent_to_board', auth.uid(), budget.current_actor_name(),
           'conditionally_approved', 'board_review', format('Round %s', board_round)
    FROM moved
    RETURNING request_id
  )
  SELECT array_agg(id) INTO _moved FROM moved;

  IF _moved IS NULL THEN
    RETURN 0;
  END IF;

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

-- ---------------------------------------------------------------------------
-- 3. The Board's bulk decision
-- ---------------------------------------------------------------------------
--
--   'approve'  board_review -> approved, for exactly requested_amount, and the
--              ministry's budget for the year is credited with it.
--   'return'   board_review -> under_review, a note required. The note goes in
--              the history, not admin_notes, which the requesting ministry
--              reads: the Board's conversation is with the local leaders.
--
-- A request that is not with the Board, or whose branch the caller is not on
-- the Board of, is skipped with its reason and the rest go ahead.

CREATE OR REPLACE FUNCTION budget.board_decide_many(
  _request_ids uuid[],
  _decision text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _note text := nullif(btrim(_notes), '');
  _r budget.allocation_requests;
  _moved uuid[] := '{}';
  _skipped jsonb := '[]'::jsonb;
  _supabase_url text;
  _service_role_key text;
  _missing uuid;
BEGIN
  IF _decision NOT IN ('approve', 'return') THEN
    RAISE EXCEPTION 'Choose approve or return.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF _decision = 'return' AND _note IS NULL THEN
    RAISE EXCEPTION 'Tell the local leaders what to look at again.'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR _r IN
    SELECT * FROM budget.allocation_requests
    WHERE id = ANY (_request_ids)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF NOT public.is_board(_r.organization_id) THEN
      _skipped := _skipped || jsonb_build_object(
        'id', _r.id, 'reason', 'You are not on the Board of that branch.');
      CONTINUE;
    END IF;

    IF _r.status <> 'board_review' THEN
      _skipped := _skipped || jsonb_build_object(
        'id', _r.id,
        'reason', format('It is %s now, not with the Board.', replace(_r.status::text, '_', ' ')));
      CONTINUE;
    END IF;

    IF _decision = 'approve' THEN
      UPDATE budget.allocation_requests
      SET status = 'approved',
          approved_amount = requested_amount,
          reviewed_by = auth.uid(),
          reviewed_at = now()
      WHERE id = _r.id;

      INSERT INTO budget.budget_allocations
        (organization_id, ministry_id, fiscal_year_id, allocated_amount,
         approved_by, approved_at, notes)
      VALUES
        (_r.organization_id, _r.ministry_id, _r.fiscal_year_id, _r.requested_amount,
         auth.uid(), now(),
         format('Board approved $%s', budget.money_text(_r.requested_amount)))
      ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE
      SET allocated_amount = budget.budget_allocations.allocated_amount + EXCLUDED.allocated_amount,
          approved_by = EXCLUDED.approved_by,
          approved_at = EXCLUDED.approved_at,
          notes = EXCLUDED.notes;
    ELSE
      UPDATE budget.allocation_requests
      SET status = 'under_review'
      WHERE id = _r.id;
    END IF;

    INSERT INTO budget.allocation_request_history
      (request_id, action, actor_id, actor_name, old_status, new_status, notes)
    VALUES
      (_r.id,
       CASE _decision WHEN 'approve' THEN 'board_approved' ELSE 'returned_to_council' END,
       auth.uid(), budget.current_actor_name(), 'board_review',
       (CASE _decision WHEN 'approve' THEN 'approved' ELSE 'under_review' END)::budget.allocation_request_status,
       _note);

    _moved := _moved || _r.id;
  END LOOP;

  -- Ids that match no request at all.
  FOR _missing IN
    SELECT u FROM unnest(_request_ids) u
    WHERE NOT EXISTS (SELECT 1 FROM budget.allocation_requests a WHERE a.id = u)
  LOOP
    _skipped := _skipped || jsonb_build_object(
      'id', _missing, 'reason', 'That budget request does not exist.');
  END LOOP;

  -- One digest to the branch admins for the whole batch.
  IF coalesce(array_length(_moved, 1), 0) > 0 THEN
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
          'kind', CASE _decision WHEN 'approve' THEN 'board_approved' ELSE 'board_returned' END,
          'record_ids', to_jsonb(_moved),
          'new_status', CASE _decision WHEN 'approve' THEN 'approved' ELSE 'under_review' END,
          'note', _note
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('moved', coalesce(array_length(_moved, 1), 0), 'skipped', _skipped);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. A local leader edits one month of a request
-- ---------------------------------------------------------------------------
--
-- _amounts is a JSON array of { "index": <position in budget_breakdown>,
-- "amount": <dollars for this month> }, one per line to change. Position, not
-- a name, because two lines can share a justification.
--
-- Everything that follows from the new figures is recomputed here: the line's
-- own total, the request's amount, and the one-line summary the lists show.
-- _expected_updated_at is the updated_at the screen was drawn from; if someone
-- else has changed the request since, the edit is refused rather than
-- silently overwriting theirs.
--
-- Editing a request that was ready for the Board takes it back to under
-- review: it is no longer the thing that was approved.

CREATE OR REPLACE FUNCTION budget.money_text(_amount numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(to_char(_amount, 'FM999,999,999,990.00'), '\.00$', '')
$$;

CREATE OR REPLACE FUNCTION budget.edit_request_month(
  _request_id uuid,
  _month text,
  _amounts jsonb,
  _expected_updated_at timestamptz DEFAULT NULL
)
RETURNS budget.allocation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _months CONSTANT text[] := ARRAY['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  _r budget.allocation_requests;
  _len integer;
  _i integer;
  _el jsonb;
  _md jsonb;
  _edit jsonb;
  _amt numeric;
  _old numeric;
  _item_total numeric;
  _total numeric := 0;
  _new jsonb := '[]'::jsonb;
  _changes text[] := '{}';
  _just text;
  _to budget.allocation_request_status;
  _from budget.allocation_request_status;
BEGIN
  IF _month IS NULL OR NOT (_month = ANY (_months)) THEN
    RAISE EXCEPTION 'Choose a month: jan to dec.' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF _amounts IS NULL OR jsonb_typeof(_amounts) <> 'array' THEN
    RAISE EXCEPTION 'Send the amounts as a list.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO _r FROM budget.allocation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That budget request does not exist.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_org_admin(_r.organization_id) THEN
    RAISE EXCEPTION 'Only the local leaders (an admin of this branch) can edit a request.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _r.status NOT IN ('pending', 'under_review', 'conditionally_approved') THEN
    RAISE EXCEPTION 'This request is % now, so it cannot be edited.',
      replace(_r.status::text, '_', ' ')
      USING ERRCODE = 'check_violation';
  END IF;

  IF _r.period_type <> 'monthly' THEN
    RAISE EXCEPTION 'Only a monthly request has months to edit.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _expected_updated_at IS NOT NULL AND _r.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'This request changed while you were editing it. Reload and try again.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  _len := jsonb_array_length(coalesce(_r.budget_breakdown, '[]'::jsonb));

  FOR _edit IN SELECT * FROM jsonb_array_elements(_amounts) LOOP
    IF (_edit->>'index') IS NULL OR (_edit->>'amount') IS NULL
       OR (_edit->>'index')::integer NOT BETWEEN 0 AND _len - 1 THEN
      RAISE EXCEPTION 'An amount named a line this request does not have.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF (_edit->>'amount')::numeric < 0 THEN
      RAISE EXCEPTION 'An amount cannot be below $0.' USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  FOR _i IN 0 .. _len - 1 LOOP
    _el := _r.budget_breakdown -> _i;

    SELECT e INTO _edit
    FROM jsonb_array_elements(_amounts) e
    WHERE (e->>'index')::integer = _i
    LIMIT 1;

    IF _el->>'category' = 'monthly_budget_item' THEN
      _md := coalesce(_el->'monthly_data', '{}'::jsonb);

      IF _edit IS NOT NULL THEN
        _amt := round((_edit->>'amount')::numeric, 2);
        _old := coalesce(nullif(_md->>_month, '')::numeric, 0);
        IF _amt <> _old THEN
          _changes := _changes || format('%s, %s: $%s to $%s',
            initcap(_month), left(coalesce(_el->>'description', ''), 40),
            budget.money_text(_old), budget.money_text(_amt));
        END IF;
        -- A month with nothing in it is left out, as the seeded budgets have it.
        IF _amt = 0 THEN
          _md := _md - _month;
        ELSE
          _md := jsonb_set(_md, ARRAY[_month], to_jsonb(_amt));
        END IF;
      END IF;

      SELECT coalesce(sum(coalesce(nullif(_md->>m, '')::numeric, 0)), 0)
        INTO _item_total FROM unnest(_months) m;

      _el := jsonb_set(jsonb_set(_el, '{monthly_data}', _md), '{amount}', to_jsonb(_item_total));
      _total := _total + _item_total;
    ELSIF _edit IS NOT NULL THEN
      RAISE EXCEPTION 'Line % is not a monthly line.', _i
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    _new := _new || jsonb_build_array(_el);
  END LOOP;

  -- Nothing changed: nothing to write, and no reason to move the request.
  IF coalesce(array_length(_changes, 1), 0) = 0 THEN
    RETURN _r;
  END IF;

  IF _total <= 0 THEN
    RAISE EXCEPTION 'A request must keep an amount above $0. Deny it instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(string_agg(
           coalesce(el->>'description', '') || ': $' || budget.money_text((el->>'amount')::numeric),
           '; ' ORDER BY ord), 'Monthly budget request')
    INTO _just
  FROM jsonb_array_elements(_new) WITH ORDINALITY AS t(el, ord)
  WHERE el->>'category' = 'monthly_budget_item';

  _from := _r.status;
  _to := CASE WHEN _r.status IN ('pending', 'conditionally_approved')
              THEN 'under_review' ELSE _r.status END;

  UPDATE budget.allocation_requests
  SET budget_breakdown = _new,
      requested_amount = _total,
      justification = _just,
      status = _to
  WHERE id = _request_id
  RETURNING * INTO _r;

  INSERT INTO budget.allocation_request_history
    (request_id, action, actor_id, actor_name, old_status, new_status, notes)
  VALUES
    (_request_id, 'month_edited', auth.uid(), budget.current_actor_name(),
     _from, _r.status,
     array_to_string(_changes, '; '));

  RETURN _r;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Approved budget against what has been paid, by ministry
-- ---------------------------------------------------------------------------
--
-- For every branch where the caller is admin, treasury, finance or Board, for
-- the budget year with this number. "Paid" is status 'completed', as on the
-- Home screen's Ministry Summary (utils/ministryBudget.ts PAID_STATUSES).
--
-- Totals only. The Board can read budgets but not other people's expenses
-- (rightly), so the Home screen's way of working this out in the browser
-- would show it $0 spent. A row per ministry per branch is all it is given:
-- no expense, no payee, no payment reference.

CREATE OR REPLACE FUNCTION budget.ministry_budget_summary(_year integer)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  ministry_id uuid,
  ministry_name text,
  approved numeric,
  spent numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = budget, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role IN ('admin', 'treasury', 'finance', 'board')
  ) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH orgs AS (
    SELECT DISTINCT uo.organization_id AS org_id, o.name AS org_name
    FROM public.user_organizations uo
    JOIN public.organizations o ON o.id = uo.organization_id
    WHERE uo.user_id = auth.uid()
      AND uo.role IN ('admin', 'treasury', 'finance', 'board')
  ),
  fys AS (
    SELECT f.id AS fy_id, f.organization_id AS org_id
    FROM budget.fiscal_years f
    JOIN orgs ON orgs.org_id = f.organization_id
    WHERE f.year = _year
  ),
  a AS (
    SELECT ba.organization_id AS org_id, ba.ministry_id AS m_id,
           sum(ba.allocated_amount) AS approved
    FROM budget.budget_allocations ba
    JOIN fys ON fys.fy_id = ba.fiscal_year_id
    GROUP BY ba.organization_id, ba.ministry_id
  ),
  s AS (
    SELECT e.organization_id AS org_id, e.ministry_id AS m_id,
           sum(e.amount) AS spent
    FROM budget.expense_requests e
    JOIN fys ON fys.fy_id = e.fiscal_year_id
    WHERE e.status = 'completed'
    GROUP BY e.organization_id, e.ministry_id
  )
  SELECT orgs.org_id, orgs.org_name, m.id, m.name,
         coalesce(a.approved, 0), coalesce(s.spent, 0)
  FROM orgs
  JOIN budget.ministries m ON m.organization_id = orgs.org_id
  LEFT JOIN a ON a.org_id = orgs.org_id AND a.m_id = m.id
  LEFT JOIN s ON s.org_id = orgs.org_id AND s.m_id = m.id
  WHERE a.m_id IS NOT NULL OR s.m_id IS NOT NULL
  ORDER BY orgs.org_name, coalesce(a.approved, 0) DESC, m.name;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION budget.board_feedback_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION budget.board_decide_many(uuid[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION budget.edit_request_month(uuid, text, jsonb, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION budget.ministry_budget_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget.board_decide_many(uuid[], text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION budget.edit_request_month(uuid, text, jsonb, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION budget.ministry_budget_summary(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION budget.money_text(numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
