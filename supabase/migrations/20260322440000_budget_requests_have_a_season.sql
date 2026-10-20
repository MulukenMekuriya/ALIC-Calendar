-- =====================================================
-- Budget requests have a season
-- =====================================================
--
-- Asked for on 20 October 2026. Abel (ALIC head), in writing: "Let's make it
-- Nov 1st for budget requests yearly close out" and "requests can be opened
-- September 1st onwards", every year going forward. The user added that an
-- admin can edit at any time, and that the last five days of reminders are
-- daily.
--
-- 1. THE SEASON. Requests for fiscal year Y open on 1 September of Y-1 and
--    close at the end of 1 November of Y-1, Eastern time. Only one year is
--    ever in season: from 1 September to 1 November 2026, that is 2027.
--
-- 2. THE LOCK. Outside the season a contributor cannot create, edit, submit,
--    withdraw or delete a budget request. An admin of the branch can, at any
--    time. It is a trigger, so the screen saying so is a courtesy and not the
--    rule. Calendars are NOT locked: "Calendars are just for reminders for
--    ministries to send both at same time, only budget requests need to be
--    locked."
--
-- 3. THE REMINDERS, on the schedule Abel suggested with the last five days
--    daily, and only to contributors whose ministry has not yet submitted:
--
--      15, 22, 29 August                    it opens on 1 September
--      1 September                          it is open
--      15 September, 1 October, 15 October  every two weeks
--      22 October                           weekly
--      28 October to 1 November             daily
--
--    budget.request_reminders holds one row per person per day: the queue,
--    and the record of who was written to. send-budget-reminders delivers.
--    The words are in that function, not here.
--
-- 4. PER BRANCH. budget.request_season_policy turns the lock, the reminders
--    and the carry-over on for a branch. Seeded for MD only: the email is
--    signed by the ALIC MD Leadership Council, and nobody has asked for VA.
--    VA behaves exactly as before until it has a row.
--
-- 5. THE CARRY-OVER. The user, the same day: "if they haven't entered their
--    next year budget request please carry over last year's budget". Once the
--    season closes, a ministry with nothing submitted for the new year gets a
--    copy of each of last year's live requests (pending, approved or partly
--    approved; never denied or withdrawn), at the amount approved where there
--    is one. The copy is PENDING: it arrives in the office's queue like any
--    other request, and the office still decides. carried_over_from marks it,
--    so the screen can say so and the job never copies a ministry twice.
--
--    "Last year's budget" is the requests, not budget.budget_allocations:
--    MD's 2026 budget was seeded on 19 December 2025 as requests "based on
--    approved ministry budget data" and none was ever approved in the app, so
--    MD has no allocations at all. VA's approved requests and its allocations
--    agree, ministry for ministry.

-- ---------------------------------------------------------- 4. the policy

