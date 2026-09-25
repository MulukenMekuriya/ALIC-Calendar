-- =====================================================
-- A signature that names the children
-- =====================================================
--
-- One signing event, and the children it names.
--
-- A SIGNATURE COVERS A SET OF NAMED CHILDREN, NOT A HOUSEHOLD. The household
-- is how the set is built and how the signature is found; coverage lives in
-- consent_children, one row per child, frozen at signing. An earlier draft
-- derived coverage from the household plus a join date, and per-child rows
-- are better on three counts:
--
--   - A child added next month was never named on the PDF. A derived rule
--     would have the document and the database disagreeing, and THE DOCUMENT
--     IS THE EVIDENCE.
--   - A child moving INTO a household that signed would silently inherit a
--     consent their guardian never gave.
--   - A child moving OUT would lose a consent that was genuinely given about
--     them and never withdrawn.
--
-- WHAT IS NOT IN THE COVERAGE PREDICATE: superseded_by_signature_id.
-- Superseding is presentational - which PDF the office shows as current. IT
-- IS NOT A WITHDRAWAL. A child named on last year's form and not on this
-- year's is still covered until somebody withdraws them, because nobody
-- withdrew anything. Removing a child is withdraw_child_consent, a deliberate
-- act with a name against it.
--
-- E-SIGNATURE EVIDENCE. Maryland UETA and federal E-SIGN need four things,
-- and the columns map one to one:
--
--   intent to sign            signer_printed_name + the required acknowledgments
--   agreement to transact     the acknowledgment options, ticked individually
--   association with a record document_version + document_sha256 - you can
--                             prove WHICH WORDS, which is the whole reason
--                             20260322210000 hashes the document
--   retention, reproducible   pdf_storage_path + pdf_sha256 (filled by a later
--                             migration; the renderer is its own branch)
--
-- TYPED NAME, NOT A DRAWN MARK. A finger-drawn squiggle on a shared tablet is
-- worth LESS evidentially, not more: it matches no specimen the church holds,
-- anyone standing there can draw it, and it carries no metadata. A typed name
-- against a picked person, with a timestamp, a witness and an immutable
-- document hash, satisfies both statutes, is faster with a queue behind you,
-- and is usable by somebody who cannot draw steadily.
--
-- client_ip_reported IS NAMED THAT WAY DELIBERATELY. inet_client_addr() under
-- Supabase's pooler returns the pooler, not the parent, and storing that as
-- "the signer's IP" would be a false record. What goes here is a forwarded
-- header, which is spoofable. It is evidence, not authentication, and the
-- column name says so.

