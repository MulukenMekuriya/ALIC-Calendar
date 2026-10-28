-- =====================================================
-- After the season, only a contributor is locked out
-- =====================================================
--
-- The user, 28 October 2026: "on deadline only contributors are blocked from
-- submitting; admin and board keep working."
--
-- budget.assert_request_season exempted one role, 'admin'. So from the end of
-- 1 November the Board's own Send back and Final approval would have been
-- refused: budget.board_decide runs as the Board user, and inside a
-- SECURITY DEFINER function auth.uid() is still that user. Treasury and
-- finance would have been refused too.
--
-- It now exempts admin, treasury, finance and board. A contributor is still
-- locked, which was the point of the lock. A plain 'member' cannot reach
-- these tables at all.
--
-- budget.request_season(...).can_bypass is the same question asked for the
-- screen (isRequestLocked in the front end), so it changes with it. Left
-- alone, the page would show a treasurer or a Board member the "closed"
-- dialog that the database no longer enforces.
--
-- Same signatures as before, so CREATE OR REPLACE keeps the triggers and the
-- grants pointing at them.

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
               AND uo.role IN ('admin', 'treasury', 'finance', 'board')) THEN
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

CREATE OR REPLACE FUNCTION budget.request_season(_organization_id UUID)
RETURNS TABLE(
  enforced boolean, fiscal_year integer, fiscal_year_id uuid,
  opens_at timestamp with time zone, closes_at timestamp with time zone,
  opens_on date, last_day date, state text, days_left integer, can_bypass boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'budget', 'public'
AS $$
DECLARE
  _today DATE := (now() AT TIME ZONE 'America/New_York')::DATE;
  _year INTEGER := extract(year FROM _today)::INTEGER + 1;
  _w RECORD;
BEGIN
  IF NOT public.is_staff(_organization_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _w FROM budget.request_window(_year);

  RETURN QUERY SELECT
    coalesce((SELECT p.enforce_window FROM budget.request_season_policy p
              WHERE p.organization_id = _organization_id), false),
    _year,
    (SELECT fy.id FROM budget.fiscal_years fy
      WHERE fy.organization_id = _organization_id AND fy.year = _year),
    _w.opens_at,
    _w.closes_at,
    _w.opens_on,
    _w.last_day,
    CASE WHEN now() < _w.opens_at THEN 'upcoming'
         WHEN now() < _w.closes_at THEN 'open'
         ELSE 'closed' END,
    CASE WHEN now() >= _w.opens_at AND now() < _w.closes_at
         THEN _w.last_day - _today END,
    EXISTS (SELECT 1 FROM public.user_organizations uo
            WHERE uo.user_id = auth.uid()
              AND uo.organization_id = _organization_id
              AND uo.role IN ('admin', 'treasury', 'finance', 'board'));
END;
$$;

NOTIFY pgrst, 'reload schema';
