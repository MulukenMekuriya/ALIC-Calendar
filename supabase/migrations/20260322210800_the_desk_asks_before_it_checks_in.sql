-- =====================================================
-- The desk asks before it checks in
-- =====================================================
--
-- The screening call that drives the consent sheet, and the policy that will
-- one day let it refuse.
--
-- THIS MIGRATION CANNOT TURN A CHILD AWAY. It does not touch
-- check_in_children at all. screen_children_for_check_in is a separate call
-- the desk makes BEFORE checking in, and its answer drives what the screen
-- says, not what the database does. That is deliberate and it is what makes
-- this safe to ship on a Sunday: the whole of the consent feature becomes
-- visible and usable, and the first signature can be collected, weeks before
-- anything is capable of refusing anybody.
--
-- The refusal itself is one more migration, and it adds a code to the
-- mechanism that 20260322200200 already built and proved with the sibling
-- test. Splitting it this way means the collection starts now and the gate
-- arrives on a date somebody chooses, rather than both landing together.
--
-- ---------------------------------------------------------------------------
-- MODE AND enforce_from, AND IT NEEDS BOTH
-- ---------------------------------------------------------------------------
--
--   off                    no gate, no reminder.
--   warn                   reminder shown, check-in always proceeds. THIS IS
--                          WHAT SHIPS TODAY, and it is indefinite.
--   block + future date    reminder shown, check-in proceeds. This is the
--                          go-live setting: set once, months ahead, and it
--                          switches itself on the morning.
--   block + date reached   uncovered children are refused.
--
-- A date alone cannot express "warn indefinitely". A flag alone means
-- somebody has to be awake on go-live morning. `SET mode='warn'` is the
-- one-statement way back if the first enforced Sunday goes badly.

ALTER TABLE church.kids_consent_policy
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'warn';
ALTER TABLE church.kids_consent_policy
  ADD COLUMN IF NOT EXISTS enforce_from DATE;
ALTER TABLE church.kids_consent_policy
  ADD COLUMN IF NOT EXISTS notice_text TEXT;

ALTER TABLE church.kids_consent_policy DROP CONSTRAINT IF EXISTS chk_kids_consent_mode;
ALTER TABLE church.kids_consent_policy ADD CONSTRAINT chk_kids_consent_mode
  CHECK (mode IN ('off', 'warn', 'block'));

-- block with no date is the setting nobody means: it would refuse from the
-- instant it was saved, which is the one thing this design exists to avoid.
ALTER TABLE church.kids_consent_policy DROP CONSTRAINT IF EXISTS chk_kids_consent_block_needs_date;
ALTER TABLE church.kids_consent_policy ADD CONSTRAINT chk_kids_consent_block_needs_date
  CHECK (mode <> 'block' OR enforce_from IS NOT NULL);

COMMENT ON COLUMN church.kids_consent_policy.mode IS
  'off | warn | block. Ships as warn. Go-live is block with a FUTURE '
  'enforce_from, set once and switching itself on the day.';

COMMENT ON COLUMN church.kids_consent_policy.enforce_from IS
  'The first service at which an uncovered child is refused. Ignored unless '
  'mode is block.';