CREATE TABLE IF NOT EXISTS budget.request_season_policy (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enforce_window BOOLEAN NOT NULL DEFAULT true,
  send_reminders BOOLEAN NOT NULL DEFAULT true,
  carry_over BOOLEAN NOT NULL DEFAULT true,
  -- Who the reminder is from, as it closes the email.
  signed_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE budget.request_season_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON budget.request_season_policy FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget.request_season_policy TO service_role;

INSERT INTO budget.request_season_policy
  (organization_id, enforce_window, send_reminders, carry_over, signed_by)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', true, true, true, 'ALIC MD Leadership Council')
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE budget.allocation_requests
  ADD COLUMN IF NOT EXISTS carried_over_from UUID
    REFERENCES budget.allocation_requests(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_allocation_requests_carried_over_from
  ON budget.allocation_requests (carried_over_from) WHERE carried_over_from IS NOT NULL;
COMMENT ON COLUMN budget.allocation_requests.carried_over_from IS
  'Set when the request was copied from last year''s because the ministry submitted nothing by the deadline.';

-- A request the office has said is not part of the budget to carry forward,
-- such as a second request that duplicated the first.
ALTER TABLE budget.allocation_requests
  ADD COLUMN IF NOT EXISTS excluded_from_carry_over BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------- 1. the season

/** When requests for fiscal year _year may be made. closes_at is exclusive. */
CREATE OR REPLACE FUNCTION budget.request_window(
  _year INTEGER,
  OUT opens_at TIMESTAMPTZ, OUT closes_at TIMESTAMPTZ,
  OUT opens_on DATE, OUT last_day DATE)
LANGUAGE sql STABLE
SET search_path = budget, public
AS $$
  SELECT make_timestamptz(_year - 1, 9, 1, 0, 0, 0, 'America/New_York'),
         make_timestamptz(_year - 1, 11, 2, 0, 0, 0, 'America/New_York'),
         make_date(_year - 1, 9, 1),
         make_date(_year - 1, 11, 1);
$$;

/**
 * Refuse a change to a budget request outside its season, unless an admin of
 * the branch is making it or the branch has no season.
 *
 * Nobody signed in is a job, a migration or the service role, and passes.
 */
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

  IF now() < _w.opens_at THEN
    RAISE EXCEPTION 'Budget requests for % open on September 1, %.', _year, _year - 1
      USING ERRCODE = 'P0001';
  ELSIF now() >= _w.closes_at THEN
    RAISE EXCEPTION 'Budget requests for % closed on November 1, %. Please ask an administrator to make any change.',
      _year, _year - 1
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION budget.assert_request_season(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------- 2. the lock

CREATE OR REPLACE FUNCTION budget.allocation_request_in_season()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public
AS $$
BEGIN
  -- An update is checked against the year it leaves as well as the one it
  -- joins, so a closed request cannot be moved into the open year.
  IF TG_OP <> 'INSERT' THEN
    PERFORM budget.assert_request_season(OLD.organization_id, OLD.fiscal_year_id);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  PERFORM budget.assert_request_season(NEW.organization_id, NEW.fiscal_year_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocation_request_in_season ON budget.allocation_requests;
CREATE TRIGGER allocation_request_in_season
  BEFORE INSERT OR UPDATE OR DELETE ON budget.allocation_requests
  FOR EACH ROW EXECUTE FUNCTION budget.allocation_request_in_season();

/** The quarterly and monthly amounts belong to their request, and lock with it. */
CREATE OR REPLACE FUNCTION budget.allocation_period_amount_in_season()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _r RECORD;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    -- Not found when the request itself is being deleted: that delete was
    -- checked already.
    SELECT ar.organization_id, ar.fiscal_year_id INTO _r
      FROM budget.allocation_requests ar WHERE ar.id = OLD.allocation_request_id;
    IF FOUND THEN
      PERFORM budget.assert_request_season(_r.organization_id, _r.fiscal_year_id);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  SELECT ar.organization_id, ar.fiscal_year_id INTO _r
    FROM budget.allocation_requests ar WHERE ar.id = NEW.allocation_request_id;
  IF FOUND THEN
    PERFORM budget.assert_request_season(_r.organization_id, _r.fiscal_year_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocation_period_amount_in_season ON budget.allocation_period_amounts;
CREATE TRIGGER allocation_period_amount_in_season
  BEFORE INSERT OR UPDATE OR DELETE ON budget.allocation_period_amounts
  FOR EACH ROW EXECUTE FUNCTION budget.allocation_period_amount_in_season();

/**
 * Where the season stands for this branch, for the Budget page.
 *
 * The year in season is always next year: upcoming until 1 September, open
 * until the end of 1 November, closed after. can_bypass says whether the
 * caller is an admin of THIS branch, which is what the lock asks; the app's
 * own isAdmin is true for an admin of any branch.
 */
CREATE OR REPLACE FUNCTION budget.request_season(_organization_id UUID)
RETURNS TABLE (
  enforced BOOLEAN,
  fiscal_year INTEGER,
  fiscal_year_id UUID,
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  opens_on DATE,
  last_day DATE,
  state TEXT,
  days_left INTEGER,
  can_bypass BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = budget, public
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
              AND uo.role = 'admin');
END;
$$;

REVOKE ALL ON FUNCTION budget.request_season(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget.request_season(UUID) TO authenticated;

-- ---------------------------------------------------------- 3. the reminders

/** Which reminder goes on this day, if any. The year asked about is next year. */
CREATE OR REPLACE FUNCTION budget.request_reminder_stage(_on DATE)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  -- Month * 100 + day: 815 is 15 August.
  SELECT CASE
    WHEN md IN (815, 822, 829) THEN 'upcoming'
    WHEN md = 901 THEN 'opened'
    WHEN md IN (915, 1001, 1015, 1022) THEN 'reminder'
    WHEN md IN (1028, 1029, 1030, 1031, 1101) THEN 'final'
  END
  FROM (SELECT (extract(month FROM _on) * 100 + extract(day FROM _on))::INTEGER AS md) d;
$$;

CREATE TABLE IF NOT EXISTS budget.request_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  send_on DATE NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('upcoming', 'opened', 'reminder', 'final')),
  -- Everything the email says, fixed when it is queued, so what was sent can
  -- be read back afterwards.
  recipient_name TEXT,
  recipient_email TEXT NOT NULL,
  ministry_names TEXT[] NOT NULL DEFAULT '{}',
  opens_on DATE NOT NULL,
  last_day DATE NOT NULL,
  signed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  -- One a day each, however often the job runs.
  UNIQUE (organization_id, fiscal_year, user_id, send_on)
);
CREATE INDEX IF NOT EXISTS idx_request_reminders_due
  ON budget.request_reminders (send_on, status);
ALTER TABLE budget.request_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON budget.request_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget.request_reminders TO service_role;

/**
 * Queue today's reminder for every contributor whose ministry has not
 * submitted next year's budget request.
 *
 * A contributor's ministries are the one named on their profile and any they
 * lead. They are written to while any of those has nothing submitted (a draft
 * is not submitted; a withdrawn one is not either), and the email names the
 * ones still missing. A contributor with no ministry on record is written to
 * until they have submitted something themselves.
 *
 * Returns how many were queued. Safe to run more than once a day.
 *
 * _send_as sends one on a day the schedule does not: the first reminder of
 * 2026 went on 20 October, the day this was built, as Abel asked.
 */
CREATE OR REPLACE FUNCTION budget.queue_request_reminders(
  _organization_id UUID, _on DATE, _send_as TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _stage TEXT := coalesce(_send_as, budget.request_reminder_stage(_on));
  _year INTEGER := extract(year FROM _on)::INTEGER + 1;
  _signed_by TEXT;
  _w RECORD;
  _n INTEGER;
BEGIN
  IF _stage IS NULL THEN RETURN 0; END IF;

  SELECT p.signed_by INTO _signed_by FROM budget.request_season_policy p
   WHERE p.organization_id = _organization_id AND p.send_reminders;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO _w FROM budget.request_window(_year);

  WITH contributor AS (
    SELECT uo.user_id, u.email,
           coalesce(nullif(btrim(pr.full_name), ''), split_part(u.email, '@', 1)) AS name,
           pr.ministry_name
    FROM public.user_organizations uo
    JOIN auth.users u ON u.id = uo.user_id
    LEFT JOIN public.profiles pr ON pr.id = uo.user_id
    WHERE uo.organization_id = _organization_id
      AND uo.role = 'contributor'
      AND u.email IS NOT NULL AND btrim(u.email) <> ''
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until < now())
  ),
  theirs AS (
    SELECT c.user_id, m.id AS ministry_id, m.name
    FROM contributor c
    JOIN budget.ministries m
      ON m.organization_id = _organization_id AND m.is_active
     AND lower(btrim(m.name)) = lower(btrim(c.ministry_name))
    UNION
    SELECT c.user_id, m.id, m.name
    FROM contributor c
    JOIN budget.ministries m
      ON m.organization_id = _organization_id AND m.is_active
     AND m.leader_id = c.user_id
  ),
  submitted AS (
    SELECT ar.ministry_id, ar.requester_id
    FROM budget.allocation_requests ar
    JOIN budget.fiscal_years fy ON fy.id = ar.fiscal_year_id
    WHERE ar.organization_id = _organization_id
      AND fy.year = _year
      AND ar.status NOT IN ('draft', 'cancelled')
  ),
  owed AS (
    SELECT c.user_id, c.name, c.email,
           count(t.ministry_id) AS ministries,
           coalesce(array_agg(t.name ORDER BY t.name)
                      FILTER (WHERE t.ministry_id IS NOT NULL
                                AND NOT EXISTS (SELECT 1 FROM submitted s
                                                WHERE s.ministry_id = t.ministry_id)),
                    '{}') AS outstanding
    FROM contributor c
    LEFT JOIN theirs t ON t.user_id = c.user_id
    GROUP BY c.user_id, c.name, c.email
  )
  INSERT INTO budget.request_reminders (
    organization_id, fiscal_year, user_id, send_on, stage,
    recipient_name, recipient_email, ministry_names, opens_on, last_day, signed_by)
  SELECT _organization_id, _year, o.user_id, _on, _stage,
         o.name, o.email, o.outstanding, _w.opens_on, _w.last_day, _signed_by
  FROM owed o
  WHERE CASE WHEN o.ministries > 0 THEN cardinality(o.outstanding) > 0
             ELSE NOT EXISTS (SELECT 1 FROM submitted s WHERE s.requester_id = o.user_id)
        END
  ON CONFLICT (organization_id, fiscal_year, user_id, send_on) DO NOTHING;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION budget.queue_request_reminders(UUID, DATE, TEXT) FROM PUBLIC, anon, authenticated;

/**
 * Hand today's reminders to send-budget-reminders, a batch at a time.
 *
 * Today's only: a reminder that did not go on its day is not sent late, least
 * of all a "last day" one on 2 November. A failure is tried three times; a
 * claim older than fifteen minutes belonged to a run that died.
 */
CREATE OR REPLACE FUNCTION budget.claim_request_reminders(_limit INTEGER DEFAULT 50)
RETURNS SETOF budget.request_reminders
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _today DATE := (now() AT TIME ZONE 'America/New_York')::DATE;
BEGIN
  RETURN QUERY
  UPDATE budget.request_reminders r
     SET status = 'sending', claimed_at = now(), attempts = r.attempts + 1
   WHERE r.id IN (
     SELECT q.id FROM budget.request_reminders q
      WHERE q.send_on = _today
        AND q.attempts < 3
        AND (q.status = 'queued'
             OR q.status = 'failed'
             OR (q.status = 'sending' AND q.claimed_at < now() - interval '15 minutes'))
      ORDER BY q.created_at
      LIMIT _limit
      FOR UPDATE SKIP LOCKED)
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION budget.claim_request_reminders(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION budget.claim_request_reminders(INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION budget.complete_request_reminder(
  _id UUID, _ok BOOLEAN,
  _provider_message_id TEXT DEFAULT NULL, _error TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = budget, public
AS $$
  UPDATE budget.request_reminders
     SET status = CASE WHEN _ok THEN 'sent' ELSE 'failed' END,
         sent_at = CASE WHEN _ok THEN now() END,
         provider_message_id = _provider_message_id,
         error = _error
   WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION budget.complete_request_reminder(UUID, BOOLEAN, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION budget.complete_request_reminder(UUID, BOOLEAN, TEXT, TEXT)
  TO service_role;

/**
 * The daily job: queue today's reminders for every branch that sends them,
 * then wake send-budget-reminders if anything for today is waiting.
 *
 * Most days of the year there is no stage, nothing is queued and nothing is
 * called.
 */
CREATE OR REPLACE FUNCTION budget.request_reminder_sweep()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public, extensions
AS $$
DECLARE
  _today DATE := (now() AT TIME ZONE 'America/New_York')::DATE;
  _org UUID;
  _total INTEGER := 0;
  _supabase_url TEXT;
  _service_role_key TEXT;
BEGIN
  FOR _org IN
    SELECT p.organization_id FROM budget.request_season_policy p WHERE p.send_reminders
  LOOP
    BEGIN
      _total := _total + budget.queue_request_reminders(_org, _today);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'budget reminder sweep failed for %: %', _org, SQLERRM;
    END;
  END LOOP;

  -- Yesterday's that never went are not going to: say so on the row.
  UPDATE budget.request_reminders
     SET status = 'skipped', error = coalesce(error, 'not sent on its day')
   WHERE send_on < _today AND status IN ('queued', 'sending');

  IF NOT EXISTS (
    SELECT 1 FROM budget.request_reminders q
     WHERE q.send_on = _today AND q.attempts < 3
       AND q.status IN ('queued', 'failed', 'sending')) THEN
    RETURN _total;
  END IF;

  SELECT decrypted_secret INTO _supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO _service_role_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF _supabase_url IS NULL OR _service_role_key IS NULL THEN
    RAISE WARNING 'Vault secrets not configured; budget reminders not sent';
    RETURN _total;
  END IF;

  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/send-budget-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key),
    body := '{}'::jsonb
  );

  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION budget.request_reminder_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION budget.request_reminder_sweep() TO service_role;

-- 13:00 UTC is 9am Eastern in summer and 8am in winter: read the same
-- morning. The three later runs only retry what failed; each run queues
-- nothing new for anyone already written to that day.
SELECT cron.unschedule('budget-request-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'budget-request-reminders');

SELECT cron.schedule('budget-request-reminders', '0 13-16 * * *',
                     'SELECT budget.request_reminder_sweep()');

-- ---------------------------------------------------------- 5. the carry-over

/**
 * Copy last year's budget into _year for every active ministry of the branch
 * that has submitted nothing for _year and has not been carried over before.
 *
 * A draft is not a submission, the same rule the reminders use: the ministry
 * gets last year's figure and the draft stays where it is. A request marked
 * excluded_from_carry_over stays behind. Whether it is time
 * to do this is the caller's question; see request_carry_over_sweep.
 *
 * Returns how many requests were made.
 */
CREATE OR REPLACE FUNCTION budget.carry_over_budget_requests(
  _organization_id UUID, _year INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _fy UUID;
  _n INTEGER;
BEGIN
  SELECT id INTO _fy FROM budget.fiscal_years
   WHERE organization_id = _organization_id AND year = _year;
  IF _fy IS NULL THEN
    RAISE WARNING 'no % fiscal year for %; nothing carried over', _year, _organization_id;
    RETURN 0;
  END IF;

  WITH last_year AS (
    SELECT ar.*
    FROM budget.allocation_requests ar
    JOIN budget.fiscal_years fy ON fy.id = ar.fiscal_year_id
    JOIN budget.ministries m ON m.id = ar.ministry_id AND m.is_active
    WHERE ar.organization_id = _organization_id
      AND fy.year = _year - 1
      AND ar.status IN ('pending', 'approved', 'partially_approved')
      AND NOT ar.excluded_from_carry_over
      AND NOT EXISTS (
        SELECT 1 FROM budget.allocation_requests n
        WHERE n.fiscal_year_id = _fy AND n.ministry_id = ar.ministry_id
          AND (n.status NOT IN ('draft', 'cancelled') OR n.carried_over_from IS NOT NULL))
  ),
  copied AS (
    INSERT INTO budget.allocation_requests (
      organization_id, fiscal_year_id, ministry_id, requester_id, requester_name,
      period_type, requested_amount, justification, budget_breakdown, status,
      carried_over_from)
    SELECT l.organization_id, _fy, l.ministry_id, l.requester_id, l.requester_name,
           l.period_type,
           CASE WHEN l.status = 'pending' THEN l.requested_amount
                ELSE coalesce(l.approved_amount, l.requested_amount) END,
           l.justification, l.budget_breakdown, 'pending', l.id
    FROM last_year l
    RETURNING id, carried_over_from
  ),
  amounts AS (
    INSERT INTO budget.allocation_period_amounts (allocation_request_id, period_number, amount, notes)
    SELECT c.id, pa.period_number, pa.amount, pa.notes
    FROM copied c
    JOIN budget.allocation_period_amounts pa ON pa.allocation_request_id = c.carried_over_from
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM copied;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION budget.carry_over_budget_requests(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;

/**
 * Daily in November and December: once a branch's season is over, carry
 * over. Running it again does nothing, so a missed night is caught the next.
 */
CREATE OR REPLACE FUNCTION budget.request_carry_over_sweep()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = budget, public
AS $$
DECLARE
  _year INTEGER := extract(year FROM (now() AT TIME ZONE 'America/New_York'))::INTEGER + 1;
  _org UUID;
  _total INTEGER := 0;
BEGIN
  IF now() < (SELECT closes_at FROM budget.request_window(_year)) THEN
    RETURN 0;
  END IF;
  FOR _org IN
    SELECT p.organization_id FROM budget.request_season_policy p WHERE p.carry_over
  LOOP
    BEGIN
      _total := _total + budget.carry_over_budget_requests(_org, _year);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'budget carry-over failed for %: %', _org, SQLERRM;
    END;
  END LOOP;
  RETURN _total;
END;
$$;

REVOKE ALL ON FUNCTION budget.request_carry_over_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION budget.request_carry_over_sweep() TO service_role;

-- 05:30 UTC is after midnight Eastern whichever side of daylight saving
-- 2 November falls, so the first run is the first minutes after the close.
SELECT cron.unschedule('budget-request-carry-over')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'budget-request-carry-over');

SELECT cron.schedule('budget-request-carry-over', '30 5 * 11,12 *',
                     'SELECT budget.request_carry_over_sweep()');
