-- Assertions for 20260322440000, inside BEGIN/ROLLBACK.
--
-- A contributor can change a budget request only in its season, an admin at
-- any time, VA as before; the reminder schedule is the one agreed; and a
-- reminder reaches a contributor whose ministry has not submitted, naming it,
-- and nobody whose ministry has.
--
-- Written on 20 October 2026, when 2027 was in season. Every check that
-- depends on the date works out what it should see from the date, so the
-- file still means something after 1 November.

CREATE TEMP TABLE t AS
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID AS md,
       'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::UUID AS va,
       (now() AT TIME ZONE 'America/New_York')::DATE AS today,
       extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER AS this_year;

DO $setup$
DECLARE
  _md UUID; _y INTEGER;
  _c UUID; _m UUID; _a UUID; _m2 UUID;
  _fy_now UUID; _fy_next UUID; _fy_after UUID;
BEGIN
  SELECT md, this_year INTO _md, _y FROM t;

  -- A contributor of MD whose profile names an active ministry, and who is
  -- an admin nowhere in MD.
  SELECT uo.user_id, m.id INTO _c, _m
  FROM public.user_organizations uo
  JOIN public.profiles p ON p.id = uo.user_id
  JOIN budget.ministries m ON m.organization_id = _md AND m.is_active
   AND lower(btrim(m.name)) = lower(btrim(p.ministry_name))
  WHERE uo.organization_id = _md AND uo.role = 'contributor'
  ORDER BY uo.user_id LIMIT 1;
  IF _c IS NULL THEN RAISE EXCEPTION 'SKIP: no MD contributor with a ministry'; END IF;

  SELECT uo.user_id INTO _a FROM public.user_organizations uo
   WHERE uo.organization_id = _md AND uo.role = 'admin' ORDER BY uo.user_id LIMIT 1;

  -- A second ministry with a contributor, to show one ministry's request
  -- does not silence another's reminder.
  SELECT m.id INTO _m2
  FROM budget.ministries m
  WHERE m.organization_id = _md AND m.is_active AND m.id <> _m
    AND EXISTS (SELECT 1 FROM public.user_organizations uo
                JOIN public.profiles p ON p.id = uo.user_id
                WHERE uo.organization_id = _md AND uo.role = 'contributor'
                  AND uo.user_id <> _c
                  AND lower(btrim(p.ministry_name)) = lower(btrim(m.name)))
  ORDER BY m.name LIMIT 1;

  -- The years: this one (its season is over), next (in season or about to
  -- be), and the one after (its season is a year away). Made if missing; it
  -- all rolls back.
  INSERT INTO budget.fiscal_years (organization_id, year, name, is_active)
  SELECT _md, y, y::TEXT, false FROM generate_series(_y, _y + 2) y
  WHERE NOT EXISTS (SELECT 1 FROM budget.fiscal_years f
                    WHERE f.organization_id = _md AND f.year = y);
  SELECT id INTO _fy_now FROM budget.fiscal_years WHERE organization_id = _md AND year = _y;
  SELECT id INTO _fy_next FROM budget.fiscal_years WHERE organization_id = _md AND year = _y + 1;
  SELECT id INTO _fy_after FROM budget.fiscal_years WHERE organization_id = _md AND year = _y + 2;

  ALTER TABLE t ADD COLUMN c UUID; ALTER TABLE t ADD COLUMN m UUID;
  ALTER TABLE t ADD COLUMN a UUID; ALTER TABLE t ADD COLUMN m2 UUID;
  ALTER TABLE t ADD COLUMN fy_now UUID; ALTER TABLE t ADD COLUMN fy_next UUID;
  ALTER TABLE t ADD COLUMN fy_after UUID;
  UPDATE t SET c = _c, m = _m, a = _a, m2 = _m2,
               fy_now = _fy_now, fy_next = _fy_next, fy_after = _fy_after;
END;
$setup$;

