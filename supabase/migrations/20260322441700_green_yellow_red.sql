-- =====================================================
-- Green, Yellow and Red
-- =====================================================
--
-- The Board's directive for the 2027 budget (November 2026): giving will not
-- cover every request the church agrees with, so the money asked for is
-- marked three ways:
--
--   Green   approved. Only Green can be spent; the ministry's budget is
--           credited with it at the Board's final approval.
--   Yellow  justified, but waiting on giving and available funds. A reason is
--           required.
--   Red     denied. A reason is optional.
--
-- Decided with the leaders (21 November 2026):
--
--   * Each line item in each month is marked on its own, in dollars: a cell
--     ("Retreat venue", March, $1,000) can be $600 Green, $400 Yellow, $0 Red.
--     Cells not marked are Green. An annual request (no months) is one cell.
--   * The Leadership Council (branch admins) marks, when it conditionally
--     approves, and can re-mark until it sends the request to the Board.
--   * The Board does not mark. It gives final approval to the marking as it
--     stands, or sends the request back to the local leaders to change it.
--   * Later, as giving allows, the local leaders move Yellow money to Green
--     (credited then) or to Red, for one request or for several at once.
--     Yellow not moved stays Yellow, year end included.
--   * The requesting ministry sees all three amounts and the Yellow reason.
--
-- Storage: split_cells is the marking, one entry per line and month,
--   { "index": <line in budget_breakdown>, "month": "mar", "amount": 1000,
--     "green": 600, "yellow": 400 }
-- (red is amount - green - yellow). green_amount and yellow_amount are its
-- sums, kept by a trigger, for the totals and the credit. An annual request
-- has no cells and green/yellow are set directly.
--
-- No new status. After the Board: all Green is 'approved', nothing Green and
-- nothing Yellow is 'denied', anything else is 'partially_approved'. "Waiting
-- on giving" is yellow_amount > 0 on a decided request. approved_amount stays
-- equal to green_amount once decided, so the recall and its readers work.

-- ---------------------------------------------------------------------------
-- 1. The marking
-- ---------------------------------------------------------------------------

ALTER TABLE budget.allocation_requests
  ADD COLUMN IF NOT EXISTS green_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS yellow_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS yellow_reason TEXT,
  ADD COLUMN IF NOT EXISTS split_cells JSONB;

COMMENT ON COLUMN budget.allocation_requests.green_amount IS
  'Green: approved. Sum of split_cells green where there are cells. Red is requested_amount - green - yellow.';
COMMENT ON COLUMN budget.allocation_requests.yellow_amount IS
  'Yellow: justified, waiting on giving. Moved to Green or Red later by budget.release_yellow.';
COMMENT ON COLUMN budget.allocation_requests.yellow_reason IS
  'Why money is Yellow. Required whenever yellow_amount > 0. The ministry reads it.';
COMMENT ON COLUMN budget.allocation_requests.split_cells IS
  'The marking per line and month: [{index, month, amount, green, yellow}]. Null for an annual request or one not marked.';

-- Backfill before the constraints. No status changes, so no email; with no
-- signed-in user the season lock and the requester guard stand aside; and the
-- freeze below is replaced only after this, so board_review rows take it too.

-- Decided: what was approved is Green, nothing is Yellow.
UPDATE budget.allocation_requests
SET green_amount = least(coalesce(approved_amount, requested_amount), requested_amount),
    yellow_amount = 0
WHERE status IN ('approved', 'partially_approved');

UPDATE budget.allocation_requests
SET green_amount = 0, yellow_amount = 0
WHERE status = 'denied';

-- Already conditionally approved or with the Board: all Green until the
-- local leaders re-mark it (the Board can send it back to them for that).
UPDATE budget.allocation_requests
SET green_amount = requested_amount, yellow_amount = 0
WHERE status IN ('conditionally_approved', 'board_review');

ALTER TABLE budget.allocation_requests
  DROP CONSTRAINT IF EXISTS chk_allocation_request_split;
ALTER TABLE budget.allocation_requests
  ADD CONSTRAINT chk_allocation_request_split CHECK (
    (green_amount IS NULL AND yellow_amount IS NULL)
    OR (green_amount >= 0 AND yellow_amount >= 0
        AND green_amount + yellow_amount <= requested_amount)
  );

