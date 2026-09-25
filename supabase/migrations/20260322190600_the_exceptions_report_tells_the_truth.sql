-- =====================================================
-- The exceptions report tells the truth
-- =====================================================
--
-- The report's own docstring (20260320001900:288) promises "overrides, blocked
-- restricted-pickup attempts, failed codes AND CHILDREN WHO WERE NEVER CHECKED
-- OUT". It has never shown the last of those.
--
-- Measured against production over the last twelve weeks:
--
--     what the report returns          124 rows
--       of which routine placements    108
--       of which failed pickup codes    16
--     children never checked out       164   <-- none of them in the report
--
-- So every row in the report is noise, and the one thing a leader most needs
-- to see on a Monday morning is absent. A child nobody recorded collecting is
-- written as action = 'auto_expired', outcome = 'success', and the WHERE
-- clause matched neither: 'auto_expired' was not in the action list, and
-- outcome 'success' is not 'denied'. The Sunday the desk forgets a child is
-- the Sunday this report comes back clean.
--
-- Five more things were wrong, and all of them are fixed here.
--
-- 2. THE WRONG CLOCK. The filter was `au.created_at::DATE`, which casts a
--    timestamptz in the database's timezone - UTC on Supabase - while every
--    other kids report filters on s.session_date, a local DATE. A Sunday
--    evening event is Monday in UTC and fell outside a range ending that
--    Sunday. Now filtered on session_date, falling back to the audit
--    timestamp in America/New_York for the 17 rows that carry no session.
--    (Hardcoding the zone follows 20260320001600:234; there is no timezone
--    column on public.organizations to read.)
--
-- 3. THE WRONG ROOM. It joined public.rooms through c.room_id - the check-in's
--    CURRENT room. transfer_child UPDATEs that column, so a transfer displayed
--    its own destination as though the child had always been there, and any
--    later transfer retroactively rewrote the room on every earlier audit row
--    for that child. check_in_audit carries its own room_id, which is the room
--    the event actually happened in.
--
-- 4. ERRORS WERE DROPPED. The constraint allows success|denied|error and only
--    'denied' was swept in, so anything that failed messily vanished.
--
-- 5. ROUTINE PLACEMENTS DROWNED THE REST. A grade-less child placed by age
--    band files an audit row, and there are 108 of them against 16 real
--    refusals. They are worth seeing - they mean 108 children have no grade on
--    file - but not interleaved with blocked pickups and rendered in the same
--    neutral badge. Every row now carries a `category`, and the report is
--    ordered by seriousness first so the screen can group them.
--
-- 6. LIMIT 500 TRUNCATED SILENTLY, and the UI reported the truncated number as
--    fact - the tab badge and the CSV both capped at exactly 500 with nothing
--    saying so. Every row now carries total_count, the true size of the match.

DROP FUNCTION IF EXISTS church.kids_exceptions_report(UUID, DATE, DATE);

CREATE FUNCTION church.kids_exceptions_report(
  _organization_id UUID, _from DATE, _to DATE)
RETURNS TABLE (
  occurred_at TIMESTAMPTZ,
  session_date DATE,
  category TEXT,
  action TEXT,
  outcome TEXT,
  child_name TEXT,
  room_name TEXT,
  actor_name TEXT,
  reason TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.assert_kids_leader(_organization_id);
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'invalid_date_range';
  END IF;

  RETURN QUERY
  WITH matched AS (
    SELECT
      au.created_at AS occurred_at,
      -- The service this belongs to. The audit timestamp is only a fallback,
      -- for rows raised outside any session.
      coalesce(s.session_date,
               (au.created_at AT TIME ZONE 'America/New_York')::DATE) AS session_date,
      CASE
        WHEN au.action = 'auto_expired' THEN 'not_collected'
        WHEN au.outcome = 'denied' THEN 'refused'
        WHEN au.outcome = 'error' THEN 'error'
        WHEN au.action IN ('override', 'restricted_pickup_override') THEN 'override'
        WHEN au.action = 'check_in'
             AND (au.detail->>'capacity_overridden')::BOOLEAN IS TRUE THEN 'override'
        WHEN au.action = 'transfer' THEN 'transfer'
        ELSE 'placement'
      END AS category,
      CASE WHEN au.action = 'check_in'
                AND (au.detail->>'capacity_overridden')::BOOLEAN IS TRUE
           THEN 'capacity_override' ELSE au.action END AS action,
      au.outcome,
      coalesce(p.first_name || ' ' || p.last_name, '(unknown child)') AS child_name,
      -- The room the event happened in, from the audit row itself. Falling
      -- back to the check-in's room only when the audit row carries none.
      coalesce(ar.name, cr.name) AS room_name,
      au.actor_name,
      coalesce(au.detail->>'override_reason', au.detail->>'reason',
               c.assignment_reason,
               CASE au.action
                 WHEN 'auto_expired'
                   THEN 'Nobody recorded collecting this child. The record was '
                        || 'closed off automatically.'
                 WHEN 'restricted_pickup_attempt'
                   THEN 'Blocked: person is on the restricted list'
                 WHEN 'code_failed' THEN 'Pickup code did not match'
                 WHEN 'pin_failed'  THEN 'Volunteer PIN did not match'
                 ELSE NULL END) AS reason
    FROM church.check_in_audit au
    LEFT JOIN church.kids_sessions s ON s.id = au.kids_session_id
    LEFT JOIN church.people p ON p.id = au.child_person_id
    LEFT JOIN church.kids_check_ins c ON c.id = au.check_in_id
    LEFT JOIN public.rooms ar ON ar.id = au.room_id
    LEFT JOIN public.rooms cr ON cr.id = c.room_id
    WHERE au.organization_id = _organization_id
      AND coalesce(s.session_date,
                   (au.created_at AT TIME ZONE 'America/New_York')::DATE)
            BETWEEN _from AND _to
      AND (au.action IN ('override', 'restricted_pickup_attempt',
                         'restricted_pickup_override', 'code_failed',
                         'pin_failed', 'transfer',
                         -- The whole reason this migration exists.
                         'auto_expired')
           OR au.outcome IN ('denied', 'error')
           OR (au.action = 'check_in'
               AND (au.detail->>'capacity_overridden')::BOOLEAN IS TRUE)
           OR (au.action = 'check_in' AND c.assignment_reason IS NOT NULL))
  )
  SELECT m.occurred_at, m.session_date, m.category, m.action, m.outcome,
         m.child_name, m.room_name, m.actor_name, m.reason,
         count(*) OVER () AS total_count
  FROM matched m
  -- Seriousness first, so a truncated page truncates the routine end of the
  -- list rather than the end that matters.
  ORDER BY CASE m.category
             WHEN 'not_collected' THEN 1
             WHEN 'refused'       THEN 2
             WHEN 'override'      THEN 3
             WHEN 'error'         THEN 4
             WHEN 'transfer'      THEN 5
             ELSE 6
           END,
           m.occurred_at DESC
  LIMIT 500;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_exceptions_report(UUID, DATE, DATE)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
