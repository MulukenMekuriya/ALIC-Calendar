-- =====================================================
-- Final approval is exactly what was requested
-- =====================================================
--
-- The Board recommends amounts; it does not set them. The local leaders change
-- the figures and the Board approves what it is sent. So:
--
--   1. board_decide 'approve' always approves requested_amount; an
--      _approved_amount passed in is ignored. (A partial approval no longer
--      exists as a Board action.) The ministry's budget is credited with an
--      upsert, as board_decide_many does.
--   2. An admin may act for the Board only in a branch that has no Board
--      member at all. Where there is a Board, the people who edit the numbers
--      cannot also approve them. After the data fix every branch has one, so
--      the fallback is dormant and fails safe.
--   3. The old one-per-member feedback key goes; feedback is one per member
--      per round (allocation_board_feedback_one_per_member_round). The app now
--      upserts on that.

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
    _to := 'approved';

    UPDATE budget.allocation_requests
    SET status = _to, approved_amount = requested_amount,
        admin_notes = coalesce(_notes_clean, admin_notes),
        reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _request_id
    RETURNING * INTO _r;

    INSERT INTO budget.budget_allocations
      (organization_id, ministry_id, fiscal_year_id, allocated_amount, approved_by, approved_at, notes)
    VALUES
      (_r.organization_id, _r.ministry_id, _r.fiscal_year_id, _r.requested_amount, auth.uid(), now(), _notes_clean)
    ON CONFLICT (fiscal_year_id, ministry_id) DO UPDATE
    SET allocated_amount = budget.budget_allocations.allocated_amount + EXCLUDED.allocated_amount,
        approved_by = EXCLUDED.approved_by,
        approved_at = EXCLUDED.approved_at,
        notes = coalesce(_notes_clean || ' ', '') || format('(Board added $%s)', to_char(EXCLUDED.allocated_amount, 'FM999,999,990.00'));

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

-- The app upserts feedback on (request, member, round) from here on.
ALTER TABLE budget.allocation_board_feedback
  DROP CONSTRAINT IF EXISTS allocation_board_feedback_one_per_member;

NOTIFY pgrst, 'reload schema';
