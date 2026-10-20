-- =====================================================
-- One Teaching & Discipleship ministry, and one budget each to carry over
-- =====================================================
--
-- Abel's answers on 20 October 2026, to what the carry-over in
-- 20260322440000 would have done with MD's 2026 budget:
--
-- 1. "Discipleship and Teaching Ministry is both handled by Pr Bini so you
--    can have that as one ministry." "Alic MD Teaching &Dicipleshipe" was a
--    second ministry made from a misspelt profile, holding the 2026 budget
--    ($10,400), while "Alic MD Teaching & Discipleship" holds the 2027
--    request. Its one request moves across, the spelling becomes an alias so
--    a profile carrying it still finds the ministry, and the duplicate is
--    switched off. Nothing else referred to it: no expenses, allocations,
--    flags, groups, assignments, interests or courses.
--
-- 2. Deacons and Serving had two 2026 requests each. "It should only be one,
--    probably a duplicate request. Deacons $7450 and Serving $2000 can carry
--    over if not updated for 2027." The other two stay in 2026 as they are
--    and are left out of the carry-over.
--
-- 3. Prayer, Visiting and Men's filed their 2027 budgets under 2026 between 7
--    and 19 October: the form defaulted to the current year. Teaching &
--    Discipleship did the same on the 19th and refiled under 2027 the next
--    day. Abel is asking the three leaders to correct theirs, but under the
--    lock in 20260322440000 nobody but an admin can change a 2026 request, so
--    the user chose to move them into 2027, where their leaders can still
--    edit or withdraw them until 1 November.

DO $merge$
DECLARE
  _md CONSTANT UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _keep CONSTANT UUID := 'aac0cb3c-2ad9-40a9-894c-ed09dfabb9af';  -- Alic MD Teaching & Discipleship
  _dup CONSTANT UUID := '5b56a650-f19a-4b57-a0e8-d05d288a30ef';   -- Alic MD Teaching &Dicipleshipe
  _n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM budget.ministries WHERE id = _dup AND is_active) THEN
    RAISE NOTICE 'the duplicate Teaching ministry is already merged';
    RETURN;
  END IF;

  UPDATE budget.allocation_requests SET ministry_id = _keep WHERE ministry_id = _dup;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RAISE NOTICE 'moved % budget request(s) to Alic MD Teaching & Discipleship', _n;

  UPDATE budget.expense_requests SET ministry_id = _keep WHERE ministry_id = _dup;
  UPDATE budget.ministry_flags SET ministry_id = _keep WHERE ministry_id = _dup;
  -- One allocation per ministry and year: there are none on the duplicate,
  -- and if there were it would need a person to decide, so refuse.
  IF EXISTS (SELECT 1 FROM budget.budget_allocations WHERE ministry_id = _dup) THEN
    RAISE EXCEPTION 'the duplicate Teaching ministry has budget allocations; merge them by hand';
  END IF;

  INSERT INTO church.ministry_aliases (organization_id, alias, ministry_id)
  VALUES (_md, 'Alic MD Teaching &Dicipleshipe', _keep)
  ON CONFLICT (organization_id, alias) DO NOTHING;

  UPDATE budget.ministries
     SET is_active = false,
         description = 'Merged into Alic MD Teaching & Discipleship on 20 October 2026',
         updated_at = now()
   WHERE id = _dup;
END;
$merge$;

DO $exclude$
DECLARE
  _n INTEGER;
BEGIN
  UPDATE budget.allocation_requests
     SET excluded_from_carry_over = true
   WHERE id IN ('a4542dd9-d1cf-4a36-88eb-aca767f37c0e',   -- Deacons, $12,200 annual, 30 Jan 2026
                '651e2315-5595-417f-abb6-7c362662886b');  -- Serving, $1,500 monthly, 19 Dec 2025
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 2 THEN
    RAISE EXCEPTION 'expected the two duplicate 2026 requests, found %', _n;
  END IF;
END;
$exclude$;

DO $move$
DECLARE
  _fy2027 CONSTANT UUID := '1e95e1ea-977b-4433-945f-13bd96ebe868';  -- MD 2027
  _n INTEGER;
BEGIN
  UPDATE budget.allocation_requests
     SET fiscal_year_id = _fy2027
   WHERE id IN ('ae99af98-877c-416d-8f2f-64b22bfb1604',   -- Prayer, $3,000, 7 Oct
                '83bdd5cc-bcbc-45cb-96f2-a34b8887aebf',   -- Visiting, $2,000, 8 Oct
                'a27a9974-00c8-44c3-a8df-e4217d0cc359')   -- Men's, $8,000, 19 Oct
     AND fiscal_year_id <> _fy2027;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RAISE NOTICE 'moved % request(s) from 2026 to 2027', _n;
END;
$move$;
