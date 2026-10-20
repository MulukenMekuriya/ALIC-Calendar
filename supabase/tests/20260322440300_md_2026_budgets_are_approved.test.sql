-- Assertions for 20260322440300, inside BEGIN/ROLLBACK.
--
-- MD's 18 real 2026 requests are approved at what was asked, the budget
-- allocations add up to the same, the two duplicates are untouched, and
-- nobody was emailed: no call to handle-workflow-notification was queued for
-- any of them, and the email trigger is switched back on.

DO $a$
DECLARE
  _md CONSTANT UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _fy UUID; _n INTEGER; _total NUMERIC; _alloc NUMERIC; _ministries INTEGER;
BEGIN
  SELECT id INTO _fy FROM budget.fiscal_years WHERE organization_id = _md AND year = 2026;

  SELECT count(*), sum(approved_amount) INTO _n, _total
  FROM budget.allocation_requests
  WHERE organization_id = _md AND fiscal_year_id = _fy AND status = 'approved'
    AND approved_amount = requested_amount
    AND admin_notes LIKE 'Part of the approved 2026 budget%';
  IF _n <> 18 OR _total <> 162190 THEN
    RAISE EXCEPTION 'FAIL 1: % approved for $%', _n, _total; END IF;

  SELECT sum(allocated_amount), count(*) INTO _alloc, _ministries
  FROM budget.budget_allocations WHERE organization_id = _md AND fiscal_year_id = _fy;
  IF _alloc <> 162190 OR _ministries <> 18 THEN
    RAISE EXCEPTION 'FAIL 2: allocations $% across % ministries', _alloc, _ministries; END IF;

  IF (SELECT allocated_amount FROM budget.budget_allocations ba
      JOIN budget.ministries m ON m.id = ba.ministry_id
      WHERE ba.fiscal_year_id = _fy AND m.name = 'Alic MD Deacons') <> 7450
     OR (SELECT allocated_amount FROM budget.budget_allocations ba
         JOIN budget.ministries m ON m.id = ba.ministry_id
         WHERE ba.fiscal_year_id = _fy AND m.name = 'ALIC MD Serving Ministry') <> 2000 THEN
    RAISE EXCEPTION 'FAIL 3: Deacons or Serving carry the duplicate'; END IF;

  IF EXISTS (SELECT 1 FROM budget.allocation_requests
             WHERE id IN ('a4542dd9-d1cf-4a36-88eb-aca767f37c0e', '651e2315-5595-417f-abb6-7c362662886b')
               AND (status <> 'pending' OR NOT excluded_from_carry_over)) THEN
    RAISE EXCEPTION 'FAIL 4: a duplicate was approved, or let into the carry-over'; END IF;

  IF EXISTS (
    SELECT 1 FROM net.http_request_queue q
    WHERE q.url LIKE '%handle-workflow-notification%'
      AND EXISTS (SELECT 1 FROM budget.allocation_requests ar
                  WHERE ar.fiscal_year_id = _fy AND ar.status = 'approved'
                    AND convert_from(q.body, 'UTF8') LIKE '%' || ar.id::TEXT || '%')) THEN
    RAISE EXCEPTION 'FAIL 5: an approval email was queued'; END IF;

  IF (SELECT tgenabled FROM pg_trigger
      WHERE tgname = 'allocation_status_notification'
        AND tgrelid = 'budget.allocation_requests'::regclass) <> 'O' THEN
    RAISE EXCEPTION 'FAIL 6: the approval email trigger was left switched off'; END IF;
  RAISE NOTICE 'PASS';
END;
$a$;
