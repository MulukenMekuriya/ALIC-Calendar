-- =====================================================
-- One bootstrap, not two
-- =====================================================
--
-- 20260322270000 fixed the kiosk's UTC bug by adding a `_today DATE` parameter
-- to kiosk_session_bootstrap. It used CREATE OR REPLACE. Adding a parameter
-- changes the signature, so Postgres did not replace anything: it created a
-- second function beside the first, and the buggy one is still there.
--
--   church.kiosk_session_bootstrap(_station_id uuid)
--   church.kiosk_session_bootstrap(_station_id uuid, _today date)
--
-- WHAT THIS ACTUALLY BREAKS. Both parameters carry defaults, so every call
-- that does not name `_today` is ambiguous and fails outright:
--
--   kiosk_session_bootstrap()              -> 42725, is not unique
--   kiosk_session_bootstrap(_station_id=>) -> 42725, is not unique
--
-- Today's kiosk sends both, so it resolves to the fixed one and Sunday works.
-- That is the only reason this has not been noticed. A tablet running a
-- bundle cached from before 25 September sends `_station_id` alone, and it
-- gets either an error or, through PostgREST's exact-name matching, the
-- UNFIXED function - which tells a parent standing at the tablet that
-- check-in is not open, on the evening of the very Sunday it is.
--
-- Found by replaying 20260322230000's assertions against current production
-- rather than against the schema of the day it was written. A sweep of the
-- whole church schema for duplicate function names found exactly this one.
--
-- AFTER THE DROP, A STALE CLIENT GETS BETTER, NOT WORSE. With one candidate
-- left, PostgREST matches `{_station_id}` against the two-parameter function
-- and lets `_today` default. `_today` then falls back to current_date, which
-- is the old behaviour - but the "an open session wins whatever its date"
-- clause still applies, so the common path is fixed even for a client that
-- has never heard of the parameter.

DROP FUNCTION IF EXISTS church.kiosk_session_bootstrap(UUID);

NOTIFY pgrst, 'reload schema';
