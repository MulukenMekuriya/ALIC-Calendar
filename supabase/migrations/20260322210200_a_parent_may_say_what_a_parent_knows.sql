-- =====================================================
-- A parent may say what a parent knows
-- =====================================================
--
-- Two doors into church.person_sensitive for a parent, and what happens to
-- the consent form when they use one.
--
-- THIS REVERSES A PRIOR DECISION, DELIBERATELY. The portal has until now told
-- parents, in as many words, that allergies and medical notes are "not
-- changed from here" and to speak to the desk. The reason given was sound:
-- those fields are read at the desk with the child standing there, they sit
-- next to custody records, and widening them deserved its own decision rather
-- than arriving as a side-effect of a form about names.
--
-- This IS that decision, and it is its own migration so it can be reverted on
-- its own. Three things make it the right way round now:
--
--   - The parent is the authoritative source. Nobody at the church knows a
--     child's allergies better than the person who lives with them.
--   - There are TEN church.person_sensitive rows for 534 children. The field
--     is not a record being protected; it is a record that does not exist.
--   - Section 10 of the church's own consent form already makes it the
--     parent's responsibility to "promptly notify ALIC Church of any changes
--     ... including allergies, medical conditions, medications". The paper
--     form asks them to tell us; refusing to let them is the odd part.
--
-- WHAT IS STILL NOT HERE. church.kids_pickup_restrictions. Those are custody
-- records, the paper form does not ask about them, and a parent editing who
-- may collect their child is a different decision with different stakes.
--
-- PHOTO CONSENT IS ALSO NOT HERE, though it lives in the same table. It
-- belongs to section 9 of the consent form, where it is asked per child with
-- the explanation it needs - and there is a trap: can_view_photos_of() treats
-- photo_consent = false as hiding the photo from EVERYONE, including the
-- parent who uploaded it. A medical form that quietly flipped it would blank
-- a family's own child in their own portal.
--
-- ---------------------------------------------------------------------------
-- WHEN A PARENT EDITS, THE FORM GOES OUT OF DATE - AFTER FOUR WEEKS
-- ---------------------------------------------------------------------------
--
-- The signed form lists the child's allergies as they were on the day. When a
-- parent changes them, the stored PDF no longer matches the record, so the
-- signature is marked stale, the Kids Ministry admins are told, and the
-- family is asked to sign again. All of that happens in this transaction,
-- with nobody having to notice.
--
-- THE FAMILY GETS FOUR WEEKS. Not zero, and not forever.
--
-- Not zero, because a parent who reports a new allergy on a Saturday evening
-- and finds their child refused on Sunday morning has been punished for doing
-- exactly what the form asks of them - and they would learn not to do it
-- again, which is the opposite of what the church wants. The safety purpose
-- is served the instant they save: allergy_label_short is re-derived below,
-- so the classroom tag carries the new allergy on the very next check-in,
-- signature or no signature.
--
-- Not forever, because a consent form that no longer describes the child is
-- not doing its job, and "we asked them once in October" is not a record of
-- having chased it.
--
-- Four weeks is four Sundays. A family who comes fortnightly still gets two
-- chances to be handed a tablet by a volunteer, which is the realistic way
-- most of these will actually get signed.
--
-- The deadline is FROZEN on the row when it is set, not recomputed from the
-- policy each time it is read. A family told they have until the 3rd must
-- still have until the 3rd if an admin shortens the grace period on the 1st.
--
-- Two automated reminders, a week before and on the day, from a daily sweep.
-- Sending one email a month ago and calling it a process is how a family ends
-- up surprised at a desk.

-- ---------------------------------------------------------------------------
-- Policy
-- ---------------------------------------------------------------------------
--
-- One row per branch. Later migrations add the enforcement mode and its
-- go-live date to this same table; it starts with the one number this
-- migration needs.
CREATE TABLE IF NOT EXISTS church.kids_consent_policy (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- How long a family has to re-sign after they change medical information.
  resign_grace_days INTEGER NOT NULL DEFAULT 28,

  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A grace of zero is "refuse them the next morning", which this migration's
  -- header argues against at length. An upper bound because a year-long grace
  -- is the absence of one.
  CONSTRAINT chk_kids_consent_grace
    CHECK (resign_grace_days BETWEEN 7 AND 180)
);

COMMENT ON TABLE church.kids_consent_policy IS
  'Per-branch consent settings. resign_grace_days is how long a family has to '
  'sign again after changing a child''s medical information.';

INSERT INTO church.kids_consent_policy (organization_id, updated_by_name)
SELECT o.id, 'ALIC Kids Ministry' FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE church.kids_consent_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read the consent policy" ON church.kids_consent_policy;
CREATE POLICY "Members can read the consent policy"
  ON church.kids_consent_policy FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));

GRANT SELECT ON church.kids_consent_policy TO authenticated;
GRANT SELECT, INSERT, UPDATE ON church.kids_consent_policy TO service_role;

DROP TRIGGER IF EXISTS trg_kids_consent_policy_updated_at ON church.kids_consent_policy;
CREATE TRIGGER trg_kids_consent_policy_updated_at
  BEFORE UPDATE ON church.kids_consent_policy
  FOR EACH ROW EXECUTE FUNCTION church.update_updated_at_column();