-- ---------------------------------------------------------------------------
-- The signing event
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church.consent_signatures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- How the set of children was built, and how a parent finds their own
  -- signature again. Coverage does NOT come from here.
  household_id    UUID REFERENCES church.households(id) ON DELETE SET NULL,

  consent_document_id UUID NOT NULL REFERENCES church.consent_documents(id) ON DELETE RESTRICT,
  document_code       TEXT    NOT NULL,
  document_version    INTEGER NOT NULL,
  -- Frozen. Not a join to the document: the document row could in principle
  -- be corrected, and this is what the signer actually agreed to.
  document_sha256     TEXT    NOT NULL,

  signer_person_id    UUID NOT NULL,
  signer_printed_name TEXT NOT NULL,
  signer_relationship TEXT,
  signed_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- What was ticked and typed on the day, frozen for the PDF and for a
  -- dispute. church.person_sensitive holds the LIVE operational record the
  -- desk reads, and the two are allowed to diverge - a parent updates an
  -- allergy next month without re-signing, and that is correct, not drift.
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,

  source TEXT NOT NULL,

  -- Portal attribution: the signer was authenticated as themselves.
  signer_auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- In-person attribution. Either a named volunteer who witnessed it, or the
  -- registered device it was signed on.
  witness_volunteer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  witness_station_id   UUID,
  witness_name         TEXT,

  secondary_signer_person_id    UUID,
  secondary_signer_printed_name TEXT,
  secondary_signed_at           TIMESTAMPTZ,

  user_agent          TEXT,
  client_ip_reported  TEXT,

  pdf_storage_path TEXT,
  pdf_sha256       TEXT,
  pdf_bytes        INTEGER,

  -- The Ministry Use Only block on the paper form. Never re-rendered into the
  -- stored PDF: the document says "Reviewed by: ______" and the review lives
  -- here. Mutating a signed document after signing is exactly what this
  -- design exists to prevent.
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_name TEXT,

  revoked_at       TIMESTAMPTZ,
  revoked_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by_name  TEXT,
  revoked_reason   TEXT,

  -- Presentational only. See the header: this is not a withdrawal.
  superseded_by_signature_id UUID REFERENCES church.consent_signatures(id) ON DELETE SET NULL,

  legal_hold BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_consent_signature_signer
    FOREIGN KEY (signer_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE RESTRICT,

  CONSTRAINT chk_consent_signature_source
    CHECK (source IN ('kiosk', 'portal')),

  -- Structurally impossible to hold a signature without the attribution its
  -- own source implies.
  --
  -- For 'portal' that is an authenticated user, full stop.
  --
  -- For 'kiosk' it is a named volunteer OR a registered device. An earlier
  -- draft demanded a named volunteer always, which a SELF-SERVICE kiosk
  -- cannot satisfy - there is nobody standing there, which is the entire
  -- point of it. Demanding a name from a device with no human at it would
  -- either block signing or invite a fictional one, and a made-up witness is
  -- worse evidence than an honest device id.
  CONSTRAINT chk_consent_signature_portal_attribution
    CHECK (source <> 'portal' OR signer_auth_user_id IS NOT NULL),
  CONSTRAINT chk_consent_signature_kiosk_attribution
    CHECK (source <> 'kiosk'
           OR witness_volunteer_id IS NOT NULL
           OR witness_station_id IS NOT NULL),

  CONSTRAINT chk_consent_signature_printed_name
    CHECK (length(btrim(signer_printed_name)) >= 2),

  -- A secondary signer is a name AND a time, or neither. Half of one is a
  -- record nobody can read back.
  CONSTRAINT chk_consent_signature_secondary
    CHECK ((secondary_signer_printed_name IS NULL) = (secondary_signed_at IS NULL)),

  CONSTRAINT chk_consent_signature_revoked
    CHECK ((revoked_at IS NULL) = (revoked_by_name IS NULL)),
  CONSTRAINT chk_consent_signature_reviewed
    CHECK ((reviewed_at IS NULL) = (reviewed_by_name IS NULL)),
  CONSTRAINT chk_consent_signature_sha
    CHECK (document_sha256 ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE church.consent_signatures IS
  'One signing of the parent/guardian consent form. document_version and '
  'document_sha256 are frozen here so the church can prove which words were '
  'agreed to. Coverage is NOT here - it is one row per named child in '
  'church.consent_children.';

COMMENT ON COLUMN church.consent_signatures.superseded_by_signature_id IS
  'Presentational: which signature the office shows as current. NOT a '
  'withdrawal, and deliberately absent from the coverage predicate. A child '
  'named on a superseded signature is still covered.';

COMMENT ON COLUMN church.consent_signatures.client_ip_reported IS
  'A forwarded header, which is spoofable, and NOT inet_client_addr(), which '
  'under the pooler is the pooler. Evidence, not authentication - the column '
  'name says so on purpose.';

COMMENT ON COLUMN church.consent_signatures.answers IS
  'Frozen at signing, for the PDF and for a dispute. The live operational '
  'record is church.person_sensitive; the two are allowed to diverge.';

CREATE INDEX IF NOT EXISTS idx_consent_signatures_household
  ON church.consent_signatures (household_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_signatures_org
  ON church.consent_signatures (organization_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_signatures_signer
  ON church.consent_signatures (signer_person_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_signatures_unreviewed
  ON church.consent_signatures (organization_id, signed_at)
  WHERE reviewed_at IS NULL AND revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_consent_signatures_updated_at ON church.consent_signatures;
CREATE TRIGGER trg_consent_signatures_updated_at
  BEFORE UPDATE ON church.consent_signatures
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- The children it names
-- ---------------------------------------------------------------------------
--
-- Names, dates of birth and grades are frozen AS TEXT. The PDF prints them,
-- and a later rename must not turn a stored document into a lie. The live
-- record is church.people; this is what the paper said.
CREATE TABLE IF NOT EXISTS church.consent_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_signature_id UUID NOT NULL
    REFERENCES church.consent_signatures(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  child_person_id UUID NOT NULL,

  child_name_at_signing TEXT NOT NULL,
  child_dob_text        TEXT,
  child_grade_text      TEXT,

  -- Per-child answers. Photo consent is the one that matters today:
  -- photo_consent is a per-child column, and one household answer applied to
  -- N children overwrites real differences between them.
  per_child_answers JSONB NOT NULL DEFAULT '{}'::jsonb,

  withdrawn_at        TIMESTAMPTZ,
  withdrawn_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  withdrawn_by_name   TEXT,
  withdrawn_reason    TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_consent_child UNIQUE (consent_signature_id, child_person_id),
  CONSTRAINT fk_consent_child_person
    FOREIGN KEY (child_person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT chk_consent_child_name
    CHECK (length(btrim(child_name_at_signing)) >= 1),
  CONSTRAINT chk_consent_child_withdrawn
    CHECK ((withdrawn_at IS NULL) = (withdrawn_by_name IS NULL))
);

COMMENT ON TABLE church.consent_children IS
  'One row per child named on a signature, frozen at signing. THIS is where '
  'coverage lives. Names are frozen as text because the PDF prints them and a '
  'later rename must not make a stored document a lie.';

CREATE INDEX IF NOT EXISTS idx_consent_children_child
  ON church.consent_children (child_person_id)
  WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_consent_children_signature
  ON church.consent_children (consent_signature_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- A signature carries the answers to a medical form, so this is narrower than
-- the document it points at.
--
-- NOT kids_volunteer and NOT leadership_viewer. The desk learns whether a
-- child is covered through church.child_consent_state, which returns a state
-- and nothing else - no household, no signer, no answers. A volunteer must
-- not learn a custody history from a check-in screen.
ALTER TABLE church.consent_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE church.consent_children  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kids and member admins can view signatures" ON church.consent_signatures;
CREATE POLICY "Kids and member admins can view signatures"
  ON church.consent_signatures FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['kids_admin','members_admin']::church.module_permission[])));

-- A parent sees their own household's signatures, and any they signed
-- themselves. The second half matters after a household change: the person
-- who signed keeps access to what they put their name to.
DROP POLICY IF EXISTS "A parent can view their household's signatures" ON church.consent_signatures;
CREATE POLICY "A parent can view their household's signatures"
  ON church.consent_signatures FOR SELECT TO authenticated
  USING (household_id IN (SELECT church.my_household_ids())
         OR signer_person_id IN (SELECT church.my_person_ids()));

DROP POLICY IF EXISTS "Consent children follow the signature" ON church.consent_children;
CREATE POLICY "Consent children follow the signature"
  ON church.consent_children FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM church.consent_signatures s
                  WHERE s.id = consent_signature_id));

-- No INSERT, UPDATE or DELETE policy for anyone, on either table. Every write
-- goes through a definer RPC below, which is what keeps a signature, its
-- children and its supersession consistent with one another.
GRANT SELECT ON church.consent_signatures TO authenticated;
GRANT SELECT ON church.consent_children  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.consent_signatures TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.consent_children  TO service_role;

-- ---------------------------------------------------------------------------
-- Audit actions
-- ---------------------------------------------------------------------------
--
-- The full list, carried forward. Three separate migrations have now widened
-- this constraint and each had to carry every earlier value:
-- restricted_pickup_override is written by check_out_children TODAY, so a
-- widening that drops it silently breaks the live break-glass release.
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
    -- new at 20260322210100
    'consent_signed', 'consent_revoked', 'consent_child_withdrawn',
    'consent_reviewed']));

