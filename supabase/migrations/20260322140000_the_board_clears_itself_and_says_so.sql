-- =====================================================
-- The board clears itself, and tells the leaders it did
-- =====================================================
--
-- Right now 49 children are sitting on the live board marked checked_in, the
-- oldest from a service that ended twenty-six days ago. That is not a bug in
-- the scheduler — kids_session_tick has been closing sessions on time every
-- week since 20260320010000. It is a deliberate decision, stated in
-- kids_auto_close_sessions:
--
--     "Closing does NOT check anybody out. A child still marked checked_in
--      stays that way and keeps showing on the 'not collected' screen, which
--      is the point of that screen."
--
-- That reasoning is sound and this migration does not overturn it. What it
-- overturns is the consequence nobody intended: an alarm that is never cleared
-- stops being an alarm. Twenty-six days of un-collected children on the board
-- is indistinguishable from a real one this morning, so the screen that exists
-- to make an uncollected child impossible to miss has become the screen
-- everybody scrolls past. Clearing it on a timer, and telling the leaders
-- what was cleared, is what makes tomorrow's genuine case visible.
--
-- NOTHING HERE CLAIMS A CHILD WAS COLLECTED, and that is the whole design.
-- church.expire_stale_check_ins already existed and already got this right:
--
--     "'expired' is a data-hygiene state. It records that nobody checked the
--      child out, NOT a claim that the child was collected."
--
-- status becomes 'expired', never 'checked_out'. checkout_method stays
-- 'system_auto'. The parent notification trigger does not fire — it is gated
-- on WHEN (OLD.status = 'checked_in' AND NEW.status = 'checked_out') and
-- refuses system_auto a second time inside the function body, because
-- 20260320001600 had already worked out that telling a parent their child was
-- picked up when the system merely gave up is the worst message this system
-- could send.
--
-- WHAT WAS ACTUALLY MISSING was that nothing ever CALLED it. Grep says
-- expire_stale_check_ins has exactly one caller, close_todays_sessions, which
-- is a manual kids_admin action. If nobody presses the button, nobody expires,
-- which is precisely what the 49 rows are a record of. The tick closes the
-- session and walks past the children.
--
-- THREE CHANGES:
--   1. The tick calls it. Four hours after the service ends — the existing
--      kids_events.auto_expire_minutes_after_end, already 240 everywhere, the
--      same window that already closes the session.
--   2. It tells every kids_admin, by email, with the children named. An
--      automatic action on a child's record that nobody is told about is worse
--      than the stale board.
--   3. A kids_admin can do it on demand, for the Sunday the desk forgets.
--
-- ON THE FOUR HOURS. Silver Spring's event is configured 11:00 local for 150
-- minutes, so the service ends 13:30 and this fires at 17:30. Springfield
-- starts 10:30 and fires at 17:00. Nothing here hardcodes a time: it is read
-- per event, in the organization's own timezone, off TIMESTAMPTZ columns. If
-- the service really runs to 14:00, the fix is kids_events.service_minutes,
-- not this file.

-- ---------------------------------------------------------------------------
-- 1. A notification kind for it
-- ---------------------------------------------------------------------------
-- The existing three kinds all go to a PARENT about one child. This one goes
-- to the leadership about a list, which is why it needs its own kind rather
-- than borrowing 'check_out' — a row that says check_out and is addressed to
-- staff would be read as a pickup record by the next person to query this
-- table.
ALTER TABLE church.notification_log
  DROP CONSTRAINT IF EXISTS chk_notification_kind;

ALTER TABLE church.notification_log
  ADD CONSTRAINT chk_notification_kind CHECK (kind IN
    ('check_in', 'check_out', 'volunteer_message', 'kids_auto_expired'));

