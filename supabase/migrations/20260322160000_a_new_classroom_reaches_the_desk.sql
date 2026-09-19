-- =====================================================
-- A classroom you just added is a classroom the desk can use
-- =====================================================
--
-- The Classrooms tab writes church.room_kids_config. The check-in station reads
-- church.kids_session_rooms. Nothing joined the two at the moment somebody
-- pressed Save, so a room added on a Tuesday — or at 10:40 on a Sunday, which is
-- when an overflow room actually gets added — never reached the tablet.
--
-- The only reconciler, kids_sync_session_rooms(), ran from exactly two places:
-- the leader's "Open today's session" button, and the ten-minute scheduler tick,
-- which only fires on the configured auto-open weekday inside the check-in
-- window. Outside those, the open session kept the room list it was born with.
--
-- This is worse than a short dropdown. pick_room_for_child() reads
-- kids_session_rooms at all three of its placement steps and check_in_one_child
-- raises room_not_open for anything absent from it, so a new Grade 4 classroom
-- was not merely unselectable — automatic grade routing could not see it and
-- naming it by hand was refused.
--
-- Three changes, so the two tables cannot drift again:
--   1. Reconciliation reopens every configured classroom, not only the ones it
--      closed itself.
--   2. Saving or retiring a classroom reconciles every open session at once.
--   3. The station reconciles as it lists, which repairs sessions whose rooms
--      were orphaned before this migration ran and covers every other writer of
--      room_kids_config, including set_room_kids_config and hand-run SQL.


