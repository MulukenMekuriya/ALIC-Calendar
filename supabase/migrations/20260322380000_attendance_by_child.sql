-- =====================================================
-- Attendance by child
-- =====================================================
--
-- kids_attendance_report counts children per room per service. The ministry
-- asked to see each child: which Sundays they came, how often, and who has
-- stopped coming, so a leader can follow up.
--
-- One row per child per date they were checked in, with the classroom they
-- were in that day and the date of their first check-in ever (so the screen
-- can tell a first-time child from one who has been coming for a year). The
-- screen pivots it into a grid; the database stays a plain list.
--
-- WHO MAY READ IT: exactly who may read kids_attendance_report, through the
-- same assert_kids_leader. It names children and dates, nothing medical.
--
-- NOT WRITTEN TO THE ACCESS LOG. check_in_audit's `sensitive_viewed` is for
-- medical and safety records, and its summary flags breadth: one person
-- reading many different children. An attendance list names every child who
-- came, so recording it there would make every leader who opens this tab look
-- like the thing the log exists to catch, and bury the reads that matter.
--
-- Counting matches kids_attendance_report: every check-in counts, whatever
-- its status. A child checked in twice on one date (two services, or a room
-- change by a second check-in) is one row, in the room of the later one.

CREATE OR REPLACE FUNCTION church.kids_child_attendance(
  _organization_id UUID, _from DATE, _to DATE)
RETURNS TABLE (
  child_person_id UUID,
  child_name TEXT,
  session_date DATE,
  room_name TEXT,
  first_check_in DATE
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
  WITH visits AS (
    SELECT DISTINCT ON (c.child_person_id, s.session_date)
           c.child_person_id AS child_id,
           s.session_date AS on_date,
           coalesce(r.name, c.label_room_name, 'Unassigned') AS room
    FROM church.kids_sessions s
    JOIN church.kids_check_ins c ON c.kids_session_id = s.id
    LEFT JOIN public.rooms r ON r.id = c.room_id
    WHERE s.organization_id = _organization_id
      AND s.session_date BETWEEN _from AND _to
    ORDER BY c.child_person_id, s.session_date, c.checked_in_at DESC
  ),
  firsts AS (
    SELECT pc.child_person_id AS child_id, min(ps.session_date) AS first_date
    FROM church.kids_check_ins pc
    JOIN church.kids_sessions ps ON ps.id = pc.kids_session_id
    WHERE ps.organization_id = _organization_id
      AND pc.child_person_id IN (SELECT v.child_id FROM visits v)
    GROUP BY pc.child_person_id
  )
  SELECT v.child_id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         v.on_date,
         v.room,
         f.first_date
  FROM visits v
  JOIN church.people p ON p.id = v.child_id
  LEFT JOIN firsts f ON f.child_id = v.child_id
  ORDER BY coalesce(p.preferred_name, p.first_name), p.last_name, v.on_date;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_child_attendance(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.kids_child_attendance(UUID, DATE, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