CREATE OR REPLACE FUNCTION church.set_kids_consent_mode(
  _organization_id UUID,
  _mode            TEXT,
  _enforce_from    DATE DEFAULT NULL,
  _notice_text     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- kids_admin specifically, NOT assert_kids_leader - that helper admits
  -- leadership_viewer, a read-only reporting role, and this setting decides
  -- whether a child goes to a classroom.
  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF _mode NOT IN ('off', 'warn', 'block') THEN
    RAISE EXCEPTION 'mode_must_be_off_warn_or_block';
  END IF;

  -- Turning enforcement on for TODAY, from a screen, is almost always a
  -- mistake - somebody meaning to schedule it and typing the wrong date. It
  -- is still possible, by writing the row, but it does not happen by tapping.
  IF _mode = 'block' AND coalesce(_enforce_from, current_date) <= current_date THEN
    RAISE EXCEPTION 'enforce_from_must_be_in_the_future'
      USING HINT = 'Families need warning. Pick a date, tell them, and let it '
                   'switch itself on.';
  END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  INSERT INTO church.kids_consent_policy (
    organization_id, mode, enforce_from, notice_text, updated_by, updated_by_name)
  VALUES (_organization_id, _mode, _enforce_from, _notice_text, auth.uid(), _actor)
  ON CONFLICT (organization_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    enforce_from = EXCLUDED.enforce_from,
    notice_text = coalesce(EXCLUDED.notice_text, church.kids_consent_policy.notice_text),
    updated_by = EXCLUDED.updated_by,
    updated_by_name = EXCLUDED.updated_by_name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.set_kids_consent_mode(UUID, TEXT, DATE, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- A leader can let a family through
-- ---------------------------------------------------------------------------
--
-- A church cannot turn a child away over paperwork with no way out. This is
-- the escape hatch for the family who genuinely cannot sign this morning: a
-- phone with no signal, a grandparent doing the drop-off, a parent who wants
-- to read it properly first.
--
-- It clears the block for ONE SERVICE. It is not a waiver and it does not
-- create coverage - the family still shows as unsigned tomorrow, which is
-- correct, because they are.
CREATE TABLE IF NOT EXISTS church.kids_consent_exceptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  child_person_id UUID NOT NULL,
  kids_session_id UUID NOT NULL REFERENCES church.kids_sessions(id) ON DELETE CASCADE,

  reason      TEXT NOT NULL,
  granted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_by_name TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_kids_consent_exception_child
    FOREIGN KEY (child_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT chk_kids_consent_exception_reason
    CHECK (length(btrim(reason)) >= 5),
  -- One per child per session. A second tap is not a second exception.
  CONSTRAINT uq_kids_consent_exception UNIQUE (child_person_id, kids_session_id)
);

COMMENT ON TABLE church.kids_consent_exceptions IS
  'A leader letting one child through for one service. Expires with the '
  'session. NOT a waiver and NOT coverage - the family still reads as '
  'unsigned tomorrow, because they are.';

CREATE INDEX IF NOT EXISTS idx_kids_consent_exceptions_session
  ON church.kids_consent_exceptions (kids_session_id);

ALTER TABLE church.kids_consent_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids team can view consent exceptions" ON church.kids_consent_exceptions;
CREATE POLICY "Kids team can view consent exceptions"
  ON church.kids_consent_exceptions FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['kids_admin','kids_leader','leadership_viewer']::church.module_permission[])));

GRANT SELECT ON church.kids_consent_exceptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.kids_consent_exceptions TO service_role;

