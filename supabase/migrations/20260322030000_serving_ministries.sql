-- =====================================================
-- Which ministries you can actually serve in
-- =====================================================
--
-- budget.ministries answers two different questions with one list, and the
-- serving pickers have been showing the wrong answer to one of them.
--
-- MD holds 47 active ministries, and the Serving tab's "Add" dropdown, the
-- "Wants to serve in" dropdown and the sign-up form offered every one:
--
--   ALIC TEST · Test · VA Test          test rows, in the live branch
--   Finance  (trailing space)           a near-duplicate of ALIC MD Finance
--   Alic Adimin                         a typo of ALIC MD Admin
--   Alic MD Teaching &Dicipleshipe      a typo of Alic MD Teaching & Discipleship
--   Alic MD Welcome / ALIC MD Welcome   one ministry, twice, differing only in case
--   Emu - Admin Office                  0 serving, 26 expense requests
--   Pastor's Office/Admin               0 serving, 6 expense requests
--   Alic MD Music                       0 serving, 7 expense requests
--
-- The last three are the point. They are not junk — they are BUDGET COST
-- CENTRES. Real money moves through them and their expense history has to keep
-- working, so they cannot be deactivated. They are simply not places a member
-- volunteers. "Cost centre" and "somewhere you can serve" overlap heavily but
-- are not the same set, and one is_active flag cannot express both.
--
-- So this adds the second flag. The budget forms keep all 47; the serving
-- pickers get the 30 the church actually staffs.
--
-- MD ONLY. The column defaults to TRUE, so every existing row in every branch
-- keeps exactly today's behaviour, and the single UPDATE below is scoped to
-- ALIC MD - Silver Spring. VA is not read, not written and not affected: its
-- 23 ministries stay servable because the Breeze import was MD only and there
-- is no evidence here to narrow them with. Narrowing VA off the back of MD's
-- spreadsheet would be guessing at another campus.
--
-- MD's 30 = the 29 distinct ministries reachable from church.ministry_aliases
-- (the 21 export spellings that matched an existing ministry, plus the 8
-- created under the church's own names) + ALIC MD IT, which someone assigned
-- by hand through the new picker after the backfill ran. Deriving from
-- assignments as well as aliases is what catches that one.

ALTER TABLE budget.ministries
  ADD COLUMN IF NOT EXISTS is_serving_ministry BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN budget.ministries.is_serving_ministry IS
  'True when members can be assigned to this ministry, or express an interest '
  'in it. Distinct from is_active, which governs whether it is a live budget '
  'cost centre: Emu - Admin Office carries 26 expense requests and nobody '
  'serves in it. The members module''s serving pickers filter on this column; '
  'the budget forms deliberately do not. Defaults true so a new ministry is '
  'visible rather than mysteriously absent.';

-- ---------------------------------------------------------------------------
-- MD: everything with no sign of anyone serving in it comes off the pickers
-- ---------------------------------------------------------------------------
-- Evidence is an alias or a current assignment. Nothing is deleted and nothing
-- is deactivated — these rows keep working everywhere else in the app.
UPDATE budget.ministries m
   SET is_serving_ministry = false,
       updated_at = now()
 WHERE m.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
   AND NOT EXISTS (SELECT 1 FROM church.ministry_aliases al
                    WHERE al.ministry_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM church.ministry_assignments a
                    WHERE a.ministry_id = m.id AND a.end_date IS NULL);

DO $report$
DECLARE _on INTEGER; _off INTEGER;
BEGIN
  SELECT count(*) FILTER (WHERE is_serving_ministry),
         count(*) FILTER (WHERE NOT is_serving_ministry)
    INTO _on, _off
    FROM budget.ministries
   WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  RAISE NOTICE 'MD: % ministries servable, % kept as budget-only cost centres',
    _on, _off;
END
$report$;

-- ---------------------------------------------------------------------------
-- Adding one later
-- ---------------------------------------------------------------------------
-- Bringing a ministry back onto the serving dropdowns is one statement:
--
--     UPDATE budget.ministries
--        SET is_serving_ministry = true
--      WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
--        AND name = 'Alic MD Music';
--
-- church.ministry_aliases is the other half: add the spelling the church uses
-- there, and next year's import resolves it instead of creating a duplicate.

NOTIFY pgrst, 'reload schema';
