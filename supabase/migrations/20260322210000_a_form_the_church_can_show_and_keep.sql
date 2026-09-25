-- =====================================================
-- A form the church can show and keep
-- =====================================================
--
-- The ministry's paper Parent/Guardian Consent, Medical Release & Safety
-- Acknowledgment form, stored as a versioned, hashed document so that a
-- signature can say WHICH WORDS were agreed to.
--
-- WHY THE TEXT LIVES IN THE DATABASE AND NOT IN A TSX FILE.
-- A signature is only meaningful if you can say what was agreed. If the copy
-- lives in the front-end bundle, a routine redeploy silently changes it, and
-- a PDF regenerated in 2028 shows 2028's words over a 2026 signature. Here the
-- words are a row, the row is hashed, and every signature freezes the version
-- and the hash alongside it.
--
-- E-SIGNATURE EVIDENCE. Maryland UETA and federal E-SIGN need four things:
-- intent to sign, agreement to transact electronically, association of the
-- signature with the record, and retention in a reproducible form. This
-- migration provides the third: body_sha256 is how you prove, later and to
-- somebody who doubts you, exactly which document a parent signed. Do not
-- "simplify away" the hash - it is the load-bearing part.
--
-- THE HASH IS OVER A CANONICAL SERIALISATION, NEVER body::text. jsonb does
-- not preserve key order or whitespace, so body::text is not stable across a
-- dump/restore, a Postgres upgrade, or two writes of the same content. A hash
-- that changes on its own is worse than no hash: it turns every stored
-- signature into an apparent mismatch.
--
-- ONE SURFACE, TWO PLACES. Each section carries `surface`, which is what lets
-- a single document drive both the short kiosk form and the full portal form
-- without two copies drifting apart. The kiosk shows what a parent can
-- reasonably complete standing at a queue; the portal shows all of it.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church.consent_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- 'kids_parent_consent' today. A code rather than a hardcoded assumption
  -- so a second form (a camp waiver, say) does not need a second table.
  code             TEXT NOT NULL,
  version          INTEGER NOT NULL,
  title            TEXT NOT NULL,

  -- An ordered array of sections. See the seed below for the shape.
  body             JSONB NOT NULL,
  body_sha256      TEXT NOT NULL,

  -- The option keys that must be ticked for a signature to be accepted. Held
  -- on the document, not in code, so that adding a required acknowledgment to
  -- version 2 does not retroactively invalidate every version 1 signature.
  required_acknowledgments TEXT[] NOT NULL DEFAULT '{}',

  effective_from   DATE NOT NULL,
  retired_at       TIMESTAMPTZ,

  published_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by_name TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_consent_document_version UNIQUE (organization_id, code, version),
  CONSTRAINT chk_consent_document_version CHECK (version >= 1),
  CONSTRAINT chk_consent_document_body_is_array CHECK (jsonb_typeof(body) = 'array'),
  CONSTRAINT chk_consent_document_body_not_empty CHECK (jsonb_array_length(body) > 0),
  CONSTRAINT chk_consent_document_sha CHECK (body_sha256 ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE church.consent_documents IS
  'The words a parent agreed to, versioned and hashed. A signature freezes '
  'version and body_sha256, which is how the church can prove later which '
  'document was signed. The text lives here rather than in the front-end '
  'bundle so a redeploy cannot silently change what a stored signature means.';

COMMENT ON COLUMN church.consent_documents.body_sha256 IS
  'sha256 of church.consent_document_digest(body) - a CANONICAL serialisation, '
  'never body::text. jsonb does not preserve key order, so a hash over the '
  'raw text would be unstable and every signature would look like a mismatch.';

COMMENT ON COLUMN church.consent_documents.required_acknowledgments IS
  'Option keys that must be ticked for a signature to be accepted. Held per '
  'version so that tightening version 2 does not invalidate version 1.';

-- Exactly one live document per code per branch. Publishing v2 retires v1 in
-- the same transaction, so "which form is current" can never be ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consent_document_current
  ON church.consent_documents (organization_id, code)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_consent_documents_lookup
  ON church.consent_documents (organization_id, code, version DESC);

-- ---------------------------------------------------------------------------
-- The canonical serialisation
-- ---------------------------------------------------------------------------
--
-- Sections in array order; within a section, a fixed field order; options in
-- array order. Four distinct control characters, one per nesting level:
--
--   \x1c  between sections
--   \x1f  between the fields of one section
--   \x1d  between options
--   \x1e  between the fields of one option
--
-- Four and not two, because reusing a delimiter across two levels is what
-- lets one document be serialised identically to a different one. None of
-- them can occur in form text, so no section can be crafted to collide with
-- another by containing a delimiter.
--
-- NULL and absent are deliberately serialised identically (as the empty
-- string). A section written with "text": null and one written without a
-- "text" key at all are the same document to a reader, and they must be the
-- same document to the hash.
CREATE OR REPLACE FUNCTION church.consent_document_digest(_body JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = church, public, extensions
AS $$
  SELECT string_agg(
           concat_ws(
             chr(31),
             coalesce(s->>'key', ''),
             coalesce(s->>'heading', ''),
             coalesce(s->>'kind', ''),
             coalesce(s->>'surface', ''),
             coalesce(s->>'text', ''),
             coalesce((
               SELECT string_agg(
                        concat_ws(chr(30),
                                  coalesce(o->>'key', ''),
                                  coalesce(o->>'text', '')),
                        chr(29) ORDER BY o_ord)
               -- jsonb_typeof, not coalesce: a section written with
               -- "options": null holds a JSON null, which coalesce does not
               -- catch and jsonb_array_elements raises on. Absent, null and
               -- [] are the same document to a reader, so they must be the
               -- same string here - and the function must not throw on any
               -- of them.
               FROM jsonb_array_elements(
                      CASE WHEN jsonb_typeof(s->'options') = 'array'
                           THEN s->'options' ELSE '[]'::jsonb END)
                    WITH ORDINALITY AS t(o, o_ord)
             ), '')
           ),
           chr(28) ORDER BY s_ord)
  FROM jsonb_array_elements(_body) WITH ORDINALITY AS t(s, s_ord)
$$;

COMMENT ON FUNCTION church.consent_document_digest(JSONB) IS
  'Canonical serialisation of a consent document body, for hashing. Sections '
  'and options in array order, fixed field order, control-character '
  'delimiters. IMMUTABLE and deliberately boring: if this function ever '
  'changes, every stored body_sha256 stops verifying.';

CREATE OR REPLACE FUNCTION church.consent_document_sha256(_body JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = church, public, extensions
AS $$
  SELECT encode(
           extensions.digest(
             convert_to(coalesce(church.consent_document_digest(_body), ''), 'UTF8'),
             'sha256'),
           'hex')
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- The document is the form the church hands to every parent. There is nothing
-- confidential in it and a parent must be able to read what they are signing,
-- so SELECT is open to any authenticated member of the branch rather than to
-- a module grant.
--
-- The kiosk is the exception that shapes this: it holds NO module grant at
-- all (deliberately - a grant would lift the profiles RLS restriction and
-- hand a lobby tablet the church's user list), so a grant-keyed policy would
-- return it zero rows. It reads through church.current_consent_document(),
-- which is SECURITY DEFINER.
ALTER TABLE church.consent_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read the consent form" ON church.consent_documents;
CREATE POLICY "Members can read the consent form"
  ON church.consent_documents FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()
  ));

-- No INSERT, UPDATE or DELETE policy for anyone. Publishing goes through the
-- definer RPC below, which is what keeps version, hash and retirement
-- consistent with one another.
GRANT SELECT ON church.consent_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.consent_documents TO service_role;

-- ---------------------------------------------------------------------------
-- Publishing a version
-- ---------------------------------------------------------------------------
--
-- Gated on kids_admin specifically, NOT on assert_kids_leader: that helper
-- admits leadership_viewer, a read-only reporting role, and changing the
-- wording of a legal consent is not a reporting action.
CREATE OR REPLACE FUNCTION church.publish_consent_document(
  _organization_id UUID,
  _code            TEXT,
  _title           TEXT,
  _body            JSONB,
  _required_acknowledgments TEXT[] DEFAULT '{}',
  _effective_from  DATE DEFAULT NULL
)
RETURNS TABLE (
  document_id UUID,
  version     INTEGER,
  body_sha256 TEXT,
  retired_version INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _actor_name TEXT;
  _next       INTEGER;
  _retired    INTEGER;
  _sha        TEXT;
  _id         UUID;
  _missing    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT church.has_permission_in_org(
           _organization_id, ARRAY['kids_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501',
      HINT = 'Publishing a consent form is a Kids Ministry admin action.';
  END IF;

  IF jsonb_typeof(_body) <> 'array' OR jsonb_array_length(_body) = 0 THEN
    RAISE EXCEPTION 'body_must_be_a_non_empty_array';
  END IF;

  -- Every section needs a key, because the key is what a signature's answers
  -- are filed under and what the PDF renderer looks sections up by. A section
  -- with no key is a section nothing can ever refer to.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_body) s
     WHERE jsonb_typeof(s) <> 'object'
  ) THEN
    RAISE EXCEPTION 'every_section_must_be_an_object';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_body) s
     WHERE coalesce(btrim(s->>'key'), '') = ''
        OR coalesce(btrim(s->>'heading'), '') = ''
        OR coalesce(btrim(s->>'kind'), '') = ''
  ) THEN
    RAISE EXCEPTION 'every_section_needs_key_heading_and_kind';
  END IF;

  -- An options list that is not a list is a section whose choices nothing can
  -- render and nothing can tick.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_body) s
     WHERE s ? 'options'
       AND jsonb_typeof(s->'options') NOT IN ('array', 'null')
  ) THEN
    RAISE EXCEPTION 'options_must_be_an_array';
  END IF;

  IF EXISTS (
    SELECT s->>'key' FROM jsonb_array_elements(_body) s
     GROUP BY s->>'key' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'section_keys_must_be_unique';
  END IF;

  -- A required acknowledgment that names an option this document does not
  -- contain can never be ticked, so every signature would be refused with no
  -- way for a parent to tell why. Catch it at publish time, where somebody is
  -- watching, rather than on a Sunday morning at a queue.
  SELECT r INTO _missing
  FROM unnest(coalesce(_required_acknowledgments, '{}')) AS r
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_body) s,
         jsonb_array_elements(coalesce(s->'options', '[]'::jsonb)) o
    WHERE o->>'key' = r
  )
  LIMIT 1;

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'required_acknowledgment_not_in_body: %', _missing
      USING HINT = 'Every required key must match an option key in the body.';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Kids Ministry');

  _sha := church.consent_document_sha256(_body);

  SELECT coalesce(max(d.version), 0) + 1 INTO _next
  FROM church.consent_documents d
  WHERE d.organization_id = _organization_id AND d.code = _code;

  -- Retire the current one in the same transaction as publishing the new one,
  -- so the partial unique index can never see two live versions.
  UPDATE church.consent_documents d
     SET retired_at = now()
   WHERE d.organization_id = _organization_id
     AND d.code = _code
     AND d.retired_at IS NULL
  RETURNING d.version INTO _retired;

  INSERT INTO church.consent_documents (
    organization_id, code, version, title, body, body_sha256,
    required_acknowledgments, effective_from, published_by, published_by_name)
  VALUES (
    _organization_id, _code, _next, _title, _body, _sha,
    coalesce(_required_acknowledgments, '{}'),
    coalesce(_effective_from, current_date), auth.uid(), _actor_name)
  RETURNING id INTO _id;

  RETURN QUERY SELECT _id, _next, _sha, _retired;