-- 1. The season is 1 September to the end of 1 November, Eastern.
DO $a$
DECLARE w RECORD;
BEGIN
  SELECT * INTO w FROM budget.request_window(2027);
  IF w.opens_at <> TIMESTAMPTZ '2026-09-01 04:00:00+00' THEN
    RAISE EXCEPTION 'FAIL 1: 2027 opens at %', w.opens_at; END IF;
  -- Daylight saving ends at 2am on 1 November 2026, so midnight that night
  -- is 05:00 UTC, not 04:00.
  IF w.closes_at <> TIMESTAMPTZ '2026-11-02 05:00:00+00' THEN
    RAISE EXCEPTION 'FAIL 1a: 2027 closes at %', w.closes_at; END IF;
  IF w.opens_on <> DATE '2026-09-01' OR w.last_day <> DATE '2026-11-01' THEN
    RAISE EXCEPTION 'FAIL 1b: days are % to %', w.opens_on, w.last_day; END IF;
  RAISE NOTICE 'PASS 1';
END;
$a$;

-- 2. The reminder days, and only those.
DO $a$
DECLARE _days TEXT;
BEGIN
  SELECT string_agg(to_char(d, 'MM-DD') || '=' || budget.request_reminder_stage(d::DATE), ' ' ORDER BY d)
    INTO _days
  FROM generate_series(DATE '2026-01-01', DATE '2026-12-31', interval '1 day') d
  WHERE budget.request_reminder_stage(d::DATE) IS NOT NULL;
  IF _days IS DISTINCT FROM
     '08-15=upcoming 08-22=upcoming 08-29=upcoming 09-01=opened '
     || '09-15=reminder 10-01=reminder 10-15=reminder 10-22=reminder '
     || '10-28=final 10-29=final 10-30=final 10-31=final 11-01=final' THEN
    RAISE EXCEPTION 'FAIL 2: the schedule is %', _days;
  END IF;
  RAISE NOTICE 'PASS 2';
END;
$a$;

-- 3. A contributor cannot add to, change, move or delete a request in a year
--    whose season is over, nor its amounts, and is told why.
DO $a$
DECLARE r t%ROWTYPE; _id UUID; _msg TEXT;
BEGIN
  SELECT * INTO r FROM t;

  -- Made with nobody signed in, as a job would: that is allowed.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (r.md, r.fy_now, r.m, r.c, 'ZZ Test', 100, 'zz closed year', 'pending')
  RETURNING id INTO _id;

  PERFORM set_config('request.jwt.claim.sub', r.c::TEXT, true);

  BEGIN
    INSERT INTO budget.allocation_requests
      (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
       requested_amount, justification, status)
    VALUES (r.md, r.fy_now, r.m, r.c, 'ZZ Test', 100, 'zz closed year', 'draft');
    RAISE EXCEPTION 'FAIL 3: a contributor added to a closed year';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
    IF _msg <> format('Budget requests for %s closed on November 1, %s. '
                      || 'Please ask an administrator to make any change.',
                      r.this_year, r.this_year - 1) THEN
      RAISE EXCEPTION 'FAIL 3a: refused, but in these words: %', _msg;
    END IF;
  END;

  BEGIN
    UPDATE budget.allocation_requests SET requested_amount = 200 WHERE id = _id;
    RAISE EXCEPTION 'FAIL 3b: a contributor changed a closed request';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE budget.allocation_requests SET status = 'cancelled' WHERE id = _id;
    RAISE EXCEPTION 'FAIL 3c: a contributor withdrew a closed request';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE budget.allocation_requests SET fiscal_year_id = r.fy_next WHERE id = _id;
    RAISE EXCEPTION 'FAIL 3d: a contributor moved a closed request into another year';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO budget.allocation_period_amounts (allocation_request_id, period_number, amount)
    VALUES (_id, 1, 50);
    RAISE EXCEPTION 'FAIL 3e: a contributor added an amount to a closed request';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM budget.allocation_requests WHERE id = _id;
    RAISE EXCEPTION 'FAIL 3f: a contributor deleted a closed request';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  IF (SELECT requested_amount FROM budget.allocation_requests WHERE id = _id) <> 100 THEN
    RAISE EXCEPTION 'FAIL 3g: the closed request changed anyway'; END IF;

  ALTER TABLE t ADD COLUMN closed_req UUID;
  UPDATE t SET closed_req = _id;
  RAISE NOTICE 'PASS 3';
END;
$a$;

