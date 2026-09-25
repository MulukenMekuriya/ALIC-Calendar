-- =====================================================
-- A schedule the law would recognise
-- =====================================================
--
-- 20260322240000 shipped four retention periods and called them "starting
-- points for the ministry to confirm with counsel". That was honest about
-- their provenance and useless as a default: a number nobody has checked is
-- one somebody eventually relies on. These are researched against what
-- actually governs a children's ministry in Maryland, with the reasoning in
-- the `basis` column where the next person can read it.
--
-- THIS MIGRATION ONLY EVER LENGTHENS RETENTION. Every period here is longer
-- than the one it replaces, or unchanged, so no record becomes newly due and
-- nothing can be deleted as a consequence of applying it.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED THE ANSWER
-- ---------------------------------------------------------------------------
--
-- 1. MARYLAND HAS NO LIMITATION PERIOD AT ALL FOR CHILD SEXUAL ABUSE.
--
--    The Child Victims Act of 2023 repealed both the statute of limitations
--    and the statute of repose for civil claims arising from child sexual
--    abuse, retroactively and prospectively. The Supreme Court of Maryland
--    upheld it 4-3 in February 2025, and the April 2025 amendment - which cut
--    the noneconomic damages cap from $1.5m to $700,000 for a private
--    defendant - left the limitations repeal untouched.
--
--    So there is NO DATE after which destroying a safeguarding record is
--    safe. A claim can be brought in forty years. A church that has destroyed
--    its own record of a concern cannot show what it knew, what it did, or
--    that it did anything at all - and destruction after a claim is
--    foreseeable is its own problem.
--
--    Safeguarding reports are therefore KEPT INDEFINITELY, and that is now
--    stated in the schedule rather than being an accident of the legal hold.
--
-- 2. AN INJURED CHILD CAN SUE UNTIL 21, AND THEN LITIGATE FOR YEARS.
--
--    Maryland's three-year limitation on personal injury is tolled during
--    minority, so a child injured at four has until their 21st birthday to
--    FILE. Retention to 21 would destroy the evidence on the last day it
--    could be needed. The schedule runs to 25, which leaves four years for a
--    claim filed at the limit to be tried.
--
-- 3. THE CONSENT FORM IS THE DEFENCE TO THE INJURY CLAIM.
--
--    It records what the church was told about a child's health, what the
--    parent authorised, and what risks they accepted - which is exactly what
--    is in dispute when an injury is litigated fifteen years later. Keeping
--    it three years while keeping the injury report twenty was incoherent.
--
-- 4. TWELVE YEARS IS THE SECTOR FLOOR.
--
--    The UUA's youth safety guidelines put permission forms, photo
--    permissions and incident reports at a twelve-year minimum, and behaviour
--    incidents affecting the safety of others at indefinite. The Evangelical
--    Council for Abuse Prevention recommends a uniform ten years for
--    operational records and notes that abuse allegations routinely reach
--    back thirty years or more. Nothing here is shorter than twelve except
--    late collections, which are not a safety record.
--
-- ---------------------------------------------------------------------------
-- STILL NOT LEGAL ADVICE, BUT NO LONGER A GUESS
-- ---------------------------------------------------------------------------
--
-- These are defensible defaults with their reasoning attached, not an
-- opinion about ALIC's circumstances. They remain one UPDATE away from being
-- changed, which is the point of keeping them in a table.

-- ---------------------------------------------------------------------------
-- Some records are never due
-- ---------------------------------------------------------------------------
ALTER TABLE church.record_retention
  ADD COLUMN IF NOT EXISTS retain_forever BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN church.record_retention.retain_forever IS
  'No retention period applies and the record is never due for purge. Set '
  'for safeguarding reports, because Maryland has repealed the limitation '
  'period for child sexual abuse claims entirely - there is no date after '
  'which destruction is safe.';

ALTER TABLE church.record_retention DROP CONSTRAINT IF EXISTS chk_record_retention_type;
ALTER TABLE church.record_retention ADD CONSTRAINT chk_record_retention_type
  CHECK (record_type IN ('consent_signature', 'injury_report',
                         'behaviour_report', 'late_collection',
                         -- new at 20260322260000
                         'safeguarding_report'));