-- ---------------------------------------------------------------------------
-- 2. Who counts as a leader to tell
-- ---------------------------------------------------------------------------
-- kids_admin holders plus organization admins, because an org admin implicitly
-- holds every module capability (see resolveCapabilities in
-- src/shared/lib/capabilities.ts) and would reasonably expect to hear about an
-- automated action on a child's record.
--
-- kids_leader and kids_volunteer are deliberately NOT told. A team lead runs
-- their own grades and a volunteer runs the desk; neither is who you escalate
-- an uncollected child to, and a mailing list that includes forty people is one
-- nobody reads.
CREATE OR REPLACE FUNCTION church.kids_leaders_to_notify(_organization_id UUID)
RETURNS TABLE (full_name TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT DISTINCT
         coalesce(p.full_name, split_part(p.email, '@', 1)),
         p.email
  FROM public.profiles p
  WHERE p.email IS NOT NULL
    AND btrim(p.email) <> ''
    AND (
      EXISTS (SELECT 1 FROM church.module_grants g
               WHERE g.user_id = p.id
                 AND g.organization_id = _organization_id
                 AND g.permission = 'kids_admin')
      OR
      EXISTS (SELECT 1 FROM public.user_organizations uo
               WHERE uo.user_id = p.id
                 AND uo.organization_id = _organization_id
                 AND uo.role = 'admin')
    );
$$;

REVOKE ALL ON FUNCTION church.kids_leaders_to_notify(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_leaders_to_notify(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The shared body of the message
-- ---------------------------------------------------------------------------
-- One row per leader per organization. Queued, not sent: the existing
-- send-kids-notification drainer picks it up on its own schedule, and its
-- renderer is generic over subject/body, so a new kind needs no change there.
--
-- The wording is the careful part. "Checked out" is the phrase this email must
-- never use, because it is the phrase that would be wrong.
CREATE OR REPLACE FUNCTION church.kids_notify_expired(
  _organization_id UUID,
  _names TEXT[],
  _automatic BOOLEAN,
  _actor TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _n INTEGER := 0;
  _subject TEXT;
  _body TEXT;
  _count INTEGER := coalesce(array_length(_names, 1), 0);
BEGIN
  IF _count = 0 THEN RETURN 0; END IF;

  _subject := format('%s %s closed off the check-in board',
                     _count,
                     CASE WHEN _count = 1 THEN 'child was' ELSE 'children were' END);

  _body := format(
      E'%s\n\n%s\n\n',
      CASE WHEN _automatic
           THEN 'The system closed off the following check-ins four hours after '
                'the service ended, because nobody checked them out at the desk.'
           ELSE format('%s closed off the following check-ins from the Kids '
                       'Ministry board.', _actor) END,
      (SELECT string_agg('  - ' || n, E'\n') FROM unnest(_names) AS n))
    || 'These records are marked EXPIRED, not collected. The system does not '
    || 'know who picked these children up, and nobody has said that they were. '
    || 'If any of them is unaccounted for, this email is the only notice you '
    || 'will get.';

  INSERT INTO church.notification_log
    (organization_id, kind, channel, recipient_name, recipient_email,
     subject, body, sent_by_name)
  SELECT _organization_id, 'kids_auto_expired', 'email', l.full_name, l.email,
         _subject, _body, CASE WHEN _automatic THEN 'system' ELSE _actor END
  FROM church.kids_leaders_to_notify(_organization_id) l;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_notify_expired(UUID, TEXT[], BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_notify_expired(UUID, TEXT[], BOOLEAN, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. The automatic sweep, now with a voice
-- ---------------------------------------------------------------------------
-- Same predicate and same writes as 20260320001000. What is added is the
-- notification, and a per-organization grouping so two branches do not appear
-- in each other's email.
--
-- IDEMPOTENT by construction: it only ever touches status = 'checked_in', and
-- leaves those rows 'expired', so a second run in the same minute finds
-- nothing and sends nothing. That matters because the tick runs every ten
-- minutes and the window it tests stays true forever afterwards.
--
-- The UPDATE takes its own row locks. A volunteer checking a child out at the
-- same instant either wins — and the row is no longer 'checked_in', so this
-- skips it — or loses and finds the row already expired, which the station
-- reports rather than silently overwriting.
CREATE OR REPLACE FUNCTION church.expire_stale_check_ins()
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _n INTEGER := 0;
  -- {organization_id: [child names]}. A jsonb rather than a temp table: this
  -- is SECURITY DEFINER with a pinned search_path, and pg_temp does not belong
  -- in one of those.
  _grouped JSONB := '{}'::jsonb;
  _org TEXT;
  _names JSONB;
BEGIN
  WITH stale AS (
    UPDATE church.kids_check_ins ci
       SET status = 'expired', checked_out_at = now(),
           checkout_method = 'system_auto',
           checked_out_by_name = 'system (auto-expire)',
           updated_at = now()
      FROM church.kids_sessions ks, church.kids_events ke
     WHERE ks.id = ci.kids_session_id AND ke.id = ks.kids_event_id
       AND ci.status = 'checked_in'
       AND now() > ks.ends_at + make_interval(mins => ke.auto_expire_minutes_after_end)
    RETURNING ci.id, ci.organization_id, ci.child_person_id,
              ci.kids_session_id, ci.label_child_name
  ), audited AS (
    -- A data-modifying CTE runs to completion whether or not the outer query
    -- reads it, so the audit is written even though nothing selects from here.
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, kids_session_id,
       child_person_id, actor_name, detail)
    SELECT organization_id, 'auto_expired', 'success', id, kids_session_id,
           child_person_id, 'system',
           jsonb_build_object('reason', 'past auto_expire_minutes_after_end')
    FROM stale
    RETURNING 1
  ), grouped AS (
    SELECT organization_id::TEXT AS org,
           array_agg(label_child_name ORDER BY label_child_name) AS names,
           count(*)::INTEGER AS cnt
    FROM stale GROUP BY organization_id
  )
  SELECT coalesce(jsonb_object_agg(org, to_jsonb(names)), '{}'::jsonb),
         coalesce(sum(cnt), 0)::INTEGER
    INTO _grouped, _n
  FROM grouped;

  IF coalesce(_n, 0) = 0 THEN RETURN 0; END IF;

  FOR _org, _names IN SELECT key, value FROM jsonb_each(_grouped)
  LOOP
    PERFORM church.kids_notify_expired(
      _org::UUID,
      ARRAY(SELECT jsonb_array_elements_text(_names)),
      true, 'system');
  END LOOP;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.expire_stale_check_ins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.expire_stale_check_ins() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The tick calls it
-- ---------------------------------------------------------------------------
-- Order matters and is the same argument 20260320010000 made for closing
-- before opening: expire against last week's session before this week's is
-- created, so a child can never be expired against the wrong Sunday.
CREATE OR REPLACE FUNCTION church.kids_session_tick()
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.kids_auto_close_sessions();
  -- NEW at 20260322140000. The session was already being closed on time; the
  -- children in it were not, and that is what left 49 of them on the board.
  PERFORM church.expire_stale_check_ins();
  PERFORM church.kids_auto_open_sessions();
END;
$$;

REVOKE ALL ON FUNCTION church.kids_session_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_session_tick() TO service_role;

COMMENT ON FUNCTION church.kids_session_tick() IS
  'Scheduler entry point, every 10 minutes: closes sessions past their event''s '
  'auto_expire window, expires any child still checked in past that same '
  'window (emailing the kids admins the names), then opens any session whose '
  'check-in window has arrived in the organization''s local timezone.';

-- ---------------------------------------------------------------------------
-- 6. The Sunday the desk forgets
-- ---------------------------------------------------------------------------
-- kids_admin ONLY, and deliberately not kids_leader. Closing off every
-- remaining child in the branch is the same class of act as authorising an
-- override — it is the one that makes an uncollected child stop being visible
-- — and 20260321001100 is explicit that a control four of six leaders can
-- self-authorise is not a control.
--
-- It does NOT wait for the four hours. An admin standing in an empty building
-- at 14:10 knows something the timer does not, and making them wait until
-- 17:30 to tidy a board they are looking at now is the kind of rule that gets
-- worked around with a direct database edit.
--
-- It writes exactly what the automatic sweep writes, except the name: this was
-- a person's decision and the record says whose.
CREATE OR REPLACE FUNCTION church.kids_expire_open_check_ins(
  _organization_id UUID,
  _kids_session_id UUID DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS TABLE (expired_count INTEGER, child_names TEXT[])
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _actor TEXT;
  _names TEXT[];
  _n INTEGER := 0;
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Closing off the whole board is a Kids Ministry leader action.';
  END IF;

  SELECT coalesce(full_name, 'A Kids Ministry leader') INTO _actor
    FROM public.profiles WHERE id = auth.uid();
  _actor := coalesce(_actor, 'A Kids Ministry leader');

  WITH cleared AS (
    UPDATE church.kids_check_ins ci
       SET status = 'expired', checked_out_at = now(),
           checkout_method = 'system_auto',
           checked_out_by_name = _actor || ' (closed off the board)',
           today_note = coalesce(_note, ci.today_note),
           updated_at = now()
     WHERE ci.organization_id = _organization_id
       AND ci.status = 'checked_in'
       AND (_kids_session_id IS NULL OR ci.kids_session_id = _kids_session_id)
    RETURNING ci.id, ci.child_person_id, ci.kids_session_id, ci.label_child_name
  ), audited AS (
    INSERT INTO church.check_in_audit
      (organization_id, action, outcome, check_in_id, kids_session_id,
       child_person_id, actor_auth_user_id, actor_name, detail)
    SELECT _organization_id, 'auto_expired', 'success', id, kids_session_id,
           child_person_id, auth.uid(), _actor,
           jsonb_build_object(
             'reason', 'closed off from the live board',
             'note', _note)
    FROM cleared
    RETURNING 1
  )
  SELECT array_agg(label_child_name ORDER BY label_child_name), count(*)::INTEGER
    INTO _names, _n
  FROM cleared;

  IF coalesce(_n, 0) = 0 THEN
    RETURN QUERY SELECT 0, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  -- The leaders hear about this one too. The admin who pressed it knows; the
  -- other five do not, and "who cleared the board and when" is exactly the
  -- question asked afterwards.
  PERFORM church.kids_notify_expired(_organization_id, _names, false, _actor);

  RETURN QUERY SELECT _n, _names;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_expire_open_check_ins(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_expire_open_check_ins(UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION church.kids_expire_open_check_ins(UUID, UUID, TEXT) IS
  'Close off every child still checked in, for one session or the whole '
  'branch. kids_admin only. Marks them EXPIRED — a record that nobody checked '
  'them out, never a claim that they were collected — and emails the leaders '
  'the names.';

-- ---------------------------------------------------------------------------
-- 7. The forty-nine already on the board
-- ---------------------------------------------------------------------------
-- Cleared here, in the migration, deliberately WITHOUT an email.
--
-- The first tick after this deploys would otherwise send every kids_admin a
-- forty-nine-name alarm about services that ended up to twenty-six days ago,
-- most of it sample data from before the branch went live. An alert that
-- arrives already stale teaches its readers to ignore the next one, and the
-- next one is the real Sunday this feature exists for.
--
-- They still become 'expired' and they are still written to check_in_audit, so
-- the history is intact and says the same thing it would have said. What is
-- skipped is only the notification.
DO $backfill$
DECLARE _n INTEGER;
BEGIN
  WITH stale AS (
    UPDATE church.kids_check_ins ci
       SET status = 'expired', checked_out_at = now(),
           checkout_method = 'system_auto',
           checked_out_by_name = 'system (backfill 20260322140000)',
           updated_at = now()
      FROM church.kids_sessions ks, church.kids_events ke
     WHERE ks.id = ci.kids_session_id AND ke.id = ks.kids_event_id
       AND ci.status = 'checked_in'
       AND now() > ks.ends_at + make_interval(mins => ke.auto_expire_minutes_after_end)
    RETURNING ci.id, ci.organization_id, ci.child_person_id, ci.kids_session_id
  )
  INSERT INTO church.check_in_audit
    (organization_id, action, outcome, check_in_id, kids_session_id,
     child_person_id, actor_name, detail)
  SELECT organization_id, 'auto_expired', 'success', id, kids_session_id,
         child_person_id, 'system',
         jsonb_build_object(
           'reason', 'backfill: stale before automatic expiry was scheduled',
           'migration', '20260322140000')
  FROM stale;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RAISE NOTICE 'Backfilled % stale check-in(s) without notifying', _n;
END
$backfill$;

NOTIFY pgrst, 'reload schema';