-- 4. An admin of the branch can, in any year.
DO $a$
DECLARE r t%ROWTYPE; _id UUID;
BEGIN
  SELECT * INTO r FROM t;
  IF r.a IS NULL THEN RAISE EXCEPTION 'FAIL 4: no MD admin to test with'; END IF;
  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);

  UPDATE budget.allocation_requests SET requested_amount = 300 WHERE id = r.closed_req;
  INSERT INTO budget.allocation_period_amounts (allocation_request_id, period_number, amount)
  VALUES (r.closed_req, 1, 50);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (r.md, r.fy_after, r.m, r.a, 'ZZ Admin', 100, 'zz far year', 'draft')
  RETURNING id INTO _id;
  DELETE FROM budget.allocation_requests WHERE id = _id;

  IF (SELECT requested_amount FROM budget.allocation_requests WHERE id = r.closed_req) <> 300 THEN
    RAISE EXCEPTION 'FAIL 4a: the admin''s change did not land'; END IF;
  RAISE NOTICE 'PASS 4';
END;
$a$;

-- 5. Next year: open to a contributor in its season and refused outside it,
--    with the date it opens. The year after is never open yet.
DO $a$
DECLARE r t%ROWTYPE; _id UUID; _msg TEXT; _open BOOLEAN; w RECORD;
BEGIN
  SELECT * INTO r FROM t;
  SELECT * INTO w FROM budget.request_window(r.this_year + 1);
  _open := now() >= w.opens_at AND now() < w.closes_at;
  PERFORM set_config('request.jwt.claim.sub', r.c::TEXT, true);

  BEGIN
    INSERT INTO budget.allocation_requests
      (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
       requested_amount, justification, status)
    VALUES (r.md, r.fy_next, r.m, r.c, 'ZZ Test', 100, 'zz next year', 'draft')
    RETURNING id INTO _id;
    IF NOT _open THEN RAISE EXCEPTION 'FAIL 5: added to next year out of season'; END IF;
    UPDATE budget.allocation_requests
       SET requested_amount = 150, status = 'pending' WHERE id = _id;
    INSERT INTO budget.allocation_period_amounts (allocation_request_id, period_number, amount)
    VALUES (_id, 1, 75);
    UPDATE budget.allocation_requests SET status = 'cancelled' WHERE id = _id;
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
    IF _open THEN RAISE EXCEPTION 'FAIL 5a: refused in season: %', _msg; END IF;
  END;

  BEGIN
    INSERT INTO budget.allocation_requests
      (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
       requested_amount, justification, status)
    VALUES (r.md, r.fy_after, r.m, r.c, 'ZZ Test', 100, 'zz far year', 'draft');
    RAISE EXCEPTION 'FAIL 5b: added to a year whose season is a year away';
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT;
    IF _msg LIKE 'FAIL%' THEN RAISE; END IF;
    IF _msg <> format('Budget requests for %s open on September 1, %s.',
                      r.this_year + 2, r.this_year + 1) THEN
      RAISE EXCEPTION 'FAIL 5c: refused, but in these words: %', _msg;
    END IF;
  END;
  RAISE NOTICE 'PASS 5';
END;
$a$;

-- 6. VA has no season until it is given one: a contributor works as before.
DO $a$
DECLARE r t%ROWTYPE; _fy UUID; _vm UUID;
BEGIN
  SELECT * INTO r FROM t;
  SELECT id INTO _fy FROM budget.fiscal_years WHERE organization_id = r.va AND year = r.this_year;
  SELECT id INTO _vm FROM budget.ministries WHERE organization_id = r.va AND is_active ORDER BY name LIMIT 1;
  IF _fy IS NULL OR _vm IS NULL THEN RAISE EXCEPTION 'FAIL 6: no VA year or ministry'; END IF;
  PERFORM set_config('request.jwt.claim.sub', r.c::TEXT, true);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (r.va, _fy, _vm, r.c, 'ZZ Test', 100, 'zz va', 'draft');
  RAISE NOTICE 'PASS 6';
END;
$a$;