CREATE OR REPLACE FUNCTION church.kids_grant_consent_exception(
  _child_person_id UUID,
  _kids_session_id UUID,
  _reason          TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _org UUID; _actor TEXT; _id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT organization_id INTO _org FROM church.kids_sessions WHERE id = _kids_session_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'session_not_found'; END IF;

  -- kids_admin OR kids_leader. Letting a family through is a smaller decision
  -- than turning one away, and it has to be available to whoever is actually
  -- at the desk on a Sunday morning.
  IF NOT church.has_permission_in_org(
           _org, ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'A Kids Ministry leader can let a family through for today.';
  END IF;

  IF length(btrim(coalesce(_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'reason_required'
      USING HINT = 'A sentence is enough. It is what makes this defensible '
                   'when somebody asks later.';
  END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'A Kids Ministry leader');

  INSERT INTO church.kids_consent_exceptions (
    organization_id, child_person_id, kids_session_id, reason,
    granted_by, granted_by_name)
  VALUES (_org, _child_person_id, _kids_session_id, btrim(_reason), auth.uid(), _actor)
  ON CONFLICT (child_person_id, kids_session_id) DO UPDATE SET reason = EXCLUDED.reason
  RETURNING id INTO _id;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, kids_session_id, child_person_id,
    actor_auth_user_id, actor_name, detail)
  VALUES (_org, 'consent_exception', 'success', _kids_session_id, _child_person_id,
          auth.uid(), _actor, jsonb_build_object('reason', btrim(_reason)));

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_grant_consent_exception(UUID, UUID, TEXT) TO authenticated;

ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS check_in_audit_action_check;
ALTER TABLE church.check_in_audit DROP CONSTRAINT IF EXISTS chk_check_in_audit_action;
ALTER TABLE church.check_in_audit ADD CONSTRAINT chk_check_in_audit_action
  CHECK (action = ANY (ARRAY[
    'check_in', 'check_out', 'transfer', 'code_failed', 'override',
    'sensitive_viewed', 'restricted_pickup_attempt', 'restricted_pickup_override',
    'pin_failed', 'auto_expired', 'label_reprint', 'shift_opened', 'shift_closed',
    'visitor_registered',
    'late_pickup_recorded', 'late_pickup_notified', 'late_pickup_dismissed',
    'hold_raised', 'hold_lifted', 'hold_settled', 'check_in_held',
    'incident_raised', 'incident_noted', 'incident_severity_changed',
    'incident_reviewed', 'incident_signed_off', 'incident_declined',
    'incident_external_report', 'incident_sent',
    'consent_signed', 'consent_revoked', 'consent_child_withdrawn',
    'consent_reviewed', 'medical_updated',
    -- new at 20260322210800
    'consent_exception']));

-- ---------------------------------------------------------------------------
-- The gate, per child
-- ---------------------------------------------------------------------------
--
-- The single place that turns a consent STATE into a decision. The refusal
-- migration will call exactly this, so the answer the desk previews today and
-- the answer the gate gives later cannot drift apart.
CREATE OR REPLACE FUNCTION church.kids_consent_gate(
  _child_person_id UUID,
  _kids_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
  allow         BOOLEAN,
  state         TEXT,
  refusal_code  TEXT,
  enforcing     BOOLEAN,
  excepted      BOOLEAN,
  resign_due_by DATE
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _org UUID; _pol RECORD; _st RECORD; _enforcing BOOLEAN; _excepted BOOLEAN;
BEGIN
  SELECT organization_id INTO _org FROM church.people WHERE id = _child_person_id;
  IF _org IS NULL THEN
    RETURN QUERY SELECT true, 'no_household'::TEXT, NULL::TEXT, false, false, NULL::DATE;
    RETURN;
  END IF;

  SELECT * INTO _pol FROM church.kids_consent_policy WHERE organization_id = _org;

  -- Enforcing means block AND the date has arrived. Everything else - off,
  -- warn, block with a future date, no policy row at all - proceeds.
  _enforcing := coalesce(_pol.mode, 'warn') = 'block'
                AND _pol.enforce_from IS NOT NULL
                AND _pol.enforce_from <= current_date;

  SELECT * INTO _st FROM church.child_consent_state(_child_person_id);

  _excepted := _kids_session_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM church.kids_consent_exceptions e
    WHERE e.child_person_id = _child_person_id
      AND e.kids_session_id = _kids_session_id);

  RETURN QUERY SELECT
    -- Covered, or not enforcing yet, or a leader said so this morning.
    (_st.state IN ('covered', 'covered_elsewhere') OR NOT _enforcing OR _excepted),
    _st.state,
    CASE
      WHEN _st.state IN ('covered', 'covered_elsewhere') THEN NULL
      WHEN _st.state = 'no_household' THEN 'consent_no_guardian'
      ELSE 'consent_not_on_file'
    END,
    _enforcing,
    _excepted,
    _st.resign_due_by;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_consent_gate(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- What the desk asks before it checks anybody in
-- ---------------------------------------------------------------------------
--
-- One call, a whole family, before check_in_children rather than inside it.
--
-- WARN MODE SHOWS THE SHEET ONCE PER HOUSEHOLD, NOT ONCE PER CHILD. That is
-- why household_id comes back: 216 unsigned families times a per-child dialog
-- is how volunteers learn to tap past things, and then the enforcement date
-- arrives with no behaviour change at all.
--
-- Deliberately does NOT return allergies, medications or notes. The desk sees
-- whether a form is wanted; what is ON the form it reads through the audited
-- prefill below, with the child standing there.
CREATE OR REPLACE FUNCTION church.screen_children_for_check_in(
  _child_person_ids UUID[],
  _kids_session_id  UUID DEFAULT NULL,
  _shift_token      TEXT DEFAULT NULL
)
RETURNS TABLE (
  child_person_id UUID,
  child_name      TEXT,
  household_id    UUID,
  state           TEXT,
  allow           BOOLEAN,
  refusal_code    TEXT,
  enforcing       BOOLEAN,
  excepted        BOOLEAN,
  resign_due_by   DATE,
  policy_mode     TEXT,
  enforce_from    DATE,
  notice_text     TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a   church.resolved_actor;
  _pol RECORD;
BEGIN
  -- The same door the rest of the station uses, so a person who cannot check
  -- in cannot use this to enumerate families either.
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _pol FROM church.kids_consent_policy
   WHERE organization_id = a.organization_id;

  RETURN QUERY
  SELECT p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         (SELECT hm.household_id FROM church.household_members hm
           WHERE hm.person_id = p.id AND hm.end_date IS NULL LIMIT 1),
         g.state, g.allow, g.refusal_code, g.enforcing, g.excepted, g.resign_due_by,
         coalesce(_pol.mode, 'warn'), _pol.enforce_from, _pol.notice_text
  FROM unnest(_child_person_ids) AS c(id)
  JOIN church.people p ON p.id = c.id AND p.organization_id = a.organization_id
  CROSS JOIN LATERAL church.kids_consent_gate(p.id, _kids_session_id) g;
END;
$$;

GRANT EXECUTE ON FUNCTION church.screen_children_for_check_in(UUID[], UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- What is already on file, for the sheet
-- ---------------------------------------------------------------------------
--
-- THE ONE DEFERRAL THAT NEEDS CARE. Section 4 of the form must not default to
-- "no known allergies" because nobody asked. So the sheet shows what is
-- currently on file per child and offers two answers: "This is correct" and
-- "Something has changed". The second does not open a medical form at a
-- queue; it records that a follow-up is wanted.
--
-- A volunteer cannot read church.person_sensitive directly - the policies are
-- gated on members_admin|kids_admin - so this follows the same pattern as
-- station_child_safety_card and writes a sensitive_viewed row on every call.
-- Reading a child's medical record at a desk is a recorded act whichever
-- screen it happens on.
CREATE OR REPLACE FUNCTION church.station_child_consent_prefill(
  _child_person_ids UUID[],
  _shift_token      TEXT DEFAULT NULL
)
RETURNS TABLE (
  child_person_id UUID,
  child_name      TEXT,
  has_record      BOOLEAN,
  allergy_severity TEXT,
  allergies       TEXT,
  medications     TEXT,
  special_needs   TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE a church.resolved_actor; _c UUID;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  FOREACH _c IN ARRAY coalesce(_child_person_ids, '{}') LOOP
    INSERT INTO church.check_in_audit (
      organization_id, action, outcome, child_person_id, station_id,
      volunteer_id, actor_auth_user_id, actor_name, detail)
    SELECT a.organization_id, 'sensitive_viewed', 'success', _c, a.station_id,
           a.volunteer_id, auth.uid(), a.actor_name,
           jsonb_build_object('record', 'consent_prefill')
    WHERE EXISTS (SELECT 1 FROM church.people p
                   WHERE p.id = _c AND p.organization_id = a.organization_id);
  END LOOP;

  RETURN QUERY
  SELECT p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         (ps.person_id IS NOT NULL),
         ps.allergy_severity, ps.allergies, ps.medications, ps.special_needs
  FROM unnest(_child_person_ids) AS c(id)
  JOIN church.people p ON p.id = c.id AND p.organization_id = a.organization_id
  LEFT JOIN church.person_sensitive ps ON ps.person_id = p.id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.station_child_consent_prefill(UUID[], TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Who may sign for this child
-- ---------------------------------------------------------------------------
--
-- NOT station_household_adults, which already exists, takes a HOUSEHOLD id,
-- and is what the drop-off and pickup-code flows call. Replacing it would
-- have broken those; this takes a CHILD and answers a different question.
--
-- Signing needs a signer PICKED from the household's adults rather than typed
-- - free text alone is what lets "Mickey Mouse" onto a legal record. The desk
-- has no way to read church.people, so this is that list and nothing else:
-- names and ids, no phone numbers, no emails, no addresses.
CREATE OR REPLACE FUNCTION church.station_consent_signers(
  _child_person_id UUID,
  _shift_token     TEXT DEFAULT NULL
)
RETURNS TABLE (
  person_id    UUID,
  full_name    TEXT,
  household_id UUID,
  has_email    BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE a church.resolved_actor;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT adult.id,
         coalesce(adult.preferred_name, adult.first_name) || ' ' || adult.last_name,
         child_hm.household_id,
         -- Whether a copy can actually be sent. Ten of 216 households have no
         -- adult email at all, and the sheet should say so before somebody
         -- signs expecting one rather than after.
         (adult.email IS NOT NULL AND adult.notify_by_email)
  FROM church.household_members child_hm
  JOIN church.household_members adult_hm
    ON adult_hm.household_id = child_hm.household_id AND adult_hm.end_date IS NULL
  JOIN church.people adult ON adult.id = adult_hm.person_id
  WHERE child_hm.person_id = _child_person_id
    AND child_hm.end_date IS NULL
    AND NOT adult.is_child
    AND adult.is_active
    AND adult.organization_id = a.organization_id
  ORDER BY 2;
END;
$$;

GRANT EXECUTE ON FUNCTION church.station_consent_signers(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Signing at a desk
-- ---------------------------------------------------------------------------
--
-- sign_kids_consent already accepts source 'kiosk' from a member of the kids
-- team. What it could not do is be called from a station running on a shift
-- token rather than a personal session, which is how the tablets work. This
-- wrapper resolves the actor the station way and then calls it.
CREATE OR REPLACE FUNCTION church.station_sign_consent(
  _household_id      UUID,
  _child_person_ids  UUID[],
  _signer_person_id  UUID,
  _signer_printed_name TEXT,
  _answers           JSONB,
  _per_child_answers JSONB DEFAULT '{}'::jsonb,
  _signer_relationship TEXT DEFAULT NULL,
  _shift_token       TEXT DEFAULT NULL
)
RETURNS TABLE (signature_id UUID, children_named INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE a church.resolved_actor; r RECORD;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM church.sign_kids_consent(
    a.organization_id, _household_id, _child_person_ids, _signer_person_id,
    _signer_printed_name, 'kiosk', _answers, _per_child_answers,
    _signer_relationship, NULL, NULL, a.station_id, NULL, NULL);

  RETURN QUERY SELECT r.signature_id, r.children_named;
END;
$$;

GRANT EXECUTE ON FUNCTION church.station_sign_consent(
  UUID, UUID[], UUID, TEXT, JSONB, JSONB, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