ALTER TABLE budget.allocation_requests
  DROP CONSTRAINT IF EXISTS chk_allocation_request_yellow_reason;
ALTER TABLE budget.allocation_requests
  ADD CONSTRAINT chk_allocation_request_yellow_reason CHECK (
    coalesce(yellow_amount, 0) = 0 OR nullif(btrim(yellow_reason), '') IS NOT NULL
  );

-- The cells a monthly request has: every line and month with money in it.
CREATE OR REPLACE FUNCTION budget.request_cells(_breakdown JSONB)
RETURNS TABLE (idx INTEGER, month TEXT, amount NUMERIC)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (t.ord - 1)::integer, m.month, round(nullif(t.el->'monthly_data'->>m.month, '')::numeric, 2)
  FROM jsonb_array_elements(coalesce(_breakdown, '[]'::jsonb)) WITH ORDINALITY AS t(el, ord)
  CROSS JOIN unnest(ARRAY['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'])
       WITH ORDINALITY AS m(month, mo)
  WHERE t.el->>'category' = 'monthly_budget_item'
    AND coalesce(nullif(t.el->'monthly_data'->>m.month, '')::numeric, 0) > 0
  ORDER BY t.ord, m.mo
$$;

-- A marking checked against the request's cells. Every cell is returned; one
-- not mentioned is all Green. A mention of a cell the request does not have,
-- or amounts that do not fit the cell, is refused.
CREATE OR REPLACE FUNCTION budget.checked_cells(_breakdown JSONB, _marks JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _m JSONB;
  _c RECORD;
  _g NUMERIC;
  _y NUMERIC;
  _out JSONB := '[]'::jsonb;
BEGIN
  IF _marks IS NOT NULL AND jsonb_typeof(_marks) <> 'array' THEN
    RAISE EXCEPTION 'The marking must be a list of cells.' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR _m IN SELECT e FROM jsonb_array_elements(coalesce(_marks, '[]'::jsonb)) e LOOP
    IF NOT EXISTS (SELECT 1 FROM budget.request_cells(_breakdown) c
                   WHERE c.idx = (_m->>'index')::integer AND c.month = _m->>'month') THEN
      RAISE EXCEPTION 'A mark names a line and month this request has no money in (% %).',
        _m->>'index', _m->>'month'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END LOOP;

  FOR _c IN SELECT * FROM budget.request_cells(_breakdown) LOOP
    SELECT e INTO _m FROM jsonb_array_elements(coalesce(_marks, '[]'::jsonb)) e
     WHERE (e->>'index')::integer = _c.idx AND e->>'month' = _c.month
     LIMIT 1;
    IF _m IS NULL THEN
      _g := _c.amount; _y := 0;
    ELSE
      _g := round(coalesce((_m->>'green')::numeric, 0), 2);
      _y := round(coalesce((_m->>'yellow')::numeric, 0), 2);
    END IF;
    IF _g < 0 OR _y < 0 THEN
      RAISE EXCEPTION 'Green and Yellow cannot be less than $0.' USING ERRCODE = 'check_violation';
    END IF;
    IF _g + _y > _c.amount THEN
      RAISE EXCEPTION 'Green and Yellow ($%) are more than the $% in % of line %.',
        budget.money_text(_g + _y), budget.money_text(_c.amount), initcap(_c.month), _c.idx + 1
        USING ERRCODE = 'check_violation';
    END IF;
    _out := _out || jsonb_build_object('index', _c.idx, 'month', _c.month, 'amount', _c.amount,
                                       'green', _g, 'yellow', _y);
    _m := NULL;
  END LOOP;

  RETURN _out;
END;
$$;

-- Green and Yellow are the sums of the cells, whoever writes them.
CREATE OR REPLACE FUNCTION budget.allocation_request_split_sums()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = budget, public
AS $$
BEGIN
  IF NEW.split_cells IS NOT NULL THEN
    SELECT coalesce(sum((c->>'green')::numeric), 0), coalesce(sum((c->>'yellow')::numeric), 0)
      INTO NEW.green_amount, NEW.yellow_amount
    FROM jsonb_array_elements(NEW.split_cells) c;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocation_request_split_sums ON budget.allocation_requests;
-- After allocation_request_freeze (alphabetical), which may clear the cells.
CREATE TRIGGER allocation_request_split_sums
  BEFORE INSERT OR UPDATE ON budget.allocation_requests
  FOR EACH ROW EXECUTE FUNCTION budget.allocation_request_split_sums();

-- The status a decided split puts a request in.
CREATE OR REPLACE FUNCTION budget.split_status(_requested NUMERIC, _green NUMERIC, _yellow NUMERIC)
RETURNS budget.allocation_request_status
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE
    WHEN _green >= _requested THEN 'approved'
    WHEN _green = 0 AND _yellow = 0 THEN 'denied'
    ELSE 'partially_approved'
  END)::budget.allocation_request_status