-- 7. What the Budget page is told.
DO $a$
DECLARE r t%ROWTYPE; s RECORD; w RECORD; _state TEXT;
BEGIN
  SELECT * INTO r FROM t;
  SELECT * INTO w FROM budget.request_window(r.this_year + 1);
  -- Not inline in the IF: PL/pgSQL ends an IF condition at its first THEN.
  _state := CASE WHEN now() < w.opens_at THEN 'upcoming'
                 WHEN now() < w.closes_at THEN 'open' ELSE 'closed' END;

  PERFORM set_config('request.jwt.claim.sub', r.c::TEXT, true);
  SELECT * INTO s FROM budget.request_season(r.md);
  IF NOT s.enforced OR s.fiscal_year <> r.this_year + 1 OR s.fiscal_year_id <> r.fy_next THEN
    RAISE EXCEPTION 'FAIL 7: MD season is % for % (%)', s.enforced, s.fiscal_year, s.fiscal_year_id;
  END IF;
  IF s.state <> _state THEN
    RAISE EXCEPTION 'FAIL 7a: state %, wanted %', s.state, _state; END IF;
  IF s.state = 'open' AND s.days_left IS DISTINCT FROM (w.last_day - r.today) THEN
    RAISE EXCEPTION 'FAIL 7b: % days left', s.days_left; END IF;
  IF s.state <> 'open' AND s.days_left IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7c: days left out of season'; END IF;
  IF s.can_bypass THEN RAISE EXCEPTION 'FAIL 7d: a contributor may bypass'; END IF;

  PERFORM set_config('request.jwt.claim.sub', r.a::TEXT, true);
  SELECT * INTO s FROM budget.request_season(r.md);
  IF NOT s.can_bypass THEN RAISE EXCEPTION 'FAIL 7e: the admin may not bypass'; END IF;

  -- Asked by somebody who is not staff there, it refuses.
  IF NOT public.is_staff(r.va) THEN
    BEGIN
      PERFORM budget.request_season(r.va);
      RAISE EXCEPTION 'FAIL 7f: told a stranger about VA';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END IF;

  PERFORM set_config('request.jwt.claim.sub',
    (SELECT uo.user_id::TEXT FROM public.user_organizations uo
      WHERE uo.organization_id = r.va AND uo.role = 'contributor'
      ORDER BY uo.user_id LIMIT 1), true);
  SELECT * INTO s FROM budget.request_season(r.va);
  IF s.enforced THEN RAISE EXCEPTION 'FAIL 7g: VA has a season'; END IF;
  RAISE NOTICE 'PASS 7';
END;
$a$;

