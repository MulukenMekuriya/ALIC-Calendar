-- Assertions for 20260322440100, inside BEGIN/ROLLBACK.
--
-- One Teaching & Discipleship ministry with its 2026 budget on it, the old
-- spelling still found, and the carry-over taking exactly the budgets Abel
-- named: Deacons $7,450 and Serving $2,000, and nothing for Teaching,
-- Prayer, Visiting or Men's, which all have a 2027 request in.

DO $a$
DECLARE _amounts TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM budget.ministries
             WHERE id = '5b56a650-f19a-4b57-a0e8-d05d288a30ef' AND is_active) THEN
    RAISE EXCEPTION 'FAIL 1: the duplicate Teaching ministry is still active'; END IF;
  IF EXISTS (SELECT 1 FROM budget.allocation_requests
             WHERE ministry_id = '5b56a650-f19a-4b57-a0e8-d05d288a30ef') THEN
    RAISE EXCEPTION 'FAIL 1a: a request is still on the duplicate'; END IF;
  IF (SELECT ministry_id FROM budget.allocation_requests
      WHERE id = '70eab8f1-7fa8-4952-98f1-f123ff415ac1')
     IS DISTINCT FROM 'aac0cb3c-2ad9-40a9-894c-ed09dfabb9af' THEN
    RAISE EXCEPTION 'FAIL 1b: the 2026 Teaching budget did not move'; END IF;
  IF NOT EXISTS (SELECT 1 FROM church.ministry_aliases
                 WHERE alias = 'Alic MD Teaching &Dicipleshipe'
                   AND ministry_id = 'aac0cb3c-2ad9-40a9-894c-ed09dfabb9af') THEN
    RAISE EXCEPTION 'FAIL 1c: the old spelling finds nothing'; END IF;

  -- The three October budgets are in 2027, so they count as submitted.
  IF (SELECT count(*) FROM budget.allocation_requests ar
      JOIN budget.fiscal_years fy ON fy.id = ar.fiscal_year_id
      WHERE ar.id IN ('ae99af98-877c-416d-8f2f-64b22bfb1604',
                      '83bdd5cc-bcbc-45cb-96f2-a34b8887aebf',
                      'a27a9974-00c8-44c3-a8df-e4217d0cc359')
        AND fy.year = 2027) <> 3 THEN
    RAISE EXCEPTION 'FAIL 3: the October budgets are not all in 2027'; END IF;

  -- What the carry-over would make for these if nothing more came in.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE budget.allocation_requests ar SET status = 'cancelled'
    FROM budget.fiscal_years fy
   WHERE fy.id = ar.fiscal_year_id AND fy.year = 2027
     AND ar.ministry_id IN (SELECT id FROM budget.ministries
                            WHERE name IN ('Alic MD Deacons', 'ALIC MD Serving Ministry'))
     AND ar.carried_over_from IS NULL;
  PERFORM budget.carry_over_budget_requests('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 2027);

  SELECT string_agg(m.name || '=' || ar.requested_amount::INTEGER, ' ' ORDER BY ar.requested_amount)
    INTO _amounts
  FROM budget.allocation_requests ar
  JOIN budget.ministries m ON m.id = ar.ministry_id
  WHERE ar.carried_over_from IS NOT NULL
    AND m.name IN ('Alic MD Deacons', 'ALIC MD Serving Ministry',
                   'Alic MD Teaching & Discipleship', 'Alic MD Teaching &Dicipleshipe',
                   'Alic MD Prayer', 'ALIC Visiting', 'Alic MD Men''s');
  IF _amounts IS DISTINCT FROM 'ALIC MD Serving Ministry=2000 Alic MD Deacons=7450' THEN
    RAISE EXCEPTION 'FAIL 2: would carry over %', _amounts; END IF;
  RAISE NOTICE 'PASS';
END;
$a$;