$$;

-- "Green $800 · Yellow $400 · Red $0", for history lines and notes.
CREATE OR REPLACE FUNCTION budget.split_text(_requested NUMERIC, _green NUMERIC, _yellow NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT format('Green $%s · Yellow $%s · Red $%s',
                budget.money_text(_green), budget.money_text(_yellow),
                budget.money_text(_requested - _green - _yellow))
$$;

-- Credit the ministry's budget for the year. Nothing to do for $0.
CREATE OR REPLACE FUNCTION budget.credit_green(_r budget.allocation_requests, _amount NUMERIC, _note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
BEGIN
  IF coalesce(_amount, 0) <= 0 THEN
    RETURN;
  END IF;

  INSERT INTO budget.budget_allocations
    (organization_id, ministry_id, fiscal_year_id, allocated_amount, approved_by, approved_at, notes)
  VALUES
    (_r.organization_id, _r.ministry_id, _r.fiscal_year_id, _amount, auth.uid(), now(), _note)
  ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE
  SET allocated_amount = budget.budget_allocations.allocated_amount + EXCLUDED.allocated_amount,
      approved_by = EXCLUDED.approved_by,
      approved_at = EXCLUDED.approved_at,
      notes = EXCLUDED.notes;
END;
$$;

REVOKE ALL ON FUNCTION budget.credit_green(budget.allocation_requests, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The local leaders mark
-- ---------------------------------------------------------------------------
--
-- 'conditional' with:
--   _cells   a monthly request's marking, [{index, month, green, yellow}];
--            cells left out are Green.
--   _green / _yellow  an annual request's (one cell, in dollars).
--   Nothing given: all Green, as before.
-- Yellow needs _yellow_reason. _notes is the optional word on the rest (Red
-- included), which the ministry reads. Something must be Green or Yellow; all
-- Red is 'deny'. A conditionally approved request can be re-marked.

DROP FUNCTION IF EXISTS budget.council_decide(uuid, text, text);

CREATE OR REPLACE FUNCTION budget.council_decide(
  _request_id uuid,
  _decision text,
  _notes text DEFAULT NULL,
  _green numeric DEFAULT NULL,
  _yellow numeric DEFAULT NULL,
  _yellow_reason text DEFAULT NULL,
  _cells jsonb DEFAULT NULL
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
  _g numeric;
  _y numeric;
  _marking jsonb;
  _has_cells boolean;
  _reason text := nullif(btrim(_yellow_reason), '');
  _note text := nullif(btrim(_notes), '');
  _history text;
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
      _from := ARRAY['pending', 'under_review', 'conditionally_approved']::budget.allocation_request_status[];
    WHEN 'deny' THEN
      _to := 'denied';
      _from := ARRAY['pending', 'under_review', 'conditionally_approved']::budget.allocation_request_status[];
      IF _note IS NULL THEN
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

  IF _decision = 'conditional' THEN
    _has_cells := EXISTS (SELECT 1 FROM budget.request_cells(_r.budget_breakdown));

    IF _has_cells THEN
      IF _cells IS NULL AND (_green IS NOT NULL OR _yellow IS NOT NULL) THEN
        RAISE EXCEPTION 'A monthly request is marked line by line, month by month.'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      _marking := budget.checked_cells(_r.budget_breakdown, _cells);
      SELECT coalesce(sum((c->>'green')::numeric), 0), coalesce(sum((c->>'yellow')::numeric), 0)
        INTO _g, _y FROM jsonb_array_elements(_marking) c;
    ELSE
      IF _cells IS NOT NULL THEN
        RAISE EXCEPTION 'This request has no months to mark; give Green and Yellow in dollars.'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      _y := round(coalesce(_yellow, 0), 2);
      _g := round(coalesce(_green, _r.requested_amount - _y), 2);
      IF _g < 0 OR _y < 0 THEN
        RAISE EXCEPTION 'Green and Yellow cannot be less than $0.' USING ERRCODE = 'check_violation';
      END IF;
      IF _g + _y > _r.requested_amount THEN
        RAISE EXCEPTION 'Green and Yellow together ($%) are more than the $% requested.',
          budget.money_text(_g + _y), budget.money_text(_r.requested_amount)
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF _g + _y = 0 THEN
      RAISE EXCEPTION 'Nothing is Green or Yellow. To refuse the whole request, deny it.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF _y > 0 AND _reason IS NULL THEN
      RAISE EXCEPTION 'Give a reason for the Yellow amount.' USING ERRCODE = 'check_violation';
    END IF;
    _history := budget.split_text(_r.requested_amount, _g, _y)
             || CASE WHEN _y > 0 THEN '. Yellow: ' || _reason ELSE '' END
             || coalesce('. ' || _note, '');
  ELSIF _decision = 'deny' THEN
    _g := 0; _y := 0; _marking := NULL;
    _history := _note;
  ELSE
    _g := _r.green_amount; _y := _r.yellow_amount; _reason := _r.yellow_reason;
    _marking := _r.split_cells;
    _history := _note;
  END IF;

  UPDATE budget.allocation_requests
  SET status = _to,
      split_cells = _marking,
      green_amount = _g,
      yellow_amount = _y,
      yellow_reason = CASE WHEN coalesce(_y, 0) > 0 THEN _reason END,
      admin_notes = coalesce(_note, admin_notes),
      reviewed_by = CASE WHEN _to = 'under_review' THEN reviewed_by ELSE auth.uid() END,
      reviewed_at = CASE WHEN _to = 'under_review' THEN reviewed_at ELSE now() END
  WHERE id = _request_id
  RETURNING * INTO _r;

  INSERT INTO budget.allocation_request_history
    (request_id, action, actor_id, actor_name, old_status, new_status, notes)
  VALUES
    (_request_id,
     CASE WHEN _decision = 'review' THEN 'review_started'
          WHEN _decision = 'conditional' AND _old = 'conditionally_approved' THEN 'split_changed'
          WHEN _decision = 'conditional' THEN 'conditionally_approved'
          ELSE 'denied' END,
     auth.uid(), budget.current_actor_name(), _old, _to, _history);

  RETURN _r;
END;
$$;

REVOKE ALL ON FUNCTION budget.council_decide(uuid, text, text, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget.council_decide(uuid, text, text, numeric, numeric, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The Board approves the marking as it stands
-- ---------------------------------------------------------------------------
--
-- Same signature as 441400. 'approve' applies the local leaders' marking (all
-- Green where there is none) and credits only Green. The Board does not mark:
-- a change is a 'return' to the local leaders with a note.

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
  _notes_clean text := nullif(btrim(_notes), '');
  _g numeric;
  _y numeric;
  _history text := nullif(btrim(_notes), '');
BEGIN
  SELECT * INTO _r FROM budget.allocation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That budget request does not exist.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    public.is_board(_r.organization_id)
    OR (
      public.is_org_admin(_r.organization_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.organization_id = _r.organization_id AND uo.role = 'board'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Only the Board can give final approval.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _r.status <> 'board_review' THEN
    RAISE EXCEPTION 'This request is % now, not with the Board. Refresh to see where it is.',
      replace(_r.status::text, '_', ' ')
      USING ERRCODE = 'check_violation';
  END IF;

  IF _decision = 'approve' THEN
    _g := coalesce(_r.green_amount, _r.requested_amount);
    _y := coalesce(_r.yellow_amount, 0);
    IF _g + _y = 0 OR (_y > 0 AND nullif(btrim(_r.yellow_reason), '') IS NULL) THEN
      RAISE EXCEPTION 'Its marking needs another look. Send it back to the local leaders.'
        USING ERRCODE = 'check_violation';
    END IF;
    _to := budget.split_status(_r.requested_amount, _g, _y);
    _history := budget.split_text(_r.requested_amount, _g, _y) || coalesce('. ' || _notes_clean, '');

    UPDATE budget.allocation_requests
    SET status = _to,
        green_amount = _g,
        yellow_amount = _y,
        approved_amount = _g,
        admin_notes = coalesce(_notes_clean, admin_notes),
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _request_id
    RETURNING * INTO _r;

    PERFORM budget.credit_green(_r, _g,
      coalesce(_notes_clean || ' ', '') || format('(Board added $%s)', budget.money_text(_g)));

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
        split_cells = NULL, green_amount = 0, yellow_amount = 0, yellow_reason = NULL,
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
     auth.uid(), budget.current_actor_name(), 'board_review', _to, _history);

  RETURN _r;
END;
$$;

-- The Board's bulk "Final approval" applies each request's marking as it stands.
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
  _g numeric;
  _y numeric;
  _to budget.allocation_request_status;
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
      _g := coalesce(_r.green_amount, _r.requested_amount);
      _y := coalesce(_r.yellow_amount, 0);
      IF _g + _y = 0 OR (_y > 0 AND nullif(btrim(_r.yellow_reason), '') IS NULL) THEN
        _skipped := _skipped || jsonb_build_object(
          'id', _r.id, 'reason', 'Its marking needs another look; send it back to the local leaders.');
        CONTINUE;
      END IF;
      _to := budget.split_status(_r.requested_amount, _g, _y);

      UPDATE budget.allocation_requests
      SET status = _to,
          green_amount = _g,
          yellow_amount = _y,
          approved_amount = _g,
          reviewed_by = auth.uid(),
          reviewed_at = now()
      WHERE id = _r.id
      RETURNING * INTO _r;

      PERFORM budget.credit_green(_r, _g, format('Board approved $%s', budget.money_text(_g)));
    ELSE
      _to := 'under_review';
      UPDATE budget.allocation_requests
      SET status = _to
      WHERE id = _r.id;
    END IF;

    INSERT INTO budget.allocation_request_history
      (request_id, action, actor_id, actor_name, old_status, new_status, notes)
    VALUES
      (_r.id,
       CASE _decision WHEN 'approve' THEN 'board_approved' ELSE 'returned_to_council' END,
       auth.uid(), budget.current_actor_name(), 'board_review', _to,
       CASE _decision
         WHEN 'approve' THEN budget.split_text(_r.requested_amount, _g, _y) || coalesce('. ' || _note, '')
         ELSE _note END);

    _moved := _moved || _r.id;
  END LOOP;

  FOR _missing IN
    SELECT u FROM unnest(_request_ids) u
    WHERE NOT EXISTS (SELECT 1 FROM budget.allocation_requests a WHERE a.id = u)
  LOOP
    _skipped := _skipped || jsonb_build_object(
      'id', _missing, 'reason', 'That budget request does not exist.');
  END LOOP;

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
-- 4. Yellow, later
-- ---------------------------------------------------------------------------
--
-- As giving allows, the local leaders (admins of the branch; the Board does
-- not mark) move a decided request's Yellow money to Green (credited now) or
-- to Red.
--
--   _cells   a monthly request: [{index, month, to_green, to_red}], each no
--            more than that cell's Yellow.
--   _to_green / _to_red   an annual request, in dollars.
--   Nothing given: all of its Yellow to Green.
--
-- When the status changes (no Yellow left) the usual status email goes; when
-- it does not, a 'yellow_released' email tells the ministry.

CREATE OR REPLACE FUNCTION budget.release_yellow(
  _request_id uuid,
  _cells jsonb DEFAULT NULL,
  _to_green numeric DEFAULT NULL,
  _to_red numeric DEFAULT NULL,
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
  _tg numeric := 0;
  _tr numeric := 0;
  _g numeric;
  _y numeric;
  _to budget.allocation_request_status;
  _note text := nullif(btrim(_notes), '');
  _history text;
  _new_cells jsonb := '[]'::jsonb;
  _c jsonb;
  _m jsonb;
  _cg numeric;
  _cr numeric;
  _supabase_url text;
  _service_role_key text;
BEGIN
  SELECT * INTO _r FROM budget.allocation_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That budget request does not exist.' USING ERRCODE = 'no_data_found';
  END IF;
  _old := _r.status;

  IF NOT public.is_org_admin(_r.organization_id) THEN
    RAISE EXCEPTION 'Only the local leaders (an admin of this branch) can move Yellow money.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _r.status NOT IN ('approved', 'partially_approved') OR coalesce(_r.yellow_amount, 0) = 0 THEN
    RAISE EXCEPTION 'This request has no Yellow money waiting. Refresh to see where it is.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _r.split_cells IS NOT NULL THEN
    IF _to_green IS NOT NULL OR _to_red IS NOT NULL THEN
      RAISE EXCEPTION 'A monthly request''s Yellow is moved line by line, month by month.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF _cells IS NOT NULL THEN
      FOR _m IN SELECT e FROM jsonb_array_elements(_cells) e LOOP
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r.split_cells) c
                       WHERE (c->>'index')::integer = (_m->>'index')::integer
                         AND c->>'month' = _m->>'month') THEN
          RAISE EXCEPTION 'A move names a line and month this request does not have (% %).',
            _m->>'index', _m->>'month' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
    END IF;

    FOR _c IN SELECT e FROM jsonb_array_elements(_r.split_cells) e LOOP
      IF _cells IS NULL THEN
        _cg := (_c->>'yellow')::numeric; _cr := 0;
      ELSE
        SELECT e INTO _m FROM jsonb_array_elements(_cells) e
         WHERE (e->>'index')::integer = (_c->>'index')::integer AND e->>'month' = _c->>'month'
         LIMIT 1;
        _cg := round(coalesce((_m->>'to_green')::numeric, 0), 2);
        _cr := round(coalesce((_m->>'to_red')::numeric, 0), 2);
        _m := NULL;
      END IF;
      IF _cg < 0 OR _cr < 0 THEN
        RAISE EXCEPTION 'Amounts cannot be less than $0.' USING ERRCODE = 'check_violation';
      END IF;
      IF _cg + _cr > (_c->>'yellow')::numeric THEN
        RAISE EXCEPTION 'Only $% is Yellow in % of line %.',
          budget.money_text((_c->>'yellow')::numeric), initcap(_c->>'month'), (_c->>'index')::integer + 1
          USING ERRCODE = 'check_violation';
      END IF;
      _tg := _tg + _cg;
      _tr := _tr + _cr;
      _new_cells := _new_cells || jsonb_set(jsonb_set(_c,
        '{green}', to_jsonb((_c->>'green')::numeric + _cg)),
        '{yellow}', to_jsonb((_c->>'yellow')::numeric - _cg - _cr));
    END LOOP;
  ELSE
    IF _cells IS NOT NULL THEN
      RAISE EXCEPTION 'This request has no months; give the amounts in dollars.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF _to_green IS NULL AND _to_red IS NULL THEN
      _tg := _r.yellow_amount; _tr := 0;
    ELSE
      _tg := round(coalesce(_to_green, 0), 2);
      _tr := round(coalesce(_to_red, 0), 2);
    END IF;
    IF _tg < 0 OR _tr < 0 THEN
      RAISE EXCEPTION 'Amounts cannot be less than $0.' USING ERRCODE = 'check_violation';
    END IF;
    IF _tg + _tr > _r.yellow_amount THEN
      RAISE EXCEPTION 'Only $% is Yellow.', budget.money_text(_r.yellow_amount)
        USING ERRCODE = 'check_violation';
    END IF;
    _new_cells := NULL;
  END IF;

  IF _tg + _tr = 0 THEN
    RAISE EXCEPTION 'Move something to Green or to Red.' USING ERRCODE = 'check_violation';
  END IF;

  _g := _r.green_amount + _tg;
  _y := _r.yellow_amount - _tg - _tr;
  _to := budget.split_status(_r.requested_amount, _g, _y);
  _history := format('Yellow moved: $%s to Green, $%s to Red. Now ',
                     budget.money_text(_tg), budget.money_text(_tr))
           || budget.split_text(_r.requested_amount, _g, _y)
           || coalesce('. ' || _note, '');

  UPDATE budget.allocation_requests
  SET status = _to,
      split_cells = _new_cells,
      green_amount = _g,
      yellow_amount = _y,
      yellow_reason = CASE WHEN _y > 0 THEN yellow_reason END,
      approved_amount = _g,
      admin_notes = coalesce(_note, admin_notes),
      reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _request_id
  RETURNING * INTO _r;

  PERFORM budget.credit_green(_r, _tg,
    coalesce(_note || ' ', '') || format('(Yellow to Green $%s)', budget.money_text(_tg)));

  INSERT INTO budget.allocation_request_history
    (request_id, action, actor_id, actor_name, old_status, new_status, notes)
  VALUES
    (_request_id, 'yellow_released', auth.uid(), budget.current_actor_name(), _old, _to, _history);

  IF _to = _old THEN
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
          'kind', 'yellow_released',
          'record_ids', to_jsonb(ARRAY[_request_id]),
          'new_status', _to::text,
          'to_green', _tg,
          'to_red', _tr,
          'note', _note
        )
      );
    END IF;
  END IF;

  RETURN _r;
END;
$$;

REVOKE ALL ON FUNCTION budget.release_yellow(uuid, jsonb, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget.release_yellow(uuid, jsonb, numeric, numeric, text) TO authenticated;

-- Several requests' Yellow, all to Green, in one step: when funds arrive. A
-- request that cannot be moved is skipped with its reason; the rest go ahead.
CREATE OR REPLACE FUNCTION budget.release_yellow_many(_request_ids uuid[], _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _id uuid;
  _moved integer := 0;
  _skipped jsonb := '[]'::jsonb;
BEGIN
  FOREACH _id IN ARRAY coalesce(_request_ids, '{}') LOOP
    BEGIN
      PERFORM budget.release_yellow(_id, NULL, NULL, NULL, _notes);
      _moved := _moved + 1;
    EXCEPTION WHEN check_violation OR insufficient_privilege OR no_data_found OR invalid_parameter_value THEN
      _skipped := _skipped || jsonb_build_object('id', _id, 'reason', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('moved', _moved, 'skipped', _skipped);
END;
$$;

REVOKE ALL ON FUNCTION budget.release_yellow_many(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget.release_yellow_many(uuid[], text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Guards
-- ---------------------------------------------------------------------------
--
-- Freeze: while with the Board, neither the figures nor the marking move
-- except by the Board's own decision (which changes the status too). Before
-- the Board, changing the figures throws the marking away: it was a marking
-- of different numbers. Once decided with a marking, the figures stay as they
-- were marked; recall the approval to change them.

CREATE OR REPLACE FUNCTION budget.allocation_request_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = budget, public
AS $$
DECLARE
  _figures_changed boolean :=
       NEW.requested_amount IS DISTINCT FROM OLD.requested_amount
    OR NEW.budget_breakdown IS DISTINCT FROM OLD.budget_breakdown
    OR NEW.period_type IS DISTINCT FROM OLD.period_type;
BEGIN
  IF OLD.status = 'board_review'
     AND (_figures_changed
       OR NEW.justification IS DISTINCT FROM OLD.justification
       OR NEW.ministry_id IS DISTINCT FROM OLD.ministry_id
       OR NEW.fiscal_year_id IS DISTINCT FROM OLD.fiscal_year_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'This request is with the Board, so its figures cannot change. Ask the Board to send it back first.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'board_review' AND NEW.status = 'board_review'
     AND (NEW.green_amount IS DISTINCT FROM OLD.green_amount
       OR NEW.yellow_amount IS DISTINCT FROM OLD.yellow_amount
       OR NEW.yellow_reason IS DISTINCT FROM OLD.yellow_reason
       OR NEW.split_cells IS DISTINCT FROM OLD.split_cells) THEN
    RAISE EXCEPTION 'This request is with the Board. To change its marking, the Board sends it back to the local leaders.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status IN ('approved', 'partially_approved') AND NEW.status = OLD.status
     AND OLD.split_cells IS NOT NULL AND _figures_changed THEN
    RAISE EXCEPTION 'This request has been decided month by month, so its figures cannot change. Recall the approval first.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'conditionally_approved' AND NEW.status = 'conditionally_approved' AND _figures_changed THEN
    NEW.status := 'under_review';
  END IF;

  IF OLD.status IN ('pending', 'under_review', 'conditionally_approved') AND _figures_changed THEN
    NEW.split_cells := NULL;
    NEW.green_amount := NULL;
    NEW.yellow_amount := NULL;
    NEW.yellow_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- The requester may not set the marking. Clearing it, which the freeze does
-- when they change their figures, is allowed.
CREATE OR REPLACE FUNCTION budget.requester_edit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = budget, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR OLD.requester_id IS DISTINCT FROM auth.uid()
     OR public.is_org_admin(OLD.organization_id) OR public.is_board(OLD.organization_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_amount IS DISTINCT FROM OLD.approved_amount
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR (NEW.green_amount IS NOT NULL AND NEW.green_amount IS DISTINCT FROM OLD.green_amount)
     OR (NEW.yellow_amount IS NOT NULL AND NEW.yellow_amount IS DISTINCT FROM OLD.yellow_amount)
     OR (NEW.yellow_reason IS NOT NULL AND NEW.yellow_reason IS DISTINCT FROM OLD.yellow_reason)
     OR (NEW.split_cells IS NOT NULL AND NEW.split_cells IS DISTINCT FROM OLD.split_cells) THEN
    RAISE EXCEPTION 'You can change what you asked for, not how it was decided.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.status IN ('under_review', 'conditionally_approved')
     AND (NEW.requested_amount IS DISTINCT FROM OLD.requested_amount
       OR NEW.budget_breakdown IS DISTINCT FROM OLD.budget_breakdown
       OR NEW.justification IS DISTINCT FROM OLD.justification
       OR NEW.period_type IS DISTINCT FROM OLD.period_type) THEN
    INSERT INTO budget.allocation_request_history
      (request_id, action, actor_id, actor_name, old_status, new_status, notes)
    VALUES
      (OLD.id, 'edited_by_requester', auth.uid(), budget.current_actor_name(),
       OLD.status, NEW.status,
       format('Changed by the ministry after review began: $%s to $%s',
              to_char(OLD.requested_amount, 'FM999,999,990.00'),
              to_char(NEW.requested_amount, 'FM999,999,990.00')));
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Carry-over copies what was justified
-- ---------------------------------------------------------------------------
--
-- A decided request carries over at Green + Yellow (what the church agreed
-- with), and not at all if that is $0.

CREATE OR REPLACE FUNCTION budget.carry_over_budget_requests(
  _organization_id UUID, _year INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _fy UUID;
  _n INTEGER;
BEGIN
  SELECT id INTO _fy FROM budget.fiscal_years
   WHERE organization_id = _organization_id AND year = _year;
  IF _fy IS NULL THEN
    RAISE WARNING 'no % fiscal year for %; nothing carried over', _year, _organization_id;
    RETURN 0;
  END IF;

  WITH last_year AS (
    SELECT ar.*,
           CASE WHEN ar.status = 'pending' THEN ar.requested_amount
                WHEN ar.green_amount IS NOT NULL THEN ar.green_amount + coalesce(ar.yellow_amount, 0)
                ELSE coalesce(ar.approved_amount, ar.requested_amount) END AS carry_amount
    FROM budget.allocation_requests ar
    JOIN budget.fiscal_years fy ON fy.id = ar.fiscal_year_id
    JOIN budget.ministries m ON m.id = ar.ministry_id AND m.is_active
    WHERE ar.organization_id = _organization_id
      AND fy.year = _year - 1
      AND ar.status IN ('pending', 'approved', 'partially_approved')
      AND NOT ar.excluded_from_carry_over
      AND NOT EXISTS (
        SELECT 1 FROM budget.allocation_requests n
        WHERE n.fiscal_year_id = _fy AND n.ministry_id = ar.ministry_id
          AND (n.status NOT IN ('draft', 'cancelled') OR n.carried_over_from IS NOT NULL))
  ),
  copied AS (
    INSERT INTO budget.allocation_requests (
      organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
      period_type, requested_amount, justification, budget_breakdown, status,
      carried_over_from)
    SELECT l.organization_id, _fy, l.ministry_id, l.requester_id, l.requester_name,
           l.period_type, l.carry_amount,
           l.justification, l.budget_breakdown, 'pending', l.id
    FROM last_year l
    WHERE l.carry_amount > 0
    RETURNING id, carried_over_from
  ),
  amounts AS (
    INSERT INTO budget.allocation_period_amounts (allocation_request_id, period_number, amount, notes)
    SELECT c.id, pa.period_number, pa.amount, pa.notes
    FROM copied c
    JOIN budget.allocation_period_amounts pa ON pa.allocation_request_id = c.carried_over_from
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM copied;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION budget.carry_over_budget_requests(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