-- ---------------------------------------------------------------------------
-- Is this child covered?
-- ---------------------------------------------------------------------------
--
-- SIX STATES, NOT A BOOLEAN. Collapsing them is what produces a screen that
-- tells a family who signed last month that they have never signed.
--
--   covered                 a live, non-withdrawn row names this child
--   covered_elsewhere       covered, but by a signature this household cannot
--                           see - the child moved, and nobody withdrew
--                           anything, so coverage followed the child
--   child_not_on_signature  their household has signed; this child was not
--                           named. The remedy is a NEW signature, not an
--                           addendum, and it is a different sentence from
--                           never having signed
--   revoked                 they were named, and it was taken back
--   no_signature            nobody in this household has signed
--   no_household            no current household membership at all. Signing
--                           refuses with no_guardian_on_record; a consent with
--                           no recorded guardian is not a consent. The remedy
--                           is station_register_visitor_family, which already
--                           creates the household and the guardian.
--
-- _for_household_id is how 'covered_elsewhere' is told apart from 'covered'.
-- The PORTAL passes the parent's household and gets the honest answer, which
-- is what lets it offer a fresh form instead of a blank screen. THE DESK
-- PASSES NULL and sees only 'covered' - a volunteer must not learn from a
-- check-in screen that a child's consent lives with a different household.
CREATE OR REPLACE FUNCTION church.child_consent_state(
  _child_person_id UUID,
  _for_household_id UUID DEFAULT NULL
)
RETURNS TABLE (
  state            TEXT,
  signature_id     UUID,
  signed_at        TIMESTAMPTZ,
  document_version INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _covering  RECORD;
  _has_home  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM church.household_members hm
     WHERE hm.person_id = _child_person_id AND hm.end_date IS NULL
  ) INTO _has_home;

  IF NOT _has_home THEN
    RETURN QUERY SELECT 'no_household'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::INTEGER;
    RETURN;
  END IF;

  -- The whole predicate. Note what is NOT in it: superseded_by_signature_id.
  SELECT s.id, s.signed_at, s.document_version, s.household_id
    INTO _covering
  FROM church.consent_children cc
  JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
  WHERE cc.child_person_id = _child_person_id
    AND cc.withdrawn_at IS NULL
    AND s.revoked_at IS NULL
  ORDER BY s.signed_at DESC
  LIMIT 1;

  IF _covering.id IS NOT NULL THEN
    RETURN QUERY SELECT
      CASE WHEN _for_household_id IS NULL
                OR _covering.household_id IS NOT DISTINCT FROM _for_household_id
           THEN 'covered' ELSE 'covered_elsewhere' END,
      _covering.id, _covering.signed_at, _covering.document_version;
    RETURN;
  END IF;

  -- Their household has signed, but this child was not named on it. A
  -- different sentence from never having signed, and a different remedy.
  IF EXISTS (
    SELECT 1
    FROM church.household_members hm
    JOIN church.consent_signatures s ON s.household_id = hm.household_id
    WHERE hm.person_id = _child_person_id
      AND hm.end_date IS NULL
      AND s.revoked_at IS NULL
  ) THEN
    RETURN QUERY SELECT 'child_not_on_signature'::TEXT, NULL::UUID,
                        NULL::TIMESTAMPTZ, NULL::INTEGER;
    RETURN;
  END IF;

  -- They were named once, and it was taken back or they were withdrawn.
  IF EXISTS (
    SELECT 1 FROM church.consent_children cc
    JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
    WHERE cc.child_person_id = _child_person_id
  ) THEN
    RETURN QUERY SELECT 'revoked'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::INTEGER;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'no_signature'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::INTEGER;
