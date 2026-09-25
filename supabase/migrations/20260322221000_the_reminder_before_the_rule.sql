-- =====================================================
-- The reminder before the rule
-- =====================================================
--
-- The date. One row, set now, months ahead, switching itself on the morning.
--
-- GO-LIVE IS AN UPDATE, NOT A DEPLOY. Nothing ships on 1 November. The policy
-- row says mode='block' with a future enforce_from, and every Sunday until
-- then the gate returns allow = true and the desk shows a reminder. On the
-- first Sunday of November the same code, unchanged and already running for
-- five weeks, starts refusing. Nobody has to be awake, and nobody deploys on
-- a Sunday morning.
--
-- AND `SET mode = 'warn'` IS THE WAY BACK. One statement, no deploy, and the
-- Kids Ministry admin screen has a button for it - deliberately, because the
-- person who needs to press it on a bad Sunday morning should not have to
-- find me first.
--
-- ---------------------------------------------------------------------------
-- WHY 1 NOVEMBER
-- ---------------------------------------------------------------------------
--
-- The ministry asked for "end of October". 31 October 2026 is a Saturday, so
-- the first service the rule can apply to is Sunday 1 November.
--
-- That leaves five warn Sundays - 27 September, and 4, 11, 18 and 25 October -
-- to collect 216 household signatures, or about 44 a Sunday. All five are
-- still ahead: the signing screen shipped on 25 September, before the first
-- of them, which was the thing genuinely at risk in this plan.
--
-- THE HONEST CHECKPOINT IS MID-OCTOBER, not the first of November. The
-- coverage card on the Kids Ministry reports tab shows families signed
-- against families total and the number needed per remaining Sunday. If that
-- number looks unrealistic on 18 October, MOVE THE DATE. Turning 216 families
-- away on a Sunday morning to keep a date is the wrong way round, and the
-- date exists to create urgency, not to be defended.
--
-- ---------------------------------------------------------------------------
-- MD ONLY
-- ---------------------------------------------------------------------------
--
-- VA-Springfield has no classrooms, no sessions and no children on file. A
-- date there would be a rule about nothing that surprises somebody in a year
-- when the branch does start a kids ministry. It stays in warn until they
-- choose their own date, which the admin screen now lets them do.

UPDATE church.kids_consent_policy
   SET mode = 'block',
       enforce_from = DATE '2026-11-01',
       updated_by_name = 'ALIC Kids Ministry',
       notice_text =
         'From Sunday 1 November we will need a signed consent and medical '
         || 'release form for every child before they go to a classroom. It '
         || 'takes about two minutes and you can do it here at the desk, or '
         || 'at home in My Church. If you have already filled it in, thank '
         || 'you - there is nothing more to do.'
 WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

-- The seat belt. mode='block' with no date would refuse from the instant it
-- was written, and this migration is the one place that writes the row
-- directly rather than through set_kids_consent_mode, which checks for it.
DO $check$
DECLARE _r RECORD;
BEGIN
  SELECT * INTO _r FROM church.kids_consent_policy
   WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  IF _r.mode <> 'block' OR _r.enforce_from <> DATE '2026-11-01' THEN
    RAISE EXCEPTION 'the consent date was not set: mode=% enforce_from=%',
      _r.mode, _r.enforce_from;
  END IF;

  -- If this ever runs on or after the date, it is a replay onto a fresh
  -- database rather than the original deploy, and the date has already done
  -- its job. Say so rather than silently enforcing from the moment of a
  -- restore.
  IF _r.enforce_from <= current_date THEN
    RAISE WARNING 'consent enforcement date % is not in the future - this is '
                  'a replay, and the gate is live from the moment this '
                  'migration lands', _r.enforce_from;
  END IF;
END;
$check$;

-- ---------------------------------------------------------------------------
-- What the admin screen reads
-- ---------------------------------------------------------------------------
--
-- kids_consent_policy has an RLS policy for any member of the branch, but the
-- coverage card needs the numbers and the date together and a kids admin
-- should not have to assemble them from two round trips. This is the one
-- read: where we stand, and what the rule currently says.
CREATE OR REPLACE FUNCTION church.kids_consent_policy_for(_organization_id UUID)
RETURNS TABLE (
  mode              TEXT,
  enforce_from      DATE,
  notice_text       TEXT,
  resign_grace_days INTEGER,
  enforcing_now     BOOLEAN,
  updated_by_name   TEXT,
  updated_at        TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT p.mode, p.enforce_from, p.notice_text, p.resign_grace_days,
         -- The same test kids_consent_gate makes, so the screen and the gate
         -- can never disagree about whether the rule is in force.
         (p.mode = 'block' AND p.enforce_from IS NOT NULL
          AND p.enforce_from <= current_date),
         p.updated_by_name, p.updated_at
  FROM church.kids_consent_policy p
  WHERE p.organization_id = _organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_consent_policy_for(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
