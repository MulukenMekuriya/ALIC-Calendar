-- =====================================================
-- The serving list is the list the church wrote
-- =====================================================
--
-- The "Serving in" column of the Breeze export of 2026-08-27 names 29
-- ministries, and every one of them is written "MD ...". The serving pickers
-- were showing 30, most of them under a different name:
--
--     the export says        the picker said
--     MD Prayer              Alic MD Prayer
--     MD Worship             ALIC MD Worship
--     MD Home Cell_Bible     Alic MD Home Cell
--     MD Grace               MD Grace
--
-- because 21 of the 29 resolved onto budget.ministries rows that were named,
-- inconsistently, long before any of this — and the 8 with no counterpart were
-- created under the export's own spelling, so the list read half one way and
-- half the other.
--
-- The names are fixed in the app, not here: the members module now labels a
-- ministry with its church.ministry_aliases spelling (referenceService
-- .churchMinistryNames). budget.ministries keeps its own names, because the
-- budget screens key off them — src/modules/budget/constants/
-- ministryJustifications.ts is a lookup by ministry name, and renaming the
-- rows would silently empty it.
--
-- That leaves one row this migration has to settle. ALIC MD IT is the 30th:
-- it has no alias, because it is not in the export — it is on the serving list
-- only because somebody was assigned to it by hand on 2026-09-11, through the
-- picker, which is the other half of how 20260322030000 derived the flag. It
-- would therefore be the one entry still reading "ALIC ...". Off it comes, so
-- the list is the export's 29 and nothing else.
--
-- NOTHING IS LOST. The existing assignment to it stands and still shows on
-- that member's profile; ALIC MD IT is still an active budget cost centre.
-- Only the "add someone to a ministry" and "wants to serve in" dropdowns stop
-- offering it.
--
-- To put it back on the pickers, and under an MD name while you are there:
--
--     UPDATE budget.ministries SET is_serving_ministry = true
--      WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
--        AND name = 'ALIC MD IT';
--     INSERT INTO church.ministry_aliases (organization_id, alias, ministry_id)
--     SELECT organization_id, 'MD IT', id FROM budget.ministries
--      WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
--        AND name = 'ALIC MD IT';
--
-- The same two statements are how any ministry joins the serving list: a flag
-- saying members can serve there, and the name the church uses for it.

SET search_path = public, extensions;

BEGIN;

UPDATE budget.ministries m
   SET is_serving_ministry = false,
       updated_at = now()
 WHERE m.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
   AND m.is_serving_ministry
   AND NOT EXISTS (SELECT 1 FROM church.ministry_aliases al
                    WHERE al.ministry_id = m.id);

DO $report$
DECLARE _servable INTEGER; _named INTEGER;
BEGIN
  SELECT count(*) INTO _servable
    FROM budget.ministries
   WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
     AND is_active AND is_serving_ministry;

  SELECT count(DISTINCT al.ministry_id) INTO _named
    FROM church.ministry_aliases al
    JOIN budget.ministries m ON m.id = al.ministry_id
   WHERE m.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
     AND m.is_active AND m.is_serving_ministry;

  RAISE NOTICE 'MD serving list: % ministries, % of them named by the church',
    _servable, _named;

  IF _servable <> _named THEN
    RAISE EXCEPTION 'The serving list holds % ministries the church has no '
      'name on file for — the pickers would show them under their budget '
      'name.', _servable - _named;
  END IF;
END
$report$;

COMMIT;