END;
$$;

COMMENT ON FUNCTION church.child_consent_state(UUID, UUID) IS
  'Six states, not a boolean. Pass _for_household_id from the portal to tell '
  'covered_elsewhere from covered; pass NULL from the desk, which must not '
  'learn which household holds a child''s consent.';

GRANT EXECUTE ON FUNCTION church.child_consent_state(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Signing, in one transaction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.sign_kids_consent(
  _organization_id   UUID,
  _household_id      UUID,
  _child_person_ids  UUID[],
  _signer_person_id  UUID,
  _signer_printed_name TEXT,
  _source            TEXT,
  _answers           JSONB DEFAULT '{}'::jsonb,
  _per_child_answers JSONB DEFAULT '{}'::jsonb,
  _signer_relationship TEXT DEFAULT NULL,
  _secondary_signer_person_id  UUID DEFAULT NULL,
  _secondary_printed_name      TEXT DEFAULT NULL,
  _witness_station_id UUID DEFAULT NULL,
  _user_agent         TEXT DEFAULT NULL,
  _client_ip_reported TEXT DEFAULT NULL
)
RETURNS TABLE (
  signature_id     UUID,
  document_version INTEGER,
  document_sha256  TEXT,
  children_named   INTEGER,
  superseded_signature_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _doc         RECORD;
  _actor_name  TEXT;
  _is_parent   BOOLEAN;
  _is_team     BOOLEAN;
  _ticked      TEXT[];
  _missing     TEXT;
  _sig         UUID;
  _superseded  UUID;
  _child       UUID;
  _named       INTEGER := 0;
  _witness_uid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _source NOT IN ('kiosk', 'portal') THEN
    RAISE EXCEPTION 'source_must_be_kiosk_or_portal';
  END IF;

  IF _child_person_ids IS NULL OR array_length(_child_person_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'a_signature_must_name_at_least_one_child'
      USING HINT = 'Coverage is per named child. A signature naming nobody '
                   'covers nobody.';
  END IF;

  -- Who may sign, and as what ------------------------------------------------
  --
  -- The portal path is the parent themselves: the signer must be one of the
  -- caller's own person records. Free text alone would let "Mickey Mouse"
  -- onto a legal record, which is why signer_person_id is picked rather than
  -- typed, and the typed string is stored beside it.
  _is_parent := _signer_person_id IN (SELECT church.my_person_ids());
  _is_team   := church.has_permission_in_org(
                  _organization_id,
                  ARRAY['kids_admin','kids_leader','kids_volunteer']::church.module_permission[]);

  IF _source = 'portal' AND NOT _is_parent THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'A portal signature must be signed by the parent themselves.';
  END IF;

  -- The in-person path is a member of the kids team at the desk, standing
  -- with the parent. The self-service kiosk account has no module grant at
  -- all by design, so it cannot satisfy this yet; the branch that gives
  -- resolve_actor its kiosk arm is what opens this path to an unattended
  -- device, and until then signing in person means a staffed desk.
  IF _source = 'kiosk' AND NOT _is_team AND NOT _is_parent THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Signing at the desk is done by the Kids Ministry team.';
  END IF;

  -- The document -------------------------------------------------------------
  SELECT d.* INTO _doc
  FROM church.consent_documents d
  WHERE d.organization_id = _organization_id
    AND d.code = 'kids_parent_consent'
    AND d.retired_at IS NULL
    AND d.effective_from <= current_date;

  IF _doc.id IS NULL THEN
    RAISE EXCEPTION 'no_consent_form_published'
      USING HINT = 'A Kids Ministry admin must publish the form first.';
  END IF;

  -- The household ------------------------------------------------------------
  IF _household_id IS NULL THEN
    RAISE EXCEPTION 'no_guardian_on_record'
      USING HINT = 'Register the family first - a consent with no recorded '
                   'guardian is not a consent.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = _household_id
      AND hm.person_id = _signer_person_id
      AND hm.end_date IS NULL
      AND NOT p.is_child
  ) THEN
    RAISE EXCEPTION 'signer_not_an_adult_of_this_household'
      USING HINT = 'The signer is picked from the household''s adults.';
  END IF;

  -- Every child must currently belong to the household being signed for.
  -- Otherwise one parent could name another family's child on their form.
  SELECT c INTO _child
  FROM unnest(_child_person_ids) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM church.household_members hm
    WHERE hm.household_id = _household_id AND hm.person_id = c AND hm.end_date IS NULL)
  LIMIT 1;

  IF _child IS NOT NULL THEN
    RAISE EXCEPTION 'child_not_in_this_household: %', _child;
  END IF;

  -- The acknowledgments ------------------------------------------------------
  --
  -- The server is the authority on this, not the screen. A screen that
  -- forgets to require a tick is a screen, and this is a legal record.
  SELECT coalesce(array_agg(k), '{}') INTO _ticked
  FROM jsonb_object_keys(coalesce(_answers, '{}'::jsonb)) AS k
  WHERE (_answers->>k) IN ('true', 'yes', 'on');

  SELECT r INTO _missing
  FROM unnest(_doc.required_acknowledgments) AS r
  WHERE NOT (r = ANY(_ticked))
  LIMIT 1;

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'required_acknowledgment_missing: %', _missing
      USING HINT = 'Every required item on the form must be agreed to '
                   'individually.';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  -- Attribution. At a staffed desk the witness is the signed-in volunteer;
  -- on a registered device it is the device.
  IF _source = 'kiosk' AND _is_team THEN
    _witness_uid := auth.uid();
  END IF;

  -- Supersede the household's previous live signature. PRESENTATIONAL: it
  -- does not remove coverage from anybody named on it. See the header.
  SELECT s.id INTO _superseded
  FROM church.consent_signatures s
  WHERE s.household_id = _household_id
    AND s.document_code = 'kids_parent_consent'
    AND s.revoked_at IS NULL
    AND s.superseded_by_signature_id IS NULL
  ORDER BY s.signed_at DESC
  LIMIT 1;

  INSERT INTO church.consent_signatures (
    organization_id, household_id, consent_document_id, document_code,
    document_version, document_sha256,
    signer_person_id, signer_printed_name, signer_relationship,
    answers, source,
    signer_auth_user_id, witness_volunteer_id, witness_station_id, witness_name,
    secondary_signer_person_id, secondary_signer_printed_name, secondary_signed_at,
    user_agent, client_ip_reported)
  VALUES (
    _organization_id, _household_id, _doc.id, _doc.code,
    _doc.version, _doc.body_sha256,
    _signer_person_id, btrim(_signer_printed_name), _signer_relationship,
    coalesce(_answers, '{}'::jsonb), _source,
    CASE WHEN _source = 'portal' THEN auth.uid() END,
    _witness_uid,
    CASE WHEN _source = 'kiosk' THEN _witness_station_id END,
    CASE WHEN _source = 'kiosk' AND _witness_uid IS NOT NULL THEN _actor_name END,
    _secondary_signer_person_id,
    nullif(btrim(coalesce(_secondary_printed_name, '')), ''),
    CASE WHEN nullif(btrim(coalesce(_secondary_printed_name, '')), '') IS NOT NULL
         THEN now() END,
    _user_agent, _client_ip_reported)
  RETURNING id INTO _sig;

  -- The named children, frozen as text.
  FOREACH _child IN ARRAY _child_person_ids LOOP
    INSERT INTO church.consent_children (
      consent_signature_id, organization_id, child_person_id,
      child_name_at_signing, child_dob_text, child_grade_text, per_child_answers)
    SELECT _sig, _organization_id, p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
           CASE WHEN p.birth_year IS NOT NULL
                THEN p.birth_year::TEXT ||
                     coalesce('-' || lpad(p.birth_month::TEXT, 2, '0'), '') END,
           (SELECT g.display_name FROM church.school_grades g WHERE g.id = p.school_grade_id),
           coalesce(_per_child_answers->(p.id::TEXT), '{}'::jsonb)
    FROM church.people p
    WHERE p.id = _child AND p.organization_id = _organization_id
    ON CONFLICT (consent_signature_id, child_person_id) DO NOTHING;

    _named := _named + 1;
  END LOOP;

  IF _superseded IS NOT NULL THEN
    UPDATE church.consent_signatures
       SET superseded_by_signature_id = _sig
     WHERE id = _superseded;
  END IF;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_organization_id, 'consent_signed', 'success', auth.uid(), _actor_name,
          jsonb_build_object('signature_id', _sig, 'household_id', _household_id,
                             'children', _named, 'source', _source,
                             'document_version', _doc.version,
                             'superseded', _superseded));

  RETURN QUERY SELECT _sig, _doc.version, _doc.body_sha256, _named, _superseded;
