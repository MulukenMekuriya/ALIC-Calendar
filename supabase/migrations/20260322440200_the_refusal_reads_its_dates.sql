-- =====================================================
-- The refusal reads its dates from the season
-- =====================================================
--
-- 20260322440000 wrote "September 1" and "November 1" into the refusal
-- itself, a second copy of the rule that budget.request_window holds. The
-- user, 20 October 2026: "make sure all Sunday 2027 are not hard coded since
-- this will be used next". The year was already worked out; now the days
-- are too, so the season is defined in one place.
--
-- Same words as before for this year's dates. Same signature, so CREATE OR
-- REPLACE keeps the triggers pointing at it.

CREATE OR REPLACE FUNCTION budget.assert_request_season(
  _organization_id UUID, _fiscal_year_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _year INTEGER;
  _w RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM budget.request_season_policy p
                 WHERE p.organization_id = _organization_id AND p.enforce_window) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_organizations uo
             WHERE uo.user_id = auth.uid()
               AND uo.organization_id = _organization_id
               AND uo.role = 'admin') THEN
    RETURN;
  END IF;

  SELECT fy.year INTO _year FROM budget.fiscal_years fy WHERE fy.id = _fiscal_year_id;
  -- No such year: the foreign key will say so in its own words.
  IF _year IS NULL THEN RETURN; END IF;

  SELECT * INTO _w FROM budget.request_window(_year);

  -- Month, day and year, as Abel writes a date.
  IF now() < _w.opens_at THEN
    RAISE EXCEPTION 'Budget requests for % open on %.',
      _year, to_char(_w.opens_on, 'FMMonth FMDD, YYYY')
      USING ERRCODE = 'P0001';
  ELSIF now() >= _w.closes_at THEN
    RAISE EXCEPTION 'Budget requests for % closed on %. Please ask an administrator to make any change.',
      _year, to_char(_w.last_day, 'FMMonth FMDD, YYYY')
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION budget.assert_request_season(UUID, UUID) FROM PUBLIC, anon, authenticated;