-- 8. The reminder reaches the contributor whose ministry has nothing in,
--    names the ministry, says who it is from, and is queued once a day.
--    A draft does not count as submitted. Dated 22 October 2026, so the
--    year asked about is 2027 whatever today is.
DO $a$
DECLARE r t%ROWTYPE; rem RECORD; _n INTEGER; _fy27 UUID; _mname TEXT;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT id INTO _fy27 FROM budget.fiscal_years WHERE organization_id = r.md AND year = 2027;
  SELECT name INTO _mname FROM budget.ministries WHERE id = r.m;

  -- Clear the ground: nothing of this ministry's counts as submitted, and
  -- the contributor has a draft.
  UPDATE budget.allocation_requests SET status = 'cancelled'
   WHERE ministry_id = r.m AND fiscal_year_id = _fy27;
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (r.md, _fy27, r.m, r.c, 'ZZ Test', 100, 'zz draft', 'draft');
  DELETE FROM budget.request_reminders WHERE organization_id = r.md AND fiscal_year = 2027;

  _n := budget.queue_request_reminders(r.md, DATE '2026-10-22');
  IF _n < 1 THEN RAISE EXCEPTION 'FAIL 8: nothing queued'; END IF;

  SELECT * INTO rem FROM budget.request_reminders
   WHERE user_id = r.c AND send_on = DATE '2026-10-22';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAIL 8a: the contributor with only a draft was not queued'; END IF;
  IF rem.stage <> 'reminder' OR rem.fiscal_year <> 2027 OR rem.status <> 'queued'
     OR rem.last_day <> DATE '2026-11-01' OR rem.opens_on <> DATE '2026-09-01'
     OR rem.signed_by <> 'ALIC MD Leadership Council' THEN
    RAISE EXCEPTION 'FAIL 8b: queued as % % % % %', rem.stage, rem.fiscal_year, rem.status, rem.last_day, rem.signed_by;
  END IF;
  IF NOT (_mname = ANY (rem.ministry_names)) THEN
    RAISE EXCEPTION 'FAIL 8c: the email does not name %: %', _mname, rem.ministry_names;
  END IF;
  IF rem.recipient_email IS DISTINCT FROM (SELECT email FROM auth.users WHERE id = r.c) THEN
    RAISE EXCEPTION 'FAIL 8d: addressed to %', rem.recipient_email; END IF;

  -- Nobody but contributors, and only MD.
  IF EXISTS (SELECT 1 FROM budget.request_reminders q
             LEFT JOIN public.user_organizations uo
               ON uo.user_id = q.user_id AND uo.organization_id = q.organization_id
             WHERE q.send_on = DATE '2026-10-22'
               AND (q.organization_id <> r.md OR uo.role IS DISTINCT FROM 'contributor')) THEN
    RAISE EXCEPTION 'FAIL 8e: a reminder went to someone who is not an MD contributor'; END IF;

  IF budget.queue_request_reminders(r.md, DATE '2026-10-22') <> 0 THEN
    RAISE EXCEPTION 'FAIL 8f: queued twice in a day'; END IF;
  IF budget.queue_request_reminders(r.md, DATE '2026-10-21') <> 0 THEN
    RAISE EXCEPTION 'FAIL 8g: queued on a day with no reminder'; END IF;
  IF budget.queue_request_reminders(r.va, DATE '2026-10-22') <> 0 THEN
    RAISE EXCEPTION 'FAIL 8h: VA was queued'; END IF;

  -- Sent on a day off the schedule, when asked to. Called on its own: one
  -- expression cannot see the rows it inserts.
  _n := budget.queue_request_reminders(r.md, DATE '2026-10-20', 'reminder');
  IF _n < 1
     OR NOT EXISTS (SELECT 1 FROM budget.request_reminders
                    WHERE user_id = r.c AND send_on = DATE '2026-10-20' AND stage = 'reminder') THEN
    RAISE EXCEPTION 'FAIL 8i: the reminder sent off the schedule did not queue'; END IF;
  RAISE NOTICE 'PASS 8';
END;
$a$;

-- 9. Once the ministry has submitted, its contributor hears no more; another
--    ministry's contributor still does.
DO $a$
DECLARE r t%ROWTYPE; _fy27 UUID;
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT id INTO _fy27 FROM budget.fiscal_years WHERE organization_id = r.md AND year = 2027;

  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (r.md, _fy27, r.m, r.c, 'ZZ Test', 100, 'zz submitted', 'pending');

  IF r.m2 IS NOT NULL THEN
    UPDATE budget.allocation_requests SET status = 'cancelled'
     WHERE ministry_id = r.m2 AND fiscal_year_id = _fy27;
  END IF;

  PERFORM budget.queue_request_reminders(r.md, DATE '2026-10-28');

  IF EXISTS (SELECT 1 FROM budget.request_reminders
             WHERE user_id = r.c AND send_on = DATE '2026-10-28') THEN
    RAISE EXCEPTION 'FAIL 9: reminded after the ministry submitted'; END IF;

  IF r.m2 IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM budget.request_reminders q
       WHERE q.send_on = DATE '2026-10-28' AND q.stage = 'final'
         AND (SELECT name FROM budget.ministries WHERE id = r.m2) = ANY (q.ministry_names)) THEN
    RAISE EXCEPTION 'FAIL 9a: the other ministry was silenced too'; END IF;
  RAISE NOTICE 'PASS 9';
END;
$a$;

