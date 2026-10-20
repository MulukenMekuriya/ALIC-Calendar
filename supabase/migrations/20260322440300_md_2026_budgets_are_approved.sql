-- =====================================================
-- MD's 2026 budgets are approved, in the app as well
-- =====================================================
--
-- MD's 2026 budget was loaded on 19 December 2025 as pending requests "based
-- on approved ministry budget data" (20251219000000), and none was ever
-- approved in the app. So MD has no budget.budget_allocations at all: the
-- Budget Metrics card reads $0, and the Ministry Summary's new Approved Budget
-- column would read $0 for every ministry.
--
-- The user, 20 October 2026, chose to approve them: the 18 real requests at
-- their requested amounts, $162,190, as if the office had pressed Approve on
-- each. Left out, still pending and still kept out of the carry-over, are the
-- two Abel called duplicates: Deacons $12,200 and Serving $1,500
-- (20260322440100).
--
-- What pressing Approve does, done here: the request becomes 'approved' with
-- approved_amount = requested_amount, and the amount is added to the
-- ministry's budget_allocations row for the year. Two things it also does are
-- not done:
--   - No email. These budgets were agreed ten months ago; eighteen "your
--     budget request was approved" emails in October would only confuse.
--     allocation_status_notification is switched off for this update alone.
--   - No history row, and reviewed_by is left empty: allocation_request_history
--     needs the person who approved it, and no person did it here. admin_notes
--     says what happened instead.

DO $approve$
DECLARE
  _md CONSTANT UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _fy UUID;
  _n INTEGER;
  _total NUMERIC;
BEGIN
  SELECT id INTO _fy FROM budget.fiscal_years WHERE organization_id = _md AND year = 2026;

  CREATE TEMP TABLE md_2026_to_approve ON COMMIT DROP AS
  SELECT ar.id, ar.ministry_id, ar.requested_amount
  FROM budget.allocation_requests ar
  WHERE ar.organization_id = _md
    AND ar.fiscal_year_id = _fy
    AND ar.status = 'pending'
    AND ar.id NOT IN ('a4542dd9-d1cf-4a36-88eb-aca767f37c0e',   -- Deacons, $12,200, a duplicate
                      '651e2315-5595-417f-abb6-7c362662886b');  -- Serving, $1,500, a duplicate

  -- Exactly what was looked at on 20 October, or nothing: a request approved
  -- or added since then needs a person to decide, not this.
  SELECT count(*), sum(requested_amount) INTO _n, _total FROM md_2026_to_approve;
  IF _n <> 18 OR _total <> 162190 THEN
    RAISE EXCEPTION 'expected 18 pending 2026 requests for $162,190, found % for $%', _n, _total;
  END IF;
  IF EXISTS (SELECT 1 FROM budget.budget_allocations
             WHERE organization_id = _md AND fiscal_year_id = _fy) THEN
    RAISE EXCEPTION 'MD already has 2026 budget allocations; approve these by hand';
  END IF;

  ALTER TABLE budget.allocation_requests DISABLE TRIGGER allocation_status_notification;

  UPDATE budget.allocation_requests ar
     SET status = 'approved',
         approved_amount = ar.requested_amount,
         reviewed_at = now(),
         admin_notes = coalesce(ar.admin_notes,
           'Part of the approved 2026 budget, recorded in the app on 20 October 2026.')
    FROM md_2026_to_approve a
   WHERE ar.id = a.id;

  ALTER TABLE budget.allocation_requests ENABLE TRIGGER allocation_status_notification;

  INSERT INTO budget.budget_allocations
    (organization_id, fiscal_year_id, ministry_id, allocated_amount, approved_at, notes)
  SELECT _md, _fy, a.ministry_id, sum(a.requested_amount), now(),
         'The approved 2026 budget, recorded in the app on 20 October 2026.'
  FROM md_2026_to_approve a
  GROUP BY a.ministry_id;
END;
$approve$;