END;
$$;

GRANT EXECUTE ON FUNCTION church.publish_consent_document(
  UUID, TEXT, TEXT, JSONB, TEXT[], DATE) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reading the current form
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER because the kiosk holds no module grant and no RLS-visible
-- path to this table. _surface filters the sections: 'kiosk' returns what a
-- parent can complete standing at a queue, 'portal' returns the lot. The
-- version and hash returned are always those of the WHOLE document, never of
-- the filtered subset - a parent who signs at the kiosk is agreeing to the
-- whole form, and the PDF prints all of it.
CREATE OR REPLACE FUNCTION church.current_consent_document(
  _organization_id UUID,
  _code            TEXT DEFAULT 'kids_parent_consent',
  _surface         TEXT DEFAULT 'portal'
)
RETURNS TABLE (
  document_id UUID,
  code        TEXT,
  version     INTEGER,
  title       TEXT,
  body        JSONB,
  body_sha256 TEXT,
  required_acknowledgments TEXT[],
  effective_from DATE
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF _surface NOT IN ('kiosk', 'portal') THEN
    RAISE EXCEPTION 'surface_must_be_kiosk_or_portal';
  END IF;

  RETURN QUERY
  SELECT d.id, d.code, d.version, d.title,
         CASE WHEN _surface = 'portal' THEN d.body
              ELSE coalesce((
                SELECT jsonb_agg(s ORDER BY s_ord)
                FROM jsonb_array_elements(d.body) WITH ORDINALITY AS t(s, s_ord)
                WHERE coalesce(s->>'surface', 'both') IN ('both', _surface)
              ), '[]'::jsonb)
         END,
         -- The hash of the whole document, not of the filtered subset.
         d.body_sha256,
         d.required_acknowledgments,
         d.effective_from
  FROM church.consent_documents d
  WHERE d.organization_id = _organization_id
    AND d.code = _code
    AND d.retired_at IS NULL
    AND d.effective_from <= current_date;
END;
$$;

GRANT EXECUTE ON FUNCTION church.current_consent_document(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: ALIC's form, version 1
-- ---------------------------------------------------------------------------
--
-- Transcribed from the ministry's paper form
-- (ALIC_Parent_Guardian_Consent_Form_UPDATED.pdf). The wording of sections
-- 2-10 is the church's, reproduced rather than rewritten, with exactly two
-- deliberate departures, both recorded here so nobody later mistakes them for
-- a transcription error:
--
--   1. SECTION 9 GAINS A CHOICE. On paper, section 9 is an acknowledgment
--      only - it tells a parent that photographs are taken and gives them
--      nowhere to object. The database has had a per-child photo_consent
--      column all along, so the electronic form asks. A parent who says no on
--      paper today has to find somebody to tell; here they tick a box.
--
--      The trap this creates, for whoever builds the signing screen: the
--      app's can_view_photos_of() treats photo_consent = false as hiding the
--      photo from EVERYONE, including the parent who uploaded it. So a "no"
--      must never be applied silently, and never as a household-wide answer
--      to a per-child column. Ask per child and say on screen what it does.
--
--   2. SECTION 10 GAINS A DATA-HANDLING PARAGRAPH. The paper form does not
--      tell a parent where the information goes. Without that sentence the
--      electronic version would be WEAKER than the paper one it replaces,
--      which is the opposite of the point. It names who can see the form,
--      says a copy is emailed to the signer, and says how to withdraw.
--
-- The seed is idempotent: it publishes only if this branch has no
-- kids_parent_consent document yet, so a re-run cannot create a spurious
-- version 2 whose only difference is that somebody ran the migration twice.
DO $seed$
DECLARE
  _org  UUID;
  _body JSONB;
  _req  TEXT[];
BEGIN
  _body := $json$[
    {
      "key": "child_information",
      "heading": "1. Child / Youth Information",
      "kind": "children",
      "surface": "both",
      "text": "This form covers the children and youth named below. For each one the church holds full name, date of birth, grade and age, together with the parent or guardian's name and primary phone, and an emergency contact with their relationship and phone number."
    },
    {
      "key": "participation",
      "heading": "2. Participation Consent",
      "kind": "acknowledgments",
      "surface": "both",
      "text": "I give permission for the child/youth named above to participate in ALIC Church Children's Ministry and/or Youth Ministry programs and activities. I understand that ALIC safety policies apply to regular services, special events, retreats, camps, service projects, mission trips, off-site activities, and church-arranged transportation, as applicable.",
      "options": [
        {
          "key": "participation_consent",
          "text": "I give permission for my child/youth to participate in ALIC Church Children's Ministry and/or Youth Ministry programs and activities."
        }
      ]
    },
    {
      "key": "safety_acknowledgment",
      "heading": "3. Safety, Supervision & Release Acknowledgment",
      "kind": "acknowledgments",
      "surface": "both",
      "text": "Please confirm each of the following.",
      "options": [
        {
          "key": "safety_remain_on_premises",
          "text": "I understand that parents/guardians are expected to remain on church premises while a child is participating in regular Children's Ministry programs unless a specific event provides otherwise."
        },
        {
          "key": "safety_checkout_procedure",
          "text": "I understand that children are released only through ALIC's established check-out procedure to an authorized person, normally using the matching security tag. If a tag is lost, identification and an authorization form may be required."
        },
        {
          "key": "safety_supervision_window",
          "text": "I understand that Youth Ministry supervision applies during the scheduled ministry program or event and responsibility returns to the parent/guardian upon dismissal."
        },
        {
          "key": "safety_reachable",
          "text": "I agree to remain reachable and to respond promptly if ALIC contacts or pages me because of an urgent, medical, behavioral, or safety need."
        }
      ]
    },
    {
      "key": "health_information",
      "heading": "4. Health, Allergies & Medical Information",
      "kind": "fields",
      "surface": "both",
      "text": "Allergies (food, medication, environmental); medical conditions or special medical needs; and any medications or emergency medication the ministry should know about.",
      "options": [
        {
          "key": "health_none_known",
          "text": "My child/youth has NO known allergies, medical conditions, or emergency medication needs."
        },
        {
          "key": "health_condition_known",
          "text": "My child/youth has a known medical condition or emergency medication need, and I will complete any additional medical waiver or plan required by ALIC."
        }
      ]
    },
    {
      "key": "sick_policy",
      "heading": "4a. Sick Policy and Medication",
      "kind": "acknowledgments",
      "surface": "portal",
      "text": "Sick Policy: I agree not to bring my child when the child has had fever, diarrhea, or vomiting within the previous 24 hours, and I understand the child should be symptom-free for at least 24 hours without medication before returning. I will promptly pick up my child if illness symptoms develop during ministry activities. Medication: I understand that ALIC volunteers generally do not administer medication. EPI pen administration is only allowed in rare, approved cases, with parent-provided training and required waiver/approval.",
      "options": [
        {
          "key": "sick_policy_understood",
          "text": "I have read and agree to the sick policy and the medication policy."
        }
      ]
    },
    {
      "key": "emergency_medical",
      "heading": "5. Emergency Medical Authorization",
      "kind": "acknowledgments",
      "surface": "both",
      "text": "If I cannot be reached in an emergency, I authorize ALIC Church leaders and designated volunteers to take reasonable actions necessary to protect my child/youth, including contacting 911 or emergency medical services. I understand that ALIC volunteers are not medical providers and do not provide clinical, therapeutic, behavioral health, or special education services.",
      "options": [
        {
          "key": "emergency_medical_authorization",
          "text": "If I cannot be reached in an emergency, I authorize ALIC Church leaders and designated volunteers to take reasonable actions necessary to protect my child/youth, including contacting 911 or emergency medical services."
        }
      ]
    },
    {
      "key": "physician_insurance",
      "heading": "5a. Preferred Physician and Insurance (optional)",
      "kind": "fields",
      "surface": "portal",
      "text": "Preferred physician or practice, and insurance company or policy information. Both are optional."
    },
    {
      "key": "snack",
      "heading": "6. Snack / Allergy Acknowledgment",
      "kind": "choice",
      "surface": "both",
      "text": "I understand that ALIC Children's Ministry may occasionally provide approved snacks such as water, plain crackers, and lollipops for K-5th grade. ALIC strives to maintain a nut-free environment but cannot guarantee a completely nut-free environment because of shared facilities and external food sources.",
      "options": [
        {
          "key": "snack_authorized",
          "text": "I authorize my child to receive approved ministry snacks, subject to the allergy information I provided above."
        },
        {
          "key": "snack_declined",
          "text": "I do NOT authorize ministry snacks for my child."
        }
      ]
    },
    {
      "key": "special_support",
      "heading": "7. Disability / Special Support Needs",
      "kind": "choice",
      "surface": "both",
      "text": "I understand accommodations are considered individually based on safety, available volunteers, facility limitations, training, and ministry resources. ALIC may request parent/guardian or family-provided aide participation when continuous individualized support is beyond available volunteer capacity.",
      "options": [
        {
          "key": "support_none_required",
          "text": "My child/youth does not currently require special accommodations."
        },
        {
          "key": "support_may_be_required",
          "text": "My child/youth may require accommodations or additional support. I will discuss relevant needs, triggers, communication methods, safety concerns, or support strategies with ministry leadership."
        }
      ]
    },
    {
      "key": "off_site",
      "heading": "8. Off-Site Events & Church-Sponsored Transportation",
      "kind": "choice",
      "surface": "both",
      "text": "I understand that church-sponsored transportation is to be provided by approved drivers authorized by church leadership. ALIC does not supervise transportation arrangements independently made by parents, participants, or third parties outside official church-sponsored transportation.",
      "options": [
        {
          "key": "off_site_permitted",
          "text": "I give permission for my child/youth to participate in ALIC-approved off-site events and church-sponsored transportation when event details are provided to me."
        },
        {
          "key": "off_site_declined",
          "text": "I do NOT give blanket permission for off-site events/transportation and understand a separate written permission may be requested for a specific event."
        }
      ]
    },
    {
      "key": "photo_video",
      "heading": "9. Photo / Video Acknowledgment",
      "kind": "choice",
      "surface": "both",
      "text": "I understand and acknowledge that ALIC Church may take photographs and video recordings during church services, Children's & Youth Ministry activities, special events, programs, camps, and other church-sponsored activities. These photographs or recordings may include my child/youth as part of a group, congregation, class, ministry activity, or event and may be used by ALIC Church for ministry communications, its website, social media platforms, newsletters, promotional materials, and other church-related purposes. I understand that ALIC will use reasonable care when selecting photographs and videos involving children and youth. Please answer for each child.",
      "options": [
        {
          "key": "photo_permitted",
          "text": "ALIC may use photographs and video that include this child, as described above."
        },
        {
          "key": "photo_declined",
          "text": "Please do not use photographs or video of this child in church communications."
        }
      ]
    },
    {
      "key": "acknowledgment",
      "heading": "10. Parent / Guardian Acknowledgment",
      "kind": "signature",
      "surface": "both",
      "text": "By signing below, I acknowledge that I have received or had access to ALIC Church's Children's & Youth Ministry Safety and Security Policies and Procedures, understand the parent/guardian responsibilities described in this form, and agree to provide accurate and updated emergency, medical, allergy, and support information. I understand that ministry activities involve ordinary risks and that ALIC will use its safety policies and reasonable precautions to protect participants. Continuing Responsibility for Changes: I understand that it is my responsibility to promptly notify ALIC Church of any changes to the information provided on this form, including emergency contact information, authorized pickup persons, allergies, medical conditions, medications, special support needs, or any other information that may affect my child's health, safety, or participation. This consent will remain in effect unless I notify ALIC Church in writing of a change or withdrawal of consent.",
      "options": [
        {
          "key": "parent_acknowledgment",
          "text": "I have read this form, the information I have given is accurate, and I agree to it on behalf of the children named above."
        }
      ]
    },
    {
      "key": "data_handling",
      "heading": "How the church holds this information",
      "kind": "statement",
      "surface": "both",
      "text": "What you write here is held by ALIC Church and read by the Kids Ministry leaders and the church office. Your child's allergy information is printed on their classroom label so the volunteers caring for them can see it. A copy of this completed form is emailed to you when you sign it, and you may ask the church office for another copy at any time. If you want to change an answer or withdraw your consent, tell any of the Kids Ministry team or write to the church office, and we will act on it."
    }
  ]$json$::jsonb;

  -- What a signature must carry to be accepted. The four section 3 items are
  -- listed individually and deliberately: one combined tick is one thing to
  -- deny afterwards, four are four. The emergency medical authorisation is
  -- here because it is the single most important clause on the form - the one
  -- that matters at the moment nobody has time to read anything.
  --
  -- Section 4's "no known allergies" is NOT required. A form that silently
  -- asserts a negative because nobody asked is worse than no form.
  _req := ARRAY[
    'participation_consent',
    'safety_remain_on_premises',
    'safety_checkout_procedure',
    'safety_supervision_window',
    'safety_reachable',
    'emergency_medical_authorization',
    'parent_acknowledgment'
  ];

  FOR _org IN
    SELECT id FROM public.organizations
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM church.consent_documents d
      WHERE d.organization_id = _org AND d.code = 'kids_parent_consent');

    INSERT INTO church.consent_documents (
      organization_id, code, version, title, body, body_sha256,
      required_acknowledgments, effective_from, published_by_name)
    VALUES (
      _org, 'kids_parent_consent', 1,
      'Parent / Guardian Consent, Medical Release & Safety Acknowledgment',
      _body, church.consent_document_sha256(_body),
      _req, current_date, 'ALIC Kids Ministry');
  END LOOP;
END;
$seed$;

NOTIFY pgrst, 'reload schema';