-- 10. Delivery takes today's rows only, at most three tries, and records
--     the outcome.
DO $a$
DECLARE r t%ROWTYPE; _today_id UUID; _old_id UUID; _tired_id UUID; _claimed UUID[];
BEGIN
  SELECT * INTO r FROM t;
  DELETE FROM budget.request_reminders WHERE send_on >= r.today - 1;

  INSERT INTO budget.request_reminders
    (organization_id, fiscal_year, user_id, send_on, stage, recipient_email,
     opens_on, last_day, signed_by)
  VALUES (r.md, r.this_year + 1, r.c, r.today, 'reminder', 'zz@example.test',
          DATE '2026-09-01', DATE '2026-11-01', 'x')
  RETURNING id INTO _today_id;
  INSERT INTO budget.request_reminders
    (organization_id, fiscal_year, user_id, send_on, stage, recipient_email,
     opens_on, last_day, signed_by)
  VALUES (r.md, r.this_year + 1, r.c, r.today - 1, 'reminder', 'zz@example.test',
          DATE '2026-09-01', DATE '2026-11-01', 'x')
  RETURNING id INTO _old_id;
  INSERT INTO budget.request_reminders
    (organization_id, fiscal_year, user_id, send_on, stage, recipient_email,
     opens_on, last_day, signed_by, status, attempts)
  VALUES (r.md, r.this_year + 1, r.a, r.today, 'reminder', 'zz2@example.test',
          DATE '2026-09-01', DATE '2026-11-01', 'x', 'failed', 3)
  RETURNING id INTO _tired_id;

  SELECT array_agg(id) INTO _claimed FROM budget.claim_request_reminders(50);
  IF _claimed IS DISTINCT FROM ARRAY[_today_id] THEN
    RAISE EXCEPTION 'FAIL 10: claimed %, wanted only today''s', _claimed; END IF;
  IF (SELECT status || attempts FROM budget.request_reminders WHERE id = _today_id) <> 'sending1' THEN
    RAISE EXCEPTION 'FAIL 10a: not marked as sending'; END IF;
  IF EXISTS (SELECT 1 FROM budget.claim_request_reminders(50)) THEN
    RAISE EXCEPTION 'FAIL 10b: claimed the same row twice'; END IF;

  PERFORM budget.complete_request_reminder(_today_id, true, 'resend-id', NULL);
  IF (SELECT status FROM budget.request_reminders WHERE id = _today_id) <> 'sent'
     OR (SELECT sent_at FROM budget.request_reminders WHERE id = _today_id) IS NULL THEN
    RAISE EXCEPTION 'FAIL 10c: not recorded as sent'; END IF;
  RAISE NOTICE 'PASS 10';
END;
$a$;