-- A basis of ten characters was enough to stop the column being empty. These
-- are the sentences somebody reads when they are deciding whether to trust
-- the number, so they have to be an actual explanation.
ALTER TABLE church.record_retention DROP CONSTRAINT IF EXISTS chk_record_retention_basis;
ALTER TABLE church.record_retention ADD CONSTRAINT chk_record_retention_basis
  CHECK (length(btrim(basis)) >= 60);

-- ---------------------------------------------------------------------------
-- The schedule
-- ---------------------------------------------------------------------------
INSERT INTO church.record_retention
  (organization_id, record_type, retain_years, retain_forever, basis, updated_by_name)
SELECT o.id, v.record_type, v.retain_years, v.forever, v.basis, 'ALIC Kids Ministry'
FROM public.organizations o
CROSS JOIN (VALUES
  ('safeguarding_report', 50, true,
   'Never deleted. Maryland repealed both the statute of limitations and the '
   'statute of repose for civil claims arising from child sexual abuse '
   '(Child Victims Act 2023, upheld by the Supreme Court of Maryland in '
   'February 2025; the April 2025 amendment cut the damages cap but left the '
   'repeal in place). There is no date after which destroying this record is '
   'safe, and a church that cannot show what it knew and what it did is in a '
   'worse position than one that kept an uncomfortable file.'),

  ('injury_report', 12, false,
   'Until the child turns 25, and never less than 12 years. Maryland''s '
   'three-year limit on personal injury is tolled during minority, so a child '
   'injured at four has until their 21st birthday to file - keeping the '
   'record only to 21 would destroy it on the last day it could be needed. '
   'The extra four years cover the trial of a claim filed at the limit. A '
   'record for a child whose age is unknown is never treated as due.'),

  ('consent_signature', 12, false,
   'Twelve years after the form stops being the current one. It records what '
   'the church was told about a child''s health, what the parent authorised '
   'and what risks they accepted, which is exactly what is in dispute when an '
   'injury is litigated years later - so it has to outlive the injury it '
   'defends. A form still in force is never due, however old.'),

  ('behaviour_report', 7, false,
   'Seven years. These are the notes that are not safeguarding concerns - a '
   'hard morning, a difficult circle time - so they are not kept forever. '
   'Seven years is long enough to see a pattern across a child''s whole time '
   'in the ministry, which two years was not, and any individual note that '
   'turns out to matter can be put under legal hold and kept indefinitely.'),

  ('late_collection', 2, false,
   'Two years. This is an operational record of a Sunday running late, not a '
   'safety record about a child, and it is the one class here where keeping '
   'it longer would turn an ordinary thing into a history a family cannot '
   'shake off. Long enough to see a pattern and have a kind conversation.')
) AS v(record_type, retain_years, forever, basis)
ON CONFLICT (organization_id, record_type) DO UPDATE SET
  retain_years    = EXCLUDED.retain_years,
  retain_forever  = EXCLUDED.retain_forever,
  basis           = EXCLUDED.basis,
  updated_by_name = EXCLUDED.updated_by_name,
  updated_at      = now();

-- ---------------------------------------------------------------------------
-- What is due, with the longer periods and the "never" case
-- ---------------------------------------------------------------------------
--
-- Two changes from 20260322240000: a retain_forever row reports zero due and
-- always will, and an injury ages to 25 rather than 21.
-- Adding retain_forever changes the row type, so DROP then CREATE.
DROP FUNCTION IF EXISTS church.kids_records_due_for_purge(UUID);

