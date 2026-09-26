-- =====================================================
-- The kiosk finds the open session
-- =====================================================
--
-- kiosk_session_bootstrap filtered on `ks.session_date = current_date`, and
-- current_date in this database is UTC.
--
-- A leader opened Sunday's session, the live board showed it open, and the
-- kiosk said "Check-in is not open just now. Please see a Kids Ministry
-- volunteer." At 9:20pm Eastern on the 25th it is already 01:20 UTC on the
-- 26th, so a session dated the 25th matched nothing.
--
-- THIS IS THE SAME BUG 20260322190600 FIXED IN THE EXCEPTIONS REPORT, which
-- says in as many words: "au.created_at::DATE casts a timestamptz in the
-- database's timezone (UTC), while every other kids report filters on
-- s.session_date (a local DATE). A Sunday-evening event lands on Monday in
-- UTC." I wrote that note and then reintroduced the bug four migrations
-- later, in the one place where the failure is a parent standing at a tablet
-- being told to find a volunteer.
--
-- TWO CHANGES, AND THE FIRST IS THE REAL FIX.
--
-- 1. AN OPEN SESSION WINS, WHATEVER ITS DATE. kidsSessionService.currentForDesk
--    has always done this - "prefers an open session, falls back to the most
--    recent one from today" - and the kiosk should never have been stricter
--    than the staffed desk standing next to it. A session is open because a
--    human opened it; that is a stronger signal than any date arithmetic, and
--    it removes the timezone question from the common path entirely.
--
-- 2. THE FALLBACK TAKES THE DATE FROM THE CLIENT. When nothing is open, the
--    tablet passes its own local date, the way the desk passes the browser's.
--    The database no longer guesses what day it is in Maryland.
--
-- _today is optional and defaults to current_date, so an older client keeps
-- working - it just keeps the old fallback behaviour, which is now only
-- reachable when no session is open at all.

CREATE OR REPLACE FUNCTION church.kiosk_session_bootstrap(
  _station_id UUID DEFAULT NULL,
  _today      DATE DEFAULT NULL
)
RETURNS TABLE (
  kids_session_id UUID,
  session_label   TEXT,
  session_date    DATE,
  status          TEXT,
  station_name    TEXT,
  station_known   BOOLEAN,
  open_room_count INTEGER
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE a church.resolved_actor; _st UUID; _local DATE;
BEGIN
  a := church.resolve_actor(NULL);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _st := church.kiosk_active_station(_station_id, a.organization_id);
  _local := coalesce(_today, current_date);

  IF _st IS NOT NULL THEN
    UPDATE church.check_in_stations SET last_seen_at = now() WHERE id = _st;
  END IF;

  RETURN QUERY
  SELECT ks.id, ks.service_label, ks.session_date, ks.status,
         (SELECT s.name FROM church.check_in_stations s WHERE s.id = _st),
         (_station_id IS NULL OR _st IS NOT NULL),
         (SELECT count(*)::INTEGER FROM church.kids_session_rooms ksr
           WHERE ksr.kids_session_id = ks.id AND ksr.is_open)
  FROM church.kids_sessions ks
  WHERE ks.organization_id = a.organization_id
    -- An open session, whatever the calendar says, OR one dated today
    -- according to the tablet. Never "today according to UTC".
    AND (ks.status = 'open' OR ks.session_date = _local)
  ORDER BY (ks.status = 'open') DESC, ks.session_date DESC, ks.starts_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kiosk_session_bootstrap(UUID, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