-- 11. A client cannot read the queue or run the job.
DO $a$
BEGIN
  IF has_table_privilege('authenticated', 'budget.request_reminders', 'SELECT')
     OR has_table_privilege('authenticated', 'budget.request_season_policy', 'SELECT')
     OR has_function_privilege('authenticated', 'budget.claim_request_reminders(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'budget.queue_request_reminders(uuid,date,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'budget.request_reminder_sweep()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 11: a signed-in user can reach the reminders'; END IF;
  IF NOT has_function_privilege('authenticated', 'budget.request_season(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 11a: the Budget page cannot ask about the season'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'budget-request-reminders'
                 AND schedule = '0 13-16 * * *') THEN
    RAISE EXCEPTION 'FAIL 11b: the daily job is not scheduled'; END IF;
  RAISE NOTICE 'PASS 11';
END;
$a$;

-- 12. The carry-over: a ministry with nothing submitted gets last year's
--     live requests, at the approved amount where there is one, as pending
--     requests marked as carried over, with their amounts by period. Not a
--     denied one, not a ministry that submitted, never twice.
DO $a$
DECLARE
  r t%ROWTYPE; _fy27 UUID; _fy26 UUID;
  _ok UUID; _pend UUID; _den UUID; _copy UUID; _amounts NUMERIC[];
BEGIN
  SELECT * INTO r FROM t;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT id INTO _fy27 FROM budget.fiscal_years WHERE organization_id = r.md AND year = 2027;
  SELECT id INTO _fy26 FROM budget.fiscal_years WHERE organization_id = r.md AND year = 2026;

  -- This ministry: in 2027 only the draft from 8; in 2026 exactly these.
  DELETE FROM budget.allocation_requests
   WHERE ministry_id = r.m AND fiscal_year_id = _fy27 AND carried_over_from IS NOT NULL;
  UPDATE budget.allocation_requests SET status = 'cancelled'
   WHERE ministry_id = r.m AND fiscal_year_id IN (_fy26, _fy27) AND status <> 'draft';
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, approved_amount, justification, status)
  VALUES (r.md, _fy26, r.m, r.c, 'ZZ Test', 100, 80, 'zz approved', 'approved')
  RETURNING id INTO _ok;
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     period_type, requested_amount, justification, status)
  VALUES (r.md, _fy26, r.m, r.c, 'ZZ Test', 'quarterly', 40, 'zz pending', 'pending')
  RETURNING id INTO _pend;
  INSERT INTO budget.allocation_period_amounts (allocation_request_id, period_number, amount)
  VALUES (_pend, 2, 40);
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status)
  VALUES (r.md, _fy26, r.m, r.c, 'ZZ Test', 500, 'zz denied', 'denied')
  RETURNING id INTO _den;
  -- A duplicate the office has kept out of the carry-over.
  INSERT INTO budget.allocation_requests
    (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
     requested_amount, justification, status, excluded_from_carry_over)
  VALUES (r.md, _fy26, r.m, r.c, 'ZZ Test', 900, 'zz duplicate', 'pending', true);

  -- The other ministry has submitted for 2027 and had a 2026 budget.
  IF r.m2 IS NOT NULL THEN
    INSERT INTO budget.allocation_requests
      (organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
       requested_amount, justification, status)
    VALUES (r.md, _fy27, r.m2, r.c, 'ZZ Test', 10, 'zz m2 2027', 'pending'),
           (r.md, _fy26, r.m2, r.c, 'ZZ Test', 20, 'zz m2 2026', 'pending');
  END IF;

  IF budget.carry_over_budget_requests(r.md, 2027) < 2 THEN
    RAISE EXCEPTION 'FAIL 12: fewer than the two requests of this ministry were carried'; END IF;

  SELECT array_agg(requested_amount ORDER BY requested_amount) INTO _amounts
    FROM budget.allocation_requests
   WHERE fiscal_year_id = _fy27 AND ministry_id = r.m AND carried_over_from IS NOT NULL;
  IF _amounts IS DISTINCT FROM ARRAY[40, 80]::NUMERIC[] THEN
    RAISE EXCEPTION 'FAIL 12a: carried %, wanted 40 and 80', _amounts; END IF;
  IF EXISTS (SELECT 1 FROM budget.allocation_requests
             WHERE fiscal_year_id = _fy27 AND ministry_id = r.m
               AND carried_over_from IS NOT NULL AND status <> 'pending') THEN
    RAISE EXCEPTION 'FAIL 12b: a carried request is not pending'; END IF;
  IF EXISTS (SELECT 1 FROM budget.allocation_requests WHERE carried_over_from = _den) THEN
    RAISE EXCEPTION 'FAIL 12c: a denied request was carried'; END IF;

  SELECT id INTO _copy FROM budget.allocation_requests WHERE carried_over_from = _pend;
  IF NOT EXISTS (SELECT 1 FROM budget.allocation_period_amounts
                 WHERE allocation_request_id = _copy AND period_number = 2 AND amount = 40) THEN
    RAISE EXCEPTION 'FAIL 12d: the amounts by period were not carried'; END IF;

  IF NOT EXISTS (SELECT 1 FROM budget.allocation_requests
                 WHERE fiscal_year_id = _fy27 AND ministry_id = r.m AND status = 'draft') THEN
    RAISE EXCEPTION 'FAIL 12e: the ministry''s draft was touched'; END IF;

  IF r.m2 IS NOT NULL AND EXISTS (
       SELECT 1 FROM budget.allocation_requests
       WHERE fiscal_year_id = _fy27 AND ministry_id = r.m2 AND carried_over_from IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 12f: a ministry that submitted was carried over'; END IF;

  IF budget.carry_over_budget_requests(r.md, 2027) <> 0 THEN
    RAISE EXCEPTION 'FAIL 12g: carried over twice'; END IF;

  IF now() < (SELECT closes_at FROM budget.request_window(r.this_year + 1))
     AND budget.request_carry_over_sweep() <> 0 THEN
    RAISE EXCEPTION 'FAIL 12h: the job carried over before the close'; END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'budget-request-carry-over'
                 AND schedule = '30 5 * 11,12 *') THEN
    RAISE EXCEPTION 'FAIL 12i: the carry-over job is not scheduled'; END IF;
  RAISE NOTICE 'PASS 12';
END;
$a$;