CREATE FUNCTION church.kids_records_due_for_purge(_organization_id UUID)
RETURNS TABLE (
  record_type  TEXT,
  retain_years INTEGER,
  basis        TEXT,
  due_count    INTEGER,
  held_count   INTEGER,
  oldest       DATE,
  -- New: so the screen can say "never" rather than printing a number that
  -- would be a lie.
  retain_forever BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
#variable_conflict use_column
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id,
           ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT rr.record_type AS rtype, rr.retain_years AS years,
           rr.basis AS why, rr.retain_forever AS forever
    FROM church.record_retention rr
    WHERE rr.organization_id = _organization_id
  ),
  consent AS (
    SELECT count(*) FILTER (WHERE NOT s.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE s.legal_hold)::INTEGER AS held,
           min(coalesce(s.revoked_at, s.updated_at))::DATE AS oldest
    FROM church.consent_signatures s
    JOIN r ON r.rtype = 'consent_signature' AND NOT r.forever
    WHERE s.organization_id = _organization_id
      AND (s.revoked_at IS NOT NULL OR s.superseded_by_signature_id IS NOT NULL)
      AND coalesce(s.revoked_at, s.updated_at)
          < now() - make_interval(years => (SELECT years FROM r WHERE rtype='consent_signature'))
  ),
  -- 25, not 21. A child injured at four can file on their 21st birthday;
  -- destroying the record that day would lose it exactly when it is needed.
  injury AS (
    SELECT count(*) FILTER (WHERE NOT i.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE i.legal_hold)::INTEGER AS held,
           min(i.occurred_on) AS oldest
    FROM church.kids_incidents i
    JOIN church.people p ON p.id = i.child_person_id
    JOIN r ON r.rtype = 'injury_report' AND NOT r.forever
    WHERE i.organization_id = _organization_id
      AND i.severity = 'injury'
      AND p.birth_year IS NOT NULL
      AND i.occurred_on
          < current_date - make_interval(years => (SELECT years FROM r WHERE rtype='injury_report'))
      AND (p.birth_year + 25) <= extract(year FROM current_date)
  ),
  behaviour AS (
    SELECT count(*) FILTER (WHERE NOT i.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE i.legal_hold)::INTEGER AS held,
           min(i.occurred_on) AS oldest
    FROM church.kids_incidents i
    JOIN r ON r.rtype = 'behaviour_report' AND NOT r.forever
    WHERE i.organization_id = _organization_id
      AND i.severity = 'behaviour'
      AND i.occurred_on
          < current_date - make_interval(years => (SELECT years FROM r WHERE rtype='behaviour_report'))
  ),
  late AS (
    SELECT count(*) FILTER (WHERE NOT lp.legal_hold)::INTEGER AS due,
           count(*) FILTER (WHERE lp.legal_hold)::INTEGER AS held,
           min(lp.session_date) AS oldest
    FROM church.kids_late_pickups lp
    JOIN r ON r.rtype = 'late_collection' AND NOT r.forever
    WHERE lp.organization_id = _organization_id
      AND lp.session_date
          < current_date - make_interval(years => (SELECT years FROM r WHERE rtype='late_collection'))
  ),
  -- Present so the schedule SHOWS safeguarding rather than leaving a silence
  -- where the most serious class of record should be. Always zero due.
  safeguarding AS (
    SELECT 0::INTEGER AS due,
           count(*)::INTEGER AS held,
           min(i.occurred_on) AS oldest
    FROM church.kids_incidents i
    WHERE i.organization_id = _organization_id AND i.severity = 'safeguarding'
  )
  SELECT r.rtype, r.years, r.why,
         CASE WHEN r.forever THEN 0
           ELSE CASE r.rtype
             WHEN 'consent_signature' THEN (SELECT due FROM consent)
             WHEN 'injury_report'     THEN (SELECT due FROM injury)
             WHEN 'behaviour_report'  THEN (SELECT due FROM behaviour)
             WHEN 'late_collection'   THEN (SELECT due FROM late)
             ELSE 0 END END,
         CASE r.rtype
           WHEN 'consent_signature'   THEN (SELECT held FROM consent)
           WHEN 'injury_report'       THEN (SELECT held FROM injury)
           WHEN 'behaviour_report'    THEN (SELECT held FROM behaviour)
           WHEN 'late_collection'     THEN (SELECT held FROM late)
           WHEN 'safeguarding_report' THEN (SELECT held FROM safeguarding)
           ELSE 0 END,
         CASE r.rtype
           WHEN 'consent_signature'   THEN (SELECT oldest FROM consent)
           WHEN 'injury_report'       THEN (SELECT oldest FROM injury)
           WHEN 'behaviour_report'    THEN (SELECT oldest FROM behaviour)
           WHEN 'late_collection'     THEN (SELECT oldest FROM late)
           WHEN 'safeguarding_report' THEN (SELECT oldest FROM safeguarding)
           END,
         r.forever
  FROM r
  ORDER BY r.forever DESC, r.rtype;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_records_due_for_purge(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- And the purge refuses outright for anything kept indefinitely
-- ---------------------------------------------------------------------------
--
-- The legal hold on every safeguarding row already prevents this, twice over.
-- The explicit refusal is here so that somebody reading the function can see
-- the rule, rather than having to reconstruct it from a trigger two
-- migrations away.
CREATE OR REPLACE FUNCTION church.confirm_kids_purge(
  _organization_id UUID,
  _record_type     TEXT,
  _reason          TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _actor TEXT; _years INTEGER; _forever BOOLEAN; _n INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(coalesce(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'reason_required'
      USING HINT = 'Say what is being removed and why. This cannot be undone, '
                   'and the note outlives the records.';
  END IF;

  SELECT retain_years, retain_forever INTO _years, _forever
    FROM church.record_retention
   WHERE organization_id = _organization_id AND record_type = _record_type;
  IF _years IS NULL THEN RAISE EXCEPTION 'unknown_record_type'; END IF;

  IF _forever THEN
    RAISE EXCEPTION 'records_kept_indefinitely'
      USING HINT = 'Maryland has no limitation period for child sexual abuse '
                   'claims, so these are never due. They cannot be purged '
                   'from here at all.';
  END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  IF _record_type = 'consent_signature' THEN
    WITH doomed AS (
      SELECT s.id FROM church.consent_signatures s
      WHERE s.organization_id = _organization_id
        AND NOT s.legal_hold
        AND (s.revoked_at IS NOT NULL OR s.superseded_by_signature_id IS NOT NULL)
        AND coalesce(s.revoked_at, s.updated_at) < now() - make_interval(years => _years)
    ), gone AS (
      DELETE FROM church.consent_signatures WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;

  ELSIF _record_type = 'injury_report' THEN
    WITH doomed AS (
      SELECT i.id FROM church.kids_incidents i
      JOIN church.people p ON p.id = i.child_person_id
      WHERE i.organization_id = _organization_id
        AND i.severity = 'injury' AND NOT i.legal_hold
        AND p.birth_year IS NOT NULL
        AND i.occurred_on < current_date - make_interval(years => _years)
        AND (p.birth_year + 25) <= extract(year FROM current_date)
    ), gone AS (
      DELETE FROM church.kids_incidents WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;

  ELSIF _record_type = 'behaviour_report' THEN
    WITH doomed AS (
      SELECT i.id FROM church.kids_incidents i
      WHERE i.organization_id = _organization_id
        AND i.severity = 'behaviour' AND NOT i.legal_hold
        AND i.occurred_on < current_date - make_interval(years => _years)
    ), gone AS (
      DELETE FROM church.kids_incidents WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;

  ELSIF _record_type = 'late_collection' THEN
    WITH doomed AS (
      SELECT lp.id FROM church.kids_late_pickups lp
      WHERE lp.organization_id = _organization_id
        AND NOT lp.legal_hold
        AND lp.session_date < current_date - make_interval(years => _years)
    ), gone AS (
      DELETE FROM church.kids_late_pickups WHERE id IN (SELECT id FROM doomed) RETURNING 1
    ) SELECT count(*)::INTEGER INTO _n FROM gone;
  ELSE
    RAISE EXCEPTION 'unknown_record_type';
  END IF;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_organization_id, 'records_purged', 'success', auth.uid(), _actor,
          jsonb_build_object('record_type', _record_type, 'removed', _n,
                             'retain_years', _years, 'reason', btrim(_reason)));

  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION church.confirm_kids_purge(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