-- ---------------------------------------------------------------------------
-- 1. Reconciliation stops keeping rooms off the board
-- ---------------------------------------------------------------------------
--
-- 20260320010000 taught this function not to reopen a room a leader had closed
-- by hand: configuration does not get to overrule someone standing in the
-- building. Good reasoning, but the leader's half of it was never built — the
-- hook that calls kids_close_room_in_session() exists in the frontend and no
-- component has ever rendered it. So closed_reason = 'leader' identifies no real
-- decision by anybody; it is carried only by rows that 20260320010000's own
-- backfill stamped, plus anything set by hand at the SQL prompt.
--
-- Meanwhile it is the one thing that can hold a configured classroom off the
-- desk permanently, with no way to put it back. The desk shows the classroom
-- list; a room on that list is offered.
--
-- kids_close_room_in_session() still works and still records why. It is now
-- transient — the next reconciliation reopens the room — which is honest given
-- that nothing in the product calls it. A durable close belongs in
-- room_kids_config, where Retire already puts it.
CREATE OR REPLACE FUNCTION church.kids_sync_session_rooms(_kids_session_id UUID)
RETURNS TABLE (rooms_attached INTEGER, rooms_closed INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _org UUID;
  _attached INTEGER := 0;
  _closed INTEGER := 0;
BEGIN
  SELECT s.organization_id INTO _org
  FROM church.kids_sessions s WHERE s.id = _kids_session_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- Classrooms this session has never seen.
  INSERT INTO church.kids_session_rooms (organization_id, kids_session_id, room_id)
  SELECT _org, _kids_session_id, rkc.room_id
  FROM church.room_kids_config rkc
  WHERE rkc.organization_id = _org
    AND rkc.is_active AND rkc.is_checkin_location
  ON CONFLICT (kids_session_id, room_id) DO NOTHING;
  GET DIAGNOSTICS _attached = ROW_COUNT;

  -- Classrooms whose row exists but is closed, whatever closed it. The INSERT
  -- above skipped them on the unique key, so without this they stay off the
  -- board for the rest of the day.
  WITH reopened AS (
    UPDATE church.kids_session_rooms sr
       SET is_open = true, closed_reason = NULL, updated_at = now()
     WHERE sr.kids_session_id = _kids_session_id
       AND NOT sr.is_open
       AND EXISTS (
         SELECT 1 FROM church.room_kids_config rkc
          WHERE rkc.room_id = sr.room_id
            AND rkc.organization_id = _org
            AND rkc.is_active AND rkc.is_checkin_location)
     RETURNING 1)
  SELECT _attached + count(*)::INTEGER INTO _attached FROM reopened;

  -- Rooms that are no longer classrooms — retired, or taken out of children's
  -- use — but only when empty. A room holding a child stays on the board
  -- whatever the config says, because the board is the register of where
  -- children physically are.
  WITH stale AS (
    UPDATE church.kids_session_rooms sr
       SET is_open = false, closed_reason = 'config', updated_at = now()
     WHERE sr.kids_session_id = _kids_session_id
       AND sr.is_open
       AND NOT EXISTS (
         SELECT 1 FROM church.room_kids_config rkc
          WHERE rkc.room_id = sr.room_id
            AND rkc.organization_id = _org
            AND rkc.is_active AND rkc.is_checkin_location)
       AND NOT EXISTS (
         SELECT 1 FROM church.kids_check_ins c
          WHERE c.kids_session_id = _kids_session_id
            AND c.room_id = sr.room_id
            AND c.status = 'checked_in')
     RETURNING 1)
  SELECT count(*)::INTEGER INTO _closed FROM stale;

  RETURN QUERY SELECT _attached, _closed;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_sync_session_rooms(UUID) FROM PUBLIC;

COMMENT ON FUNCTION church.kids_sync_session_rooms(UUID) IS
  'Makes a session''s room list match church.room_kids_config: attaches and '
  'reopens every configured classroom, closes ones no longer in children''s use '
  'that hold no child. Every configured classroom is on the board.';


-- ---------------------------------------------------------------------------
-- 2a. Saving a classroom puts it on today's board
-- ---------------------------------------------------------------------------
--
-- Also gains _is_checkin_location. The old body set it to true unconditionally,
-- so an org admin who opened the Fasika room from the "Other rooms" list to
-- correct its capacity turned it into a children's classroom on the way out —
-- the exact inverse of the bug this migration exists to fix, and silent.
--
-- The parameter list changes, so the old function has to go: the frontend calls
-- with named arguments and two overloads differing only by a defaulted
-- parameter are ambiguous to PostgREST.
DROP FUNCTION IF EXISTS church.upsert_kids_classroom(
  UUID, UUID, TEXT, UUID, UUID, INTEGER, INTEGER, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION church.upsert_kids_classroom(
  _organization_id UUID,
  _room_id UUID DEFAULT NULL,
  _name TEXT DEFAULT NULL,
  _school_grade_id UUID DEFAULT NULL,
  _kids_age_band_id UUID DEFAULT NULL,
  _capacity INTEGER DEFAULT NULL,
  _ratio INTEGER DEFAULT NULL,
  _label_room_name TEXT DEFAULT NULL,
  _sort_order INTEGER DEFAULT 0,
  _is_checkin_location BOOLEAN DEFAULT true
)
RETURNS church.room_kids_config
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _is_admin BOOLEAN;
  _is_kids_admin BOOLEAN;
  _room UUID := _room_id;
  _row church.room_kids_config;
  _clean_name TEXT := NULLIF(btrim(coalesce(_name, '')), '');
  _session RECORD;
BEGIN
  _is_admin := _organization_id IN (SELECT church.my_admin_orgs());
  _is_kids_admin := church.has_permission_in_org(
    _organization_id, ARRAY['kids_admin']::church.module_permission[]);

  IF NOT (_is_admin OR _is_kids_admin) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF _label_room_name IS NOT NULL AND char_length(_label_room_name) > 20 THEN
    RAISE EXCEPTION 'label_room_name_too_long'
      USING DETAIL = format('%s characters; the printed label fits 20',
                            char_length(_label_room_name));
  END IF;
  IF _capacity IS NOT NULL AND _capacity <= 0 THEN
    RAISE EXCEPTION 'capacity_must_be_positive';
  END IF;
  IF _ratio IS NOT NULL AND _ratio <= 0 THEN
    RAISE EXCEPTION 'ratio_must_be_positive';
  END IF;

  IF _school_grade_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM church.school_grades g
                     WHERE g.id = _school_grade_id
                       AND g.organization_id = _organization_id) THEN
    RAISE EXCEPTION 'grade_belongs_to_another_branch';
  END IF;

  IF _kids_age_band_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM church.kids_age_bands b
                     WHERE b.id = _kids_age_band_id
                       AND b.organization_id = _organization_id) THEN
    RAISE EXCEPTION 'age_band_belongs_to_another_branch';
  END IF;

  IF _room IS NULL THEN
    -- New classroom.
    IF _clean_name IS NULL THEN
      RAISE EXCEPTION 'room_name_required';
    END IF;
    IF EXISTS (SELECT 1 FROM public.rooms r
               WHERE r.organization_id = _organization_id
                 AND lower(r.name) = lower(_clean_name)) THEN
      RAISE EXCEPTION 'room_name_already_used';
    END IF;

    INSERT INTO public.rooms (name, organization_id, is_active)
    VALUES (_clean_name, _organization_id, true)
    RETURNING id INTO _room;
  ELSE
    -- Existing room. A kids_admin who is not an org admin may only touch a
    -- room that is already a children's space.
    IF NOT _is_admin
       AND NOT EXISTS (SELECT 1 FROM church.room_kids_config rk
                       WHERE rk.room_id = _room
                         AND rk.organization_id = _organization_id
                         AND rk.is_checkin_location) THEN
      RAISE EXCEPTION 'not_a_kids_classroom' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.rooms r
                   WHERE r.id = _room AND r.organization_id = _organization_id) THEN
      RAISE EXCEPTION 'room_not_found';
    END IF;

    IF _clean_name IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.rooms r
                 WHERE r.organization_id = _organization_id
                   AND lower(r.name) = lower(_clean_name)
                   AND r.id <> _room) THEN
        RAISE EXCEPTION 'room_name_already_used';
      END IF;
      UPDATE public.rooms SET name = _clean_name, updated_at = now()
       WHERE id = _room;
    END IF;
  END IF;

  -- Taking a room out of children's use while children are standing in it would
  -- drop them off every roster while they are physically still there. Same rule
  -- retire_kids_classroom() enforces, applied to the other door into the same
  -- state change.
  IF NOT coalesce(_is_checkin_location, true)
     AND EXISTS (
       SELECT 1 FROM church.kids_check_ins c
       JOIN church.kids_sessions s
         ON s.id = c.kids_session_id AND s.status = 'open'
       WHERE c.room_id = _room AND c.status = 'checked_in') THEN
    RAISE EXCEPTION 'room_still_has_children'
      USING HINT = 'Check them out or transfer them before removing the room '
                   'from check-in.';
  END IF;

  INSERT INTO church.room_kids_config (
    room_id, organization_id, is_checkin_location, school_grade_id,
    kids_age_band_id, capacity, ratio_children_per_volunteer,
    label_room_name, sort_order)
  VALUES (_room, _organization_id, coalesce(_is_checkin_location, true),
          _school_grade_id, _kids_age_band_id,
          _capacity, _ratio, _label_room_name, coalesce(_sort_order, 0))
  ON CONFLICT (room_id) DO UPDATE SET
    is_checkin_location = EXCLUDED.is_checkin_location,
    is_active = true,
    school_grade_id = EXCLUDED.school_grade_id,
    kids_age_band_id = EXCLUDED.kids_age_band_id,
    capacity = EXCLUDED.capacity,
    ratio_children_per_volunteer = EXCLUDED.ratio_children_per_volunteer,
    label_room_name = EXCLUDED.label_room_name,
    sort_order = EXCLUDED.sort_order,
    updated_at = now()
  RETURNING * INTO _row;

  -- The whole point. A classroom saved at 10:40 is on the tablet now, not after
  -- the next scheduler tick — which on any day that is not the auto-open
  -- weekday is never.
  FOR _session IN
    SELECT s.id FROM church.kids_sessions s
     WHERE s.organization_id = _organization_id AND s.status = 'open'
  LOOP
    PERFORM church.kids_sync_session_rooms(_session.id);
  END LOOP;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION church.upsert_kids_classroom(
  UUID, UUID, TEXT, UUID, UUID, INTEGER, INTEGER, TEXT, INTEGER, BOOLEAN)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 2b. Retiring a classroom takes it off today's board
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.retire_kids_classroom(
  _organization_id UUID, _room_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _still INTEGER;
  _session RECORD;
BEGIN
  IF NOT (_organization_id IN (SELECT church.my_admin_orgs())
          OR church.has_permission_in_org(
               _organization_id,
               ARRAY['kids_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO _still
  FROM church.kids_check_ins c
  JOIN church.kids_sessions s ON s.id = c.kids_session_id AND s.status = 'open'
  WHERE c.room_id = _room_id AND c.status = 'checked_in';

  IF _still > 0 THEN
    RAISE EXCEPTION 'room_still_has_children'
      USING DETAIL = format('%s child(ren) still checked in', _still),
            HINT = 'Check them out or transfer them before retiring the room.';
  END IF;

  UPDATE church.room_kids_config
     SET is_checkin_location = false, updated_at = now()
   WHERE room_id = _room_id AND organization_id = _organization_id;

  -- Off the tablet immediately, for the same reason adding one puts it on.
  FOR _session IN
    SELECT s.id FROM church.kids_sessions s
     WHERE s.organization_id = _organization_id AND s.status = 'open'
  LOOP
    PERFORM church.kids_sync_session_rooms(_session.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION church.retire_kids_classroom(UUID, UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. The station reconciles as it lists
-- ---------------------------------------------------------------------------
--
-- Belt as well as braces, and the only part that repairs a session whose rooms
-- were already orphaned before this migration ran. It also covers every writer
-- of room_kids_config that is not upsert_kids_classroom — set_room_kids_config,
-- a future screen, a correction typed at the SQL prompt — without each of them
-- having to remember.
--
-- VOLATILE now, necessarily: a STABLE function cannot write. Nothing calls this
-- from inside a query, only PostgREST, and supabase-js posts RPCs regardless of
-- volatility, so the change is invisible to the caller.
--
-- Only for a session that is actually open. The desk keeps working after the
-- service ends so that checkout, the roster and the safety card survive, and
-- attaching rooms to a closed session then would be noise.
CREATE OR REPLACE FUNCTION church.station_session_rooms(
  _kids_session_id UUID, _shift_token TEXT DEFAULT NULL)
RETURNS TABLE (
  room_id UUID,
  room_name TEXT,
  grade_name TEXT,
  age_band_name TEXT,
  capacity INTEGER,
  checked_in_count BIGINT,
  teachers TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a church.resolved_actor;
  _open BOOLEAN;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  -- Same-branch check before writing anything. The listing below filters on the
  -- actor's organization anyway; this stops a session id from another branch
  -- reaching the reconciler at all.
  SELECT (s.status = 'open') INTO _open
  FROM church.kids_sessions s
  WHERE s.id = _kids_session_id AND s.organization_id = a.organization_id;

  IF coalesce(_open, false) THEN
    PERFORM church.kids_sync_session_rooms(_kids_session_id);
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    coalesce(rk.label_room_name, r.name),
    g.display_name,
    b.display_name,
    coalesce(sr.capacity_override, rk.capacity),
    coalesce(live.n, 0),
    teach.names
  FROM church.kids_session_rooms sr
  JOIN public.rooms r ON r.id = sr.room_id
  LEFT JOIN church.room_kids_config rk ON rk.room_id = r.id
  LEFT JOIN church.school_grades g ON g.id = rk.school_grade_id
  LEFT JOIN church.kids_age_bands b ON b.id = rk.kids_age_band_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM church.kids_check_ins c
    WHERE c.kids_session_id = sr.kids_session_id
      AND c.room_id = r.id AND c.status = 'checked_in'
  ) live ON true
  LEFT JOIN LATERAL (
    SELECT string_agg(coalesce(p.preferred_name, p.first_name),
                      ', ' ORDER BY t.is_lead DESC, p.first_name) AS names
    FROM church.kids_classroom_teachers t
    JOIN church.people p ON p.id = t.person_id
    WHERE t.room_id = r.id AND t.effective_to IS NULL
  ) teach ON true
  WHERE sr.kids_session_id = _kids_session_id
    AND sr.organization_id = a.organization_id
    AND sr.is_open
  -- Grade order, so the picker reads Pre-K to Grade 8 the way the Classrooms
  -- tab does, rather than in room-creation order. A room with no grade sorts
  -- last, where it cannot be picked by accident.
  ORDER BY coalesce(g.sort_order, 9999),
           coalesce(rk.sort_order, 0),
           coalesce(rk.label_room_name, r.name);
END;
$$;

GRANT EXECUTE ON FUNCTION church.station_session_rooms(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. Repair the sessions that are open right now
-- ---------------------------------------------------------------------------
--
-- Everything above fixes the next save and the next listing. A session open at
-- the moment this runs still carries the room list it was born with, and the
-- rooms added since — Test Room, Test Room 2 — are missing from it.
DO $$
DECLARE
  s RECORD;
  _added INTEGER;
  _closed INTEGER;
BEGIN
  FOR s IN SELECT id FROM church.kids_sessions WHERE status = 'open' LOOP
    SELECT r.rooms_attached, r.rooms_closed INTO _added, _closed
    FROM church.kids_sync_session_rooms(s.id) r;
    IF _added > 0 OR _closed > 0 THEN
      RAISE NOTICE 'session %: % classroom(s) attached, % closed',
        s.id, _added, _closed;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