-- kids_admin specifically, not assert_kids_leader - that helper admits
-- leadership_viewer, a read-only reporting role, and this number decides when
-- a child stops being able to come to a classroom.
CREATE OR REPLACE FUNCTION church.set_consent_resign_grace(
  _organization_id UUID,
  _days            INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _actor_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  INSERT INTO church.kids_consent_policy (organization_id, resign_grace_days,
                                          updated_by, updated_by_name)
  VALUES (_organization_id, _days, auth.uid(), _actor_name)
  ON CONFLICT (organization_id) DO UPDATE SET
    resign_grace_days = EXCLUDED.resign_grace_days,
    updated_by = EXCLUDED.updated_by,
    updated_by_name = EXCLUDED.updated_by_name;

  -- Deliberately does NOT move any deadline already given to a family. See
  -- the header: a date a parent was told is a date they keep.
END;
$$;

GRANT EXECUTE ON FUNCTION church.set_consent_resign_grace(UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- A history, because an allergy is not an ordinary field
-- ---------------------------------------------------------------------------
--
-- person_sensitive is a single mutable row per person. Once parents can write
-- to it, "when did the church first know about the peanut allergy" becomes a
-- question somebody will one day have to answer, and an overwritten row
-- cannot answer it.
CREATE TABLE IF NOT EXISTS church.person_sensitive_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  person_id       UUID NOT NULL,

  -- The values AFTER the change. A row is what was true from created_at
  -- onwards, so reading the history in order replays the record.
  allergy_severity TEXT,
  allergies        TEXT,
  medications      TEXT,
  medical_notes    TEXT,
  special_needs    TEXT,
  special_needs_flag BOOLEAN,

  changed_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name  TEXT NOT NULL,
  -- 'parent' | 'staff'. Who said so matters: a parent's account of their own
  -- child is the authoritative one, and an office correction is not.
  changed_by_role  TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_person_sensitive_history_role
    CHECK (changed_by_role IN ('parent', 'staff'))
);

COMMENT ON TABLE church.person_sensitive_history IS
  'Append-only. Each row is what was true from created_at onwards, so reading '
  'in order replays the record. Exists because person_sensitive is one '
  'mutable row and "when did we first know" is a question somebody will ask.';

CREATE INDEX IF NOT EXISTS idx_person_sensitive_history_person
  ON church.person_sensitive_history (person_id, created_at DESC);

ALTER TABLE church.person_sensitive_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read medical history" ON church.person_sensitive_history;
CREATE POLICY "Admins can read medical history"
  ON church.person_sensitive_history FOR SELECT TO authenticated
  USING (organization_id IN (SELECT church.my_orgs_with_any(
    ARRAY['members_admin','kids_admin']::church.module_permission[])));

-- Not the parent. They see the CURRENT record through my_child_medical, which
-- is the operational truth; a version history of a child's medical record is
-- an office record, and handing one household a timeline of what another
-- adult in it wrote is a different feature with different consequences.
GRANT SELECT ON church.person_sensitive_history TO authenticated;
GRANT SELECT, INSERT ON church.person_sensitive_history TO service_role;

-- ---------------------------------------------------------------------------
-- The signed form goes out of date
-- ---------------------------------------------------------------------------
ALTER TABLE church.consent_children
  ADD COLUMN IF NOT EXISTS medical_changed_at TIMESTAMPTZ;
ALTER TABLE church.consent_children
  ADD COLUMN IF NOT EXISTS resign_due_by DATE;
ALTER TABLE church.consent_children
  ADD COLUMN IF NOT EXISTS resign_reminded_at TIMESTAMPTZ;
ALTER TABLE church.consent_children
  ADD COLUMN IF NOT EXISTS resign_overdue_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN church.consent_children.medical_changed_at IS
  'When the medical information on this child first changed after this form '
  'was signed, so the PDF on file no longer matches the record. NULL means '
  'the form is current. Re-signing creates fresh rows, which is what clears '
  'it.';

COMMENT ON COLUMN church.consent_children.resign_due_by IS
  'The date the family was told they have until. FROZEN when set - shortening '
  'the branch''s grace period must not move a deadline somebody has already '
  'been given. Past this date the child reads as consent_out_of_date.';

CREATE INDEX IF NOT EXISTS idx_consent_children_resign_due
  ON church.consent_children (resign_due_by)
  WHERE medical_changed_at IS NOT NULL AND withdrawn_at IS NULL;

-- ---------------------------------------------------------------------------
-- The label a classroom reads
-- ---------------------------------------------------------------------------
--
-- allergy_label_short is what prints on the 58mm tag. The parent does not
-- type it: a parent writing a careful paragraph about their child's condition
-- would otherwise produce a tag with a paragraph on it, and the tag has one
-- job, which is to make a volunteer STOP AND ASK.
--
-- 24 CHARACTERS, because that is what church.person_sensitive has always
-- enforced: chk_person_sensitive_label_len caps the column at 24, and the
-- longest label actually on file at ALIC is 21 ("Peanuts and tree nuts").
--
-- The label renderer's own ALLERGY_CAP is 44, which is a DISPLAY fallback for
-- text that somehow got past the column - not the budget. Deriving to 44 here
-- would mean every parent with a real allergy list got a constraint violation
-- instead of a saved record, which is how this was found.
--
-- TRUNCATION ANNOUNCES ITSELF. The dangerous version is the one where the
-- last allergen quietly disappears and a volunteer reads a complete-looking
-- list that is missing something. So anything dropped leaves a trailing
-- ellipsis, which is the tag saying what the black bar is there to say:
-- STOP AND ASK. The full list is on the safety card at the desk, where
-- reading it is audited.
--
-- Cut back to a word boundary rather than mid-word, because "shellf" reads as
-- a glitch and invites somebody to fill in the rest from memory.
CREATE OR REPLACE FUNCTION church.derive_allergy_label(_allergies TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = church, public
AS $$
  WITH flat AS (
    SELECT btrim(regexp_replace(coalesce(_allergies, ''), '\s+', ' ', 'g')) AS t
  )
  SELECT CASE
    WHEN t = '' THEN NULL
    WHEN length(t) <= 24 THEN t
    -- 23 plus the ellipsis keeps the whole thing inside the column's 24.
    ELSE coalesce(
           nullif(btrim(regexp_replace(left(t, 23), '\s\S*$', '')), ''),
           left(t, 23)) || chr(8230)
  END
  FROM flat
$$;

COMMENT ON FUNCTION church.derive_allergy_label(TEXT) IS
  'The 44-character classroom tag, derived from what a parent wrote rather '
  'than typed by them. Matches the cap in the label renderer so the two '
  'cannot disagree.';

-- ---------------------------------------------------------------------------
-- Who may read and write a child's medical record
-- ---------------------------------------------------------------------------
--
-- An adult of the child's CURRENT household, or an admin. Separated out so
-- the read door and the write door cannot drift apart, and so the assertions
-- can test the predicate directly.
CREATE OR REPLACE FUNCTION church.may_edit_child_medical(_child_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT EXISTS (
    -- An adult sharing the child's current household.
    SELECT 1
    FROM church.household_members child_hm
    JOIN church.household_members adult_hm
      ON adult_hm.household_id = child_hm.household_id
    JOIN church.people adult ON adult.id = adult_hm.person_id
    WHERE child_hm.person_id = _child_person_id
      AND child_hm.end_date IS NULL
      AND adult_hm.end_date IS NULL
      AND NOT adult.is_child
      AND adult.id IN (SELECT church.my_person_ids())
  ) OR EXISTS (
    SELECT 1 FROM church.people p
    WHERE p.id = _child_person_id
      AND church.has_permission_in_org(
            p.organization_id,
            ARRAY['members_admin','kids_admin']::church.module_permission[])
  )
$$;

GRANT EXECUTE ON FUNCTION church.may_edit_child_medical(UUID) TO authenticated;

-- Door 1: reading. SECURITY DEFINER because a parent holds no module grant
-- and the table's policies are gated on members_admin|kids_admin. This is the
-- only way a household sees its own children's medical record.
CREATE OR REPLACE FUNCTION church.my_child_medical(_child_person_id UUID)
RETURNS TABLE (
  child_person_id  UUID,
  child_name       TEXT,
  has_record       BOOLEAN,
  allergy_severity TEXT,
  allergies        TEXT,
  medications      TEXT,
  medical_notes    TEXT,
  special_needs    TEXT,
  special_needs_flag BOOLEAN,
  updated_at       TIMESTAMPTZ,
  updated_by_name  TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT church.may_edit_child_medical(_child_person_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'This child is not in your household.';
  END IF;

  RETURN QUERY
  SELECT p.id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         -- "We asked and there is none" and "nobody asked" are different
         -- answers, and a form that cannot tell them apart will assert a
         -- negative nobody stated.
         (ps.person_id IS NOT NULL),
         ps.allergy_severity, ps.allergies, ps.medications, ps.medical_notes,
         ps.special_needs, ps.special_needs_flag,
         ps.updated_at, ps.updated_by_name
  FROM church.people p
  LEFT JOIN church.person_sensitive ps ON ps.person_id = p.id
  WHERE p.id = _child_person_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.my_child_medical(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Door 2: a parent writes what they know
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.update_child_medical(
  _child_person_id   UUID,
  _allergies         TEXT DEFAULT NULL,
  _allergy_severity  TEXT DEFAULT NULL,
  _medications       TEXT DEFAULT NULL,
  _medical_notes     TEXT DEFAULT NULL,
  _special_needs     TEXT DEFAULT NULL,
  -- The explicit "there is nothing to tell you" answer. Without it, a parent
  -- clearing a field and a parent who never filled one in are the same row,
  -- and the desk cannot tell "we asked and there is none" from "nobody
  -- asked". A form that silently asserts a negative is worse than no form.
  _no_known_conditions BOOLEAN DEFAULT false
)
RETURNS TABLE (
  changed           BOOLEAN,
  allergy_label     TEXT,
  consent_now_stale BOOLEAN,
  resign_due_by     DATE
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _org        UUID;
  _child_name TEXT;
  _actor_name TEXT;
  _role       TEXT;
  _old        church.person_sensitive%ROWTYPE;
  _label      TEXT;
  _changed    BOOLEAN := false;
  _stale      BOOLEAN := false;
  _rows       INTEGER := 0;
  _sev        TEXT;
  _grace      INTEGER;
  _due        DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT church.may_edit_child_medical(_child_person_id) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'This child is not in your household.';
  END IF;

  SELECT p.organization_id, coalesce(p.preferred_name, p.first_name)
    INTO _org, _child_name
  FROM church.people p WHERE p.id = _child_person_id;

  IF _org IS NULL THEN RAISE EXCEPTION 'child_not_found'; END IF;

  -- The four the column's CHECK actually permits. There is no 'moderate', and
  -- 'none' IS one of them - it is the explicit "we asked and there is none"
  -- answer, which is the whole reason a parent is being asked at all. A form
  -- that cannot record a stated negative leaves the desk unable to tell it
  -- from nobody having asked.
  _sev := nullif(btrim(coalesce(_allergy_severity, '')), '');
  IF _sev IS NOT NULL AND _sev NOT IN ('none', 'mild', 'severe', 'life_threatening') THEN
    RAISE EXCEPTION 'unknown_allergy_severity: %', _sev
      USING HINT = 'One of none, mild, severe, life_threatening.';
  END IF;

  -- allergy_severity is NOT NULL DEFAULT 'none', and passing an explicit NULL
  -- overrides the default rather than falling back to it. So the two cases
  -- have to be told apart here.
  --
  -- Nothing written in the allergies box: 'none' is literally true, and
  -- recording it is what lets the desk tell "we asked and there is none" from
  -- "nobody asked".
  --
  -- Something written but no severity chosen: REFUSE, rather than defaulting.
  -- Defaulting to 'none' would file a stated allergy as no allergy, which is
  -- the worst outcome this whole feature can produce. There is no 'unknown'
  -- in the four values the column permits, so the honest move is to make the
  -- form ask - it is one more tap, on the one question where guessing is
  -- unacceptable.
  IF nullif(btrim(coalesce(_allergies, '')), '') IS NULL THEN
    _sev := coalesce(_sev, 'none');
  ELSIF _sev IS NULL OR _sev = 'none' THEN
    RAISE EXCEPTION 'severity_required_with_allergies'
      USING HINT = 'How serious is it? mild, severe, or life_threatening.';
  END IF;

  SELECT * INTO _old FROM church.person_sensitive WHERE person_id = _child_person_id;

  _label := church.derive_allergy_label(_allergies);

  -- Did anything actually change? A save that changes nothing must not queue
  -- an email or stale a signature - a parent opening the form to read it and
  -- closing it again has told the church nothing new, and must not have a
  -- four-week clock started on them for it.
  _changed := (
    coalesce(_old.allergies, '')          IS DISTINCT FROM coalesce(nullif(btrim(coalesce(_allergies,'')),''), '')
    OR coalesce(_old.allergy_severity,'') IS DISTINCT FROM coalesce(_sev, '')
    OR coalesce(_old.medications, '')     IS DISTINCT FROM coalesce(nullif(btrim(coalesce(_medications,'')),''), '')
    OR coalesce(_old.medical_notes, '')   IS DISTINCT FROM coalesce(nullif(btrim(coalesce(_medical_notes,'')),''), '')
    OR coalesce(_old.special_needs, '')   IS DISTINCT FROM coalesce(nullif(btrim(coalesce(_special_needs,'')),''), '')
    OR _old.person_id IS NULL
  );

  IF NOT _changed THEN
    RETURN QUERY SELECT false, _old.allergy_label_short, false, NULL::DATE;
    RETURN;
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'A parent');
  _role := CASE WHEN church.has_permission_in_org(
                       _org, ARRAY['members_admin','kids_admin']::church.module_permission[])
                THEN 'staff' ELSE 'parent' END;

  -- The write. allergy_label_short is ALWAYS re-derived on a medical change,
  -- including over a label an admin typed by hand. A tag reading "PEANUT"
  -- when the parent has just told us it is now "peanut and dairy" is more
  -- dangerous than a slightly clumsy derived one, and the classroom reads the
  -- tag.
  INSERT INTO church.person_sensitive (
    person_id, organization_id, allergy_severity, allergies, allergy_label_short,
    medications, medical_notes, special_needs, special_needs_flag,
    updated_by, updated_by_name)
  VALUES (
    _child_person_id, _org, _sev,
    nullif(btrim(coalesce(_allergies, '')), ''), _label,
    nullif(btrim(coalesce(_medications, '')), ''),
    nullif(btrim(coalesce(_medical_notes, '')), ''),
    nullif(btrim(coalesce(_special_needs, '')), ''),
    nullif(btrim(coalesce(_special_needs, '')), '') IS NOT NULL,
    auth.uid(), _actor_name)
  ON CONFLICT (person_id) DO UPDATE SET
    allergy_severity    = EXCLUDED.allergy_severity,
    allergies           = EXCLUDED.allergies,
    allergy_label_short = EXCLUDED.allergy_label_short,
    medications         = EXCLUDED.medications,
    medical_notes       = EXCLUDED.medical_notes,
    special_needs       = EXCLUDED.special_needs,
    special_needs_flag  = EXCLUDED.special_needs_flag,
    updated_by          = EXCLUDED.updated_by,
    updated_by_name     = EXCLUDED.updated_by_name,
    updated_at          = now();

  INSERT INTO church.person_sensitive_history (
    organization_id, person_id, allergy_severity, allergies, medications,
    medical_notes, special_needs, special_needs_flag,
    changed_by, changed_by_name, changed_by_role)
  SELECT _org, _child_person_id, ps.allergy_severity, ps.allergies,
         ps.medications, ps.medical_notes, ps.special_needs,
         ps.special_needs_flag, auth.uid(), _actor_name, _role
  FROM church.person_sensitive ps WHERE ps.person_id = _child_person_id;

  INSERT INTO church.check_in_audit (
    organization_id, action, outcome, child_person_id,
    actor_auth_user_id, actor_name, detail)
  VALUES (_org, 'medical_updated', 'success', _child_person_id,
          auth.uid(), _actor_name,
          jsonb_build_object('by', _role,
                             'no_known_conditions', _no_known_conditions));

  -- --- The consent form goes out of date, four weeks from now -------------
  SELECT coalesce(pol.resign_grace_days, 28) INTO _grace
  FROM (SELECT 1) x
  LEFT JOIN church.kids_consent_policy pol ON pol.organization_id = _org;

  _due := (current_date + make_interval(days => _grace))::DATE;

  -- Only the live covering rows, and only those not already stale. That
  -- second condition is the whole debounce: a parent fixing a typo three
  -- times in an evening gets one prompt and ONE deadline, because the
  -- timestamp only ever moves away from NULL and re-signing is what puts it
  -- back. Without it, each edit would quietly extend the deadline, which
  -- would make the grace period unenforceable.
  UPDATE church.consent_children cc
     SET medical_changed_at = now(),
         resign_due_by = _due
    FROM church.consent_signatures s
   WHERE cc.consent_signature_id = s.id
     AND cc.child_person_id = _child_person_id
     AND cc.withdrawn_at IS NULL
     AND s.revoked_at IS NULL
     AND cc.medical_changed_at IS NULL;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  _stale := _rows > 0;

  IF NOT _stale THEN
    -- Either they never signed, or the form was already out of date. Either
    -- way there is no new deadline and nobody needs another email. Report the
    -- deadline already in force, if there is one, so the screen can show it.
    SELECT cc.resign_due_by INTO _due
    FROM church.consent_children cc
    JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
    WHERE cc.child_person_id = _child_person_id
      AND cc.withdrawn_at IS NULL AND s.revoked_at IS NULL
    ORDER BY s.signed_at DESC LIMIT 1;

    RETURN QUERY SELECT true, _label, false, _due;
    RETURN;
  END IF;

  -- The admins. NO MEDICAL DETAIL IN THE EMAIL. Naming a child's allergy here
  -- would put it permanently into seven personal mailboxes, outside every
  -- access control this system has, with no way to remove it when a parent
  -- changes their mind. They read it in the app, where the read is audited.
  INSERT INTO church.notification_log
    (organization_id, kind, channel, recipient_name, recipient_email,
     child_person_id, subject, body)
  SELECT _org, 'kids_medical_updated', 'email', t.full_name, t.email,
         _child_person_id,
         'A family has updated a child''s medical information',
         _actor_name || ' has updated the medical information we hold for '
         || coalesce(_child_name, 'a child') || '.' || E'\n\n'
         || 'The classroom label already shows the change, so nothing needs '
         || 'doing before Sunday. The details are on the child''s record in '
         || 'the app - we have deliberately left them out of this email.'
         || E'\n\n'
         || 'Their consent form was signed before the change, so we have '
         || 'asked the family to fill it in once more by '
         || to_char(_due, 'FMDay FMDD FMMonth') || '. They can be checked in '
         || 'as normal until then. If you see them on a Sunday before that, '
         || 'handing them a tablet for two minutes is the easiest way to '
         || 'close it.'
  FROM church.kids_leaders_to_notify(_org) t
  WHERE t.email IS NOT NULL;

  -- The parent. Warm, with the date stated plainly and the reason given.
  INSERT INTO church.notification_log
    (organization_id, kind, channel, recipient_name, recipient_email,
     child_person_id, subject, body)
  SELECT _org, 'kids_consent_resign_needed', 'email',
         coalesce(adult.preferred_name, adult.first_name) || ' ' || adult.last_name,
         adult.email, _child_person_id,
         'Your consent form for ' || coalesce(_child_name, 'your child'),
         'Thank you for telling us about the change to '
         || coalesce(_child_name, 'your child') || '''s medical information. '
         || 'Our classroom volunteers can see it already, from this morning '
         || 'onwards.' || E'\n\n'
         || 'The consent and medical release form you signed was filled in '
         || 'before that change, so the copy we hold no longer matches what '
         || 'you have told us. Filling it in once more puts the two back '
         || 'together. Everything you told us before will already be there, '
         || 'so it is mostly a matter of reading it through and signing.'
         || E'\n\n'
         || 'Please do that by ' || to_char(_due, 'FMDay FMDD FMMonth')
         || '. Until then nothing changes and your children can be checked '
         || 'in as normal. After that date we would have to ask you to do it '
         || 'at the desk before they go to a classroom, which we would much '
         || 'rather avoid on a Sunday morning.' || E'\n\n'
         || 'If it is easier, any of the Kids Ministry team will gladly sit '
         || 'down with you and a tablet for two minutes after a service.'
  FROM church.household_members child_hm
  JOIN church.household_members adult_hm
    ON adult_hm.household_id = child_hm.household_id
  JOIN church.people adult ON adult.id = adult_hm.person_id
  WHERE child_hm.person_id = _child_person_id
    AND child_hm.end_date IS NULL
    AND adult_hm.end_date IS NULL
    AND NOT adult.is_child
    AND adult.is_active
    AND adult.notify_by_email
    AND adult.email IS NOT NULL;

  -- Never let a notification failure roll back the medical record. A child
  -- leaving with the right allergy on their tag matters more than an email.
  BEGIN
    PERFORM church.nudge_kids_notification_sender();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'medical update: could not nudge the sender: %', SQLERRM;
  END;

  RETURN QUERY SELECT true, _label, true, _due;
END;
$$;

GRANT EXECUTE ON FUNCTION church.update_child_medical(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- Notification kinds and audit actions
-- ---------------------------------------------------------------------------
-- The constraint in force is chk_notification_kind - NOT the plural
-- chk_notification_log_kind, and not Postgres's default
-- notification_log_kind_check. Dropping the wrong name leaves the real one
-- standing, and the new kinds are then rejected at the first write rather
-- than at deploy, which is how this was found. Drop all three and recreate
-- under the name the four previous widenings have used.
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_kind;
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS notification_log_kind_check;
ALTER TABLE church.notification_log DROP CONSTRAINT IF EXISTS chk_notification_log_kind;
ALTER TABLE church.notification_log ADD CONSTRAINT chk_notification_kind
  CHECK (kind = ANY (ARRAY[
    'check_in', 'check_out', 'volunteer_message', 'kids_auto_expired',
    'kids_access_granted', 'kids_late_pickup', 'kids_check_in_held',
    'kids_hold_presented', 'kids_incident_raised', 'kids_incident_to_parent',
    -- new at 20260322210200
    'kids_medical_updated', 'kids_consent_resign_needed',
    'kids_consent_resign_reminder', 'kids_consent_resign_overdue']));

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
    'consent_reviewed',
    -- new at 20260322210200
    'medical_updated']));

-- ---------------------------------------------------------------------------
-- A SEVENTH STATE
-- ---------------------------------------------------------------------------
--
-- consent_out_of_date: they are named on a form that was signed, and the
-- medical information has changed since, and the four weeks have passed.
--
-- This is a real state and not a flag riding alongside, because after the
-- grace period it must be capable of refusing a child - which is precisely
-- what a state does and a flag does not. Before the deadline the child reads
-- as plain 'covered' and the deadline travels in resign_due_by, so a screen
-- can count down without the gate ever acting on it.
--
-- Adding output columns changes the signature, so DROP then CREATE.
DROP FUNCTION IF EXISTS church.child_consent_state(UUID, UUID);

CREATE FUNCTION church.child_consent_state(
  _child_person_id UUID,
  _for_household_id UUID DEFAULT NULL
)
RETURNS TABLE (
  state            TEXT,
  signature_id     UUID,
  signed_at        TIMESTAMPTZ,
  document_version INTEGER,
  medical_changed_at TIMESTAMPTZ,
  -- The date the family was told. Set whenever the form is out of date,
  -- whether or not the deadline has passed, so a screen can say either
  -- "please do this by the 3rd" or "this was due on the 3rd".
  resign_due_by    DATE
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
    RETURN QUERY SELECT 'no_household'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ,
                        NULL::INTEGER, NULL::TIMESTAMPTZ, NULL::DATE;
    RETURN;
  END IF;

  -- The whole predicate. Note what is NOT in it: superseded_by_signature_id.
  -- Superseding is presentational - which PDF the office shows as current -
  -- and it is not a withdrawal.
  SELECT s.id, s.signed_at, s.document_version, s.household_id,
         cc.medical_changed_at, cc.resign_due_by
    INTO _covering
  FROM church.consent_children cc
  JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
  WHERE cc.child_person_id = _child_person_id
    AND cc.withdrawn_at IS NULL
    AND s.revoked_at IS NULL
  -- The CURRENT form first, then the most recent.
  --
  -- superseded_by_signature_id is not in the WHERE clause and must not be:
  -- a child named only on a superseded form is still covered, because
  -- superseding is presentational and nobody withdrew anything. But when a
  -- child is on BOTH, the current one has to win, or a family who re-signed
  -- this morning goes on reading off the form they replaced - which, once
  -- staleness exists, means they stay consent_out_of_date forever.
  --
  -- signed_at alone is not enough to break that tie: now() is the
  -- TRANSACTION timestamp, so two signatures written in one transaction
  -- carry the same instant and ORDER BY picks arbitrarily. id is the final
  -- tiebreak so the answer is at least stable between two reads.
  ORDER BY (s.superseded_by_signature_id IS NULL) DESC, s.signed_at DESC, s.id DESC
  LIMIT 1;

  IF _covering.id IS NOT NULL THEN
    -- Out of date, and the four weeks are up.
    IF _covering.resign_due_by IS NOT NULL
       AND _covering.resign_due_by < current_date THEN
      RETURN QUERY SELECT 'consent_out_of_date'::TEXT, _covering.id,
                          _covering.signed_at, _covering.document_version,
                          _covering.medical_changed_at, _covering.resign_due_by;
      RETURN;
    END IF;

    -- Inside the grace period, or never stale: covered either way.
    RETURN QUERY SELECT
      CASE WHEN _for_household_id IS NULL
                OR _covering.household_id IS NOT DISTINCT FROM _for_household_id
           THEN 'covered' ELSE 'covered_elsewhere' END,
      _covering.id, _covering.signed_at, _covering.document_version,
      _covering.medical_changed_at, _covering.resign_due_by;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM church.household_members hm
    JOIN church.consent_signatures s ON s.household_id = hm.household_id
    WHERE hm.person_id = _child_person_id
      AND hm.end_date IS NULL
      AND s.revoked_at IS NULL
  ) THEN
    RETURN QUERY SELECT 'child_not_on_signature'::TEXT, NULL::UUID,
                        NULL::TIMESTAMPTZ, NULL::INTEGER, NULL::TIMESTAMPTZ, NULL::DATE;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM church.consent_children cc
    JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
    WHERE cc.child_person_id = _child_person_id
  ) THEN
    RETURN QUERY SELECT 'revoked'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ,
                        NULL::INTEGER, NULL::TIMESTAMPTZ, NULL::DATE;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'no_signature'::TEXT, NULL::UUID, NULL::TIMESTAMPTZ,
                      NULL::INTEGER, NULL::TIMESTAMPTZ, NULL::DATE;
END;
$$;

COMMENT ON FUNCTION church.child_consent_state(UUID, UUID) IS
  'Seven states. consent_out_of_date means the medical record changed after '
  'the form was signed and the grace period has passed. Inside the grace '
  'period the child reads as covered and resign_due_by carries the date.';

GRANT EXECUTE ON FUNCTION church.child_consent_state(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- The reminders nobody has to remember
-- ---------------------------------------------------------------------------
--
-- Run daily. One nudge a week before the deadline, one notice on the day it
-- passes. Each sends at most once per staleness, guarded by its own column,
-- so a sweep that runs twice or a day that is retried cannot post the same
-- letter twice.
--
-- A family that never hears from us again after the first email, and then
-- finds their child held at a desk, has been let down by the process rather
-- than by their own forgetfulness. This is the difference between a deadline
-- and an ambush.
CREATE OR REPLACE FUNCTION church.kids_consent_resign_sweep()
RETURNS TABLE (reminded INTEGER, overdue INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE _reminded INTEGER := 0; _overdue INTEGER := 0;
BEGIN
  -- A week to go.
  WITH due AS (
    SELECT cc.id, cc.child_person_id, cc.resign_due_by, s.organization_id
    FROM church.consent_children cc
    JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
    WHERE cc.medical_changed_at IS NOT NULL
      AND cc.withdrawn_at IS NULL
      AND s.revoked_at IS NULL
      AND cc.resign_reminded_at IS NULL
      AND cc.resign_due_by IS NOT NULL
      AND cc.resign_due_by <= current_date + 7
      AND cc.resign_due_by >= current_date
  ), sent AS (
    INSERT INTO church.notification_log
      (organization_id, kind, channel, recipient_name, recipient_email,
       child_person_id, subject, body)
    SELECT d.organization_id, 'kids_consent_resign_reminder', 'email',
           coalesce(adult.preferred_name, adult.first_name) || ' ' || adult.last_name,
           adult.email, d.child_person_id,
           'A short reminder about ' || coalesce(child.preferred_name, child.first_name)
             || '''s consent form',
           'A little while ago you updated the medical information we hold '
           || 'for ' || coalesce(child.preferred_name, child.first_name)
           || ', and we asked you to fill in the consent form once more so '
           || 'that our copy matches.' || E'\n\n'
           || 'That is due by ' || to_char(d.resign_due_by, 'FMDay FMDD FMMonth')
           || '. It should take two or three minutes, and everything you told '
           || 'us before is already filled in.' || E'\n\n'
           || 'If you would rather do it with somebody, any of the Kids '
           || 'Ministry team will sit down with you and a tablet after a '
           || 'service. We are glad to.'
    FROM due d
    JOIN church.people child ON child.id = d.child_person_id
    JOIN church.household_members child_hm
      ON child_hm.person_id = d.child_person_id AND child_hm.end_date IS NULL
    JOIN church.household_members adult_hm
      ON adult_hm.household_id = child_hm.household_id AND adult_hm.end_date IS NULL
    JOIN church.people adult ON adult.id = adult_hm.person_id
    WHERE NOT adult.is_child AND adult.is_active
      AND adult.notify_by_email AND adult.email IS NOT NULL
    RETURNING 1
  ), marked AS (
    UPDATE church.consent_children cc SET resign_reminded_at = now()
    WHERE cc.id IN (SELECT id FROM due) RETURNING 1
  )
  SELECT count(*)::INTEGER INTO _reminded FROM marked;

  -- The day it passes.
  WITH past AS (
    SELECT cc.id, cc.child_person_id, cc.resign_due_by, s.organization_id
    FROM church.consent_children cc
    JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
    WHERE cc.medical_changed_at IS NOT NULL
      AND cc.withdrawn_at IS NULL
      AND s.revoked_at IS NULL
      AND cc.resign_overdue_notified_at IS NULL
      AND cc.resign_due_by IS NOT NULL
      AND cc.resign_due_by < current_date
  ), sent AS (
    INSERT INTO church.notification_log
      (organization_id, kind, channel, recipient_name, recipient_email,
       child_person_id, subject, body)
    SELECT p.organization_id, 'kids_consent_resign_overdue', 'email',
           coalesce(adult.preferred_name, adult.first_name) || ' ' || adult.last_name,
           adult.email, p.child_person_id,
           'We still need the consent form for '
             || coalesce(child.preferred_name, child.first_name),
           'We are still holding a consent form for '
           || coalesce(child.preferred_name, child.first_name)
           || ' that was signed before you told us about their medical '
           || 'information, so the two no longer match.' || E'\n\n'
           || 'This is not a complaint and nothing has gone wrong. It does '
           || 'mean that when you next bring '
           || coalesce(child.preferred_name, child.first_name)
           || ' to a classroom, one of our team will ask you to fill the form '
           || 'in at the desk first. It takes two or three minutes and '
           || 'everything is already filled in - but a Sunday morning is not '
           || 'the easiest moment for it, which is why we would rather you '
           || 'did it before then if you can.' || E'\n\n'
           || 'You can do it at any time in My Church, or tell any of the '
           || 'Kids Ministry team and we will help you with it.'
    FROM past p
    JOIN church.people child ON child.id = p.child_person_id
    JOIN church.household_members child_hm
      ON child_hm.person_id = p.child_person_id AND child_hm.end_date IS NULL
    JOIN church.household_members adult_hm
      ON adult_hm.household_id = child_hm.household_id AND adult_hm.end_date IS NULL
    JOIN church.people adult ON adult.id = adult_hm.person_id
    WHERE NOT adult.is_child AND adult.is_active
      AND adult.notify_by_email AND adult.email IS NOT NULL
    RETURNING 1
  ), marked AS (
    UPDATE church.consent_children cc SET resign_overdue_notified_at = now()
    WHERE cc.id IN (SELECT id FROM past) RETURNING 1
  )
  SELECT count(*)::INTEGER INTO _overdue FROM marked;

  IF _reminded > 0 OR _overdue > 0 THEN
    BEGIN
      PERFORM church.nudge_kids_notification_sender();
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'consent resign sweep: could not nudge the sender: %', SQLERRM;
    END;
  END IF;

  RETURN QUERY SELECT _reminded, _overdue;
END;
$$;

REVOKE ALL ON FUNCTION church.kids_consent_resign_sweep() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.kids_consent_resign_sweep() TO service_role;

-- 13:00 UTC is 9am Eastern, which is a kinder hour for a letter about a
-- child's medical record than the small ones the other jobs run in.
SELECT cron.unschedule('kids-consent-resign-sweep')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kids-consent-resign-sweep');

SELECT cron.schedule('kids-consent-resign-sweep', '0 13 * * *',
                     'SELECT church.kids_consent_resign_sweep()');

-- ---------------------------------------------------------------------------
-- Families whose form has gone out of date
-- ---------------------------------------------------------------------------
--
-- The admin's follow-up list, ordered by whoever has least time left. Most of
-- it is a list of conversations to have on a Sunday, not a list of problems.
CREATE OR REPLACE FUNCTION church.kids_consent_needs_resigning(_organization_id UUID)
RETURNS TABLE (
  child_person_id UUID,
  child_name      TEXT,
  household_id    UUID,
  signature_id    UUID,
  signed_at       TIMESTAMPTZ,
  medical_changed_at TIMESTAMPTZ,
  resign_due_by   DATE,
  days_left       INTEGER,
  is_overdue      BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
           _organization_id,
           ARRAY['kids_admin','kids_leader']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT cc.child_person_id,
         coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
         s.household_id, s.id, s.signed_at, cc.medical_changed_at,
         cc.resign_due_by,
         (cc.resign_due_by - current_date)::INTEGER,
         (cc.resign_due_by < current_date)
  FROM church.consent_children cc
  JOIN church.consent_signatures s ON s.id = cc.consent_signature_id
  JOIN church.people p ON p.id = cc.child_person_id
  WHERE s.organization_id = _organization_id
    AND cc.medical_changed_at IS NOT NULL
    AND cc.withdrawn_at IS NULL
    AND s.revoked_at IS NULL
  ORDER BY cc.resign_due_by NULLS LAST, cc.medical_changed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_consent_needs_resigning(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