END;
$$;

GRANT EXECUTE ON FUNCTION church.sign_kids_consent(
  UUID, UUID, UUID[], UUID, TEXT, TEXT, JSONB, JSONB, TEXT, UUID, TEXT, UUID,
  TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Taking it back
-- ---------------------------------------------------------------------------
--
-- Two different acts, deliberately not one:
--
--   revoke_kids_consent      the whole signature. Everyone named on it loses
--                            coverage. This is "I withdraw my consent".
--   withdraw_child_consent   one child off one signature, leaving their
--                            siblings covered. This is "not this one".
--
-- Both are available to the parent who signed and to a kids admin. A parent
-- must be able to withdraw a consent they gave, without asking anybody's
-- permission - that is what makes it a consent.
CREATE OR REPLACE FUNCTION church.revoke_kids_consent(
  _signature_id UUID,
  _reason       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _sig RECORD; _actor_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _sig FROM church.consent_signatures WHERE id = _signature_id;
  IF _sig.id IS NULL THEN RAISE EXCEPTION 'signature_not_found'; END IF;

  IF NOT (_sig.signer_person_id IN (SELECT church.my_person_ids())
          OR _sig.household_id IN (SELECT church.my_household_ids())
          OR church.has_permission_in_org(
               _sig.organization_id, ARRAY['kids_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF _sig.revoked_at IS NOT NULL THEN RETURN; END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  UPDATE church.consent_signatures
     SET revoked_at = now(), revoked_by = auth.uid(),
         revoked_by_name = _actor_name, revoked_reason = _reason
   WHERE id = _signature_id;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_sig.organization_id, 'consent_revoked', 'success', auth.uid(), _actor_name,
          jsonb_build_object('signature_id', _signature_id));
END;
$$;

GRANT EXECUTE ON FUNCTION church.revoke_kids_consent(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION church.withdraw_child_consent(
  _signature_id    UUID,
  _child_person_id UUID,
  _reason          TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _sig RECORD; _actor_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _sig FROM church.consent_signatures WHERE id = _signature_id;
  IF _sig.id IS NULL THEN RAISE EXCEPTION 'signature_not_found'; END IF;

  IF NOT (_sig.signer_person_id IN (SELECT church.my_person_ids())
          OR _sig.household_id IN (SELECT church.my_household_ids())
          OR church.has_permission_in_org(
               _sig.organization_id, ARRAY['kids_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  UPDATE church.consent_children
     SET withdrawn_at = now(), withdrawn_by = auth.uid(),
         withdrawn_by_name = _actor_name, withdrawn_reason = _reason
   WHERE consent_signature_id = _signature_id
     AND child_person_id = _child_person_id
     AND withdrawn_at IS NULL;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, child_person_id,
    actor_auth_user_id, actor_name, detail)
  VALUES (_sig.organization_id, 'consent_child_withdrawn', 'success', _child_person_id,
          auth.uid(), _actor_name,
          jsonb_build_object('signature_id', _signature_id));
END;
$$;

GRANT EXECUTE ON FUNCTION church.withdraw_child_consent(UUID, UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- The Ministry Use Only block
-- ---------------------------------------------------------------------------
--
-- "Date Received" on the paper form is signed_at - there is no post. What is
-- left is "Reviewed By", and it is recorded HERE and never re-rendered into
-- the stored PDF. Mutating a signed document after signing is exactly what
-- this whole design exists to prevent.
CREATE OR REPLACE FUNCTION church.record_consent_review(_signature_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _sig RECORD; _actor_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _sig FROM church.consent_signatures WHERE id = _signature_id;
  IF _sig.id IS NULL THEN RAISE EXCEPTION 'signature_not_found'; END IF;

  IF NOT church.has_permission_in_org(
           _sig.organization_id,
           ARRAY['kids_admin','members_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  UPDATE church.consent_signatures
     SET reviewed_at = now(), reviewed_by = auth.uid(), reviewed_by_name = _actor_name
   WHERE id = _signature_id;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, actor_auth_user_id, actor_name, detail)
  VALUES (_sig.organization_id, 'consent_reviewed', 'success', auth.uid(), _actor_name,
          jsonb_build_object('signature_id', _signature_id));
END;
$$;

GRANT EXECUTE ON FUNCTION church.record_consent_review(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- How is the collection going?
-- ---------------------------------------------------------------------------
--
-- The card a kids admin looks at in mid-October to decide whether to hold the
-- enforcement date or move it. Coverage counted per CHILD and per HOUSEHOLD,
-- because 216 signatures cover 534 children and the two numbers answer
-- different questions.
CREATE OR REPLACE FUNCTION church.kids_consent_coverage(_organization_id UUID)
RETURNS TABLE (
  children_total       INTEGER,
  children_covered     INTEGER,
  children_uncovered   INTEGER,
  children_no_household INTEGER,
  households_total     INTEGER,
  households_signed    INTEGER,
  signatures_unreviewed INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id,
           ARRAY['kids_admin','kids_leader','leadership_viewer']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH kids AS (
    SELECT p.id
    FROM church.people p
    WHERE p.organization_id = _organization_id
      AND p.is_child AND p.is_active AND p.merged_into_person_id IS NULL
  ),
  scored AS (
    SELECT k.id, (church.child_consent_state(k.id)).state AS state FROM kids k
  ),
  homes AS (
    SELECT DISTINCT hm.household_id
    FROM church.household_members hm JOIN kids k ON k.id = hm.person_id
    WHERE hm.end_date IS NULL
  )
  SELECT
    (SELECT count(*)::INTEGER FROM scored),
    (SELECT count(*)::INTEGER FROM scored WHERE state IN ('covered','covered_elsewhere')),
    (SELECT count(*)::INTEGER FROM scored WHERE state NOT IN ('covered','covered_elsewhere')),
    (SELECT count(*)::INTEGER FROM scored WHERE state = 'no_household'),
    (SELECT count(*)::INTEGER FROM homes),
    (SELECT count(DISTINCT s.household_id)::INTEGER
       FROM church.consent_signatures s
      WHERE s.organization_id = _organization_id
        AND s.revoked_at IS NULL
        AND s.household_id IN (SELECT household_id FROM homes)),
    (SELECT count(*)::INTEGER FROM church.consent_signatures s
      WHERE s.organization_id = _organization_id
        AND s.revoked_at IS NULL AND s.reviewed_at IS NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_consent_coverage(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
