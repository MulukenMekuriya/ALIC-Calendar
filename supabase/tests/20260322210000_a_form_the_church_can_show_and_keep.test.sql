-- Assertions for 20260322210000. Appended after the migration inside one
-- BEGIN/ROLLBACK. Every block RAISEs 'FAIL: ...' on a violated expectation.

DO $a$
DECLARE
  _md  UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _va  UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  _n   INT;
  _sha1 TEXT; _sha2 TEXT;
  _body JSONB; _reordered JSONB; _changed JSONB;
BEGIN
  -- 1. The seed published exactly one version-1 document per org.
  SELECT count(*) INTO _n FROM church.consent_documents
   WHERE code = 'kids_parent_consent';
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 1: expected 2 seeded documents, got %', _n; END IF;

  SELECT count(*) INTO _n FROM church.consent_documents
   WHERE code = 'kids_parent_consent' AND version = 1 AND retired_at IS NULL
     AND organization_id IN (_md, _va);
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL 1b: both orgs should have a live v1, got %', _n; END IF;

  -- 2. The document has all 13 sections and the 7 required acknowledgments.
  SELECT body INTO _body FROM church.consent_documents
   WHERE organization_id = _md AND code = 'kids_parent_consent';
  IF jsonb_array_length(_body) <> 13 THEN
    RAISE EXCEPTION 'FAIL 2: expected 13 sections, got %', jsonb_array_length(_body);
  END IF;

  SELECT array_length(required_acknowledgments, 1) INTO _n
    FROM church.consent_documents WHERE organization_id = _md AND code='kids_parent_consent';
  IF _n <> 7 THEN RAISE EXCEPTION 'FAIL 2b: expected 7 required acks, got %', _n; END IF;

  -- 3. The hash is stable: computing it twice gives the same answer.
  _sha1 := church.consent_document_sha256(_body);
  _sha2 := church.consent_document_sha256(_body);
  IF _sha1 <> _sha2 THEN RAISE EXCEPTION 'FAIL 3: hash is not stable'; END IF;
  IF _sha1 <> (SELECT body_sha256 FROM church.consent_documents
                WHERE organization_id = _md AND code='kids_parent_consent') THEN
    RAISE EXCEPTION 'FAIL 3b: stored hash does not match a recomputation';
  END IF;

  -- 4. THE POINT OF THE CANONICAL SERIALISATION. Rewriting a section object
  --    with its keys in a different order is the SAME document and must hash
  --    the same. A hash over body::text would fail this.
  _reordered := (
    SELECT jsonb_agg(
             jsonb_build_object('text', s->'text', 'kind', s->'kind',
                                'options', s->'options', 'surface', s->'surface',
                                'heading', s->'heading', 'key', s->'key')
             ORDER BY o)
    FROM jsonb_array_elements(_body) WITH ORDINALITY AS t(s, o));
  IF church.consent_document_sha256(_reordered) <> _sha1 THEN
    RAISE EXCEPTION 'FAIL 4: key order changed the hash - canonicalisation is broken';
  END IF;
  IF _reordered::TEXT = _body::TEXT THEN
    RAISE EXCEPTION 'FAIL 4b: the reordering was a no-op, so test 4 proved nothing';
  END IF;

  -- 5. Changing one character of the form text DOES change the hash.
  _changed := jsonb_set(_body, '{5,text}',
                to_jsonb((_body->5->>'text') || ' '));
  IF church.consent_document_sha256(_changed) = _sha1 THEN
    RAISE EXCEPTION 'FAIL 5: editing the text did not change the hash';
  END IF;

  -- 6. Reordering the SECTIONS changes the hash - order is part of the
  --    document, because a form read out of order is a different form.
  _changed := (SELECT jsonb_agg(s ORDER BY o DESC)
               FROM jsonb_array_elements(_body) WITH ORDINALITY AS t(s, o));
  IF church.consent_document_sha256(_changed) = _sha1 THEN
    RAISE EXCEPTION 'FAIL 6: section order did not affect the hash';
  END IF;

  -- 6b. Absent, JSON-null and empty options are the same document to a
  --     reader, so they must be the same string to the hash - and none of
  --     them may make the digest throw. This is what the first run of these
  --     assertions caught: coalesce() does not catch a JSON null, and
  --     jsonb_array_elements() raises on a scalar.
  IF church.consent_document_sha256('[{"key":"a","heading":"A","kind":"statement","text":"t"}]'::jsonb)
     <> church.consent_document_sha256('[{"key":"a","heading":"A","kind":"statement","text":"t","options":null}]'::jsonb)
  THEN RAISE EXCEPTION 'FAIL 6b: absent options and null options hash differently'; END IF;

  IF church.consent_document_sha256('[{"key":"a","heading":"A","kind":"statement","text":"t"}]'::jsonb)
     <> church.consent_document_sha256('[{"key":"a","heading":"A","kind":"statement","text":"t","options":[]}]'::jsonb)
  THEN RAISE EXCEPTION 'FAIL 6c: absent options and [] hash differently'; END IF;

  -- Same for a null text against an absent one.
  IF church.consent_document_sha256('[{"key":"a","heading":"A","kind":"statement"}]'::jsonb)
     <> church.consent_document_sha256('[{"key":"a","heading":"A","kind":"statement","text":null}]'::jsonb)
  THEN RAISE EXCEPTION 'FAIL 6d: absent text and null text hash differently'; END IF;

  -- 6e. A delimiter smuggled into an option's text does not let two different
  --     option lists serialise to the same string. Built with chr() rather
  --     than a \u escape because a raw control character is not valid JSON.
  IF church.consent_document_sha256(jsonb_build_array(jsonb_build_object(
       'key','a','heading','A','kind','c','options', jsonb_build_array(
         jsonb_build_object('key','x','text','1'),
         jsonb_build_object('key','y','text','2')))))
     = church.consent_document_sha256(jsonb_build_array(jsonb_build_object(
       'key','a','heading','A','kind','c','options', jsonb_build_array(
         jsonb_build_object('key','x','text','1' || chr(29) || 'y'),
         jsonb_build_object('key','','text','2')))))
  THEN RAISE EXCEPTION 'FAIL 6e: two option lists collide under the delimiter scheme'; END IF;

  -- 6f. Same at the section level: a section separator inside a section's
  --     text does not merge two sections into one.
  IF church.consent_document_sha256(jsonb_build_array(
       jsonb_build_object('key','a','heading','A','kind','c','text','1'),
       jsonb_build_object('key','b','heading','B','kind','c','text','2')))
     = church.consent_document_sha256(jsonb_build_array(
       jsonb_build_object('key','a','heading','A','kind','c',
                          'text','1' || chr(28) || 'b' || chr(31) || 'B')))
  THEN RAISE EXCEPTION 'FAIL 6f: two sections collide with one'; END IF;

  RAISE NOTICE 'PASS 1-6 (seed, shape, hash stability, canonicalisation)';
END;
$a$;

-- 7. The kiosk surface drops the portal-only sections but keeps the
--    whole-document hash. A parent signing at the kiosk agrees to all of it.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _k  RECORD; _p RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0c2dd974-ba40-4d99-8db5-63804c38ed65', true);

  SELECT * INTO _k FROM church.current_consent_document(_md, 'kids_parent_consent', 'kiosk');
  SELECT * INTO _p FROM church.current_consent_document(_md, 'kids_parent_consent', 'portal');

  IF _p.document_id IS NULL THEN RAISE EXCEPTION 'FAIL 7: portal returned no document'; END IF;
  IF jsonb_array_length(_p.body) <> 13 THEN
    RAISE EXCEPTION 'FAIL 7a: portal should return all 13, got %', jsonb_array_length(_p.body);
  END IF;
  IF jsonb_array_length(_k.body) <> 11 THEN
    RAISE EXCEPTION 'FAIL 7b: kiosk should return 11 (13 less sick_policy and '
                    'physician_insurance), got %', jsonb_array_length(_k.body);
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_k.body) s
              WHERE s->>'key' IN ('sick_policy','physician_insurance')) THEN
    RAISE EXCEPTION 'FAIL 7c: a portal-only section leaked onto the kiosk';
  END IF;
  -- The clause that cannot wait for a portal visit that may never happen.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_k.body) s
                  WHERE s->>'key' = 'emergency_medical') THEN
    RAISE EXCEPTION 'FAIL 7d: the 911 authorisation is missing from the kiosk form';
  END IF;
  IF _k.body_sha256 <> _p.body_sha256 THEN
    RAISE EXCEPTION 'FAIL 7e: the kiosk got a hash of the filtered subset, not the document';
  END IF;
  RAISE NOTICE 'PASS 7 (surface filtering keeps the whole-document hash)';
END;
$a$;

-- 8. A kids_volunteer cannot publish.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _ok BOOLEAN := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '13708053-2a4d-4c19-bd74-afd88da4cfee', true);
  BEGIN
    PERFORM church.publish_consent_document(_md, 'kids_parent_consent', 'Nope',
      '[{"key":"a","heading":"A","kind":"statement","text":"x"}]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 8: a kids_volunteer published a consent form'; END IF;
  RAISE NOTICE 'PASS 8 (volunteer refused 42501)';
END;
$a$;

-- 9-12. Publishing validation and the retire-on-publish invariant.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _r RECORD; _ok BOOLEAN; _n INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0c2dd974-ba40-4d99-8db5-63804c38ed65', true);

  -- 9. A required acknowledgment naming an option the body does not contain
  --    can never be ticked, so it is caught here rather than on a Sunday.
  _ok := false;
  BEGIN
    PERFORM church.publish_consent_document(_md, 'kids_parent_consent', 'T',
      '[{"key":"a","heading":"A","kind":"acknowledgments","options":[{"key":"yes","text":"y"}]}]'::jsonb,
      ARRAY['no_such_option']);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%required_acknowledgment_not_in_body%' THEN _ok := true;
    ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 9: an unticked-forever required key was accepted'; END IF;

  -- 10. Duplicate section keys are refused.
  _ok := false;
  BEGIN
    PERFORM church.publish_consent_document(_md, 'kids_parent_consent', 'T',
      '[{"key":"a","heading":"A","kind":"statement"},{"key":"a","heading":"B","kind":"statement"}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%section_keys_must_be_unique%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 10: duplicate section keys were accepted'; END IF;

  -- 11. A section with no key is refused.
  _ok := false;
  BEGIN
    PERFORM church.publish_consent_document(_md, 'kids_parent_consent', 'T',
      '[{"heading":"A","kind":"statement"}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%every_section_needs_key%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 11: a keyless section was accepted'; END IF;

  -- 12. A real publish: version 2, v1 retired, exactly one live row.
  SELECT * INTO _r FROM church.publish_consent_document(_md, 'kids_parent_consent',
    'Parent / Guardian Consent v2',
    '[{"key":"acknowledgment","heading":"10. Parent / Guardian Acknowledgment",
       "kind":"signature","surface":"both","text":"v2 wording",
       "options":[{"key":"parent_acknowledgment","text":"I agree."}]}]'::jsonb,
    ARRAY['parent_acknowledgment']);

  IF _r.version <> 2 THEN RAISE EXCEPTION 'FAIL 12: expected version 2, got %', _r.version; END IF;
  IF _r.retired_version <> 1 THEN
    RAISE EXCEPTION 'FAIL 12b: publishing v2 did not retire v1 (got %)', _r.retired_version;
  END IF;

  SELECT count(*) INTO _n FROM church.consent_documents
   WHERE organization_id = _md AND code = 'kids_parent_consent' AND retired_at IS NULL;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 12c: % live versions, expected exactly 1', _n; END IF;

  -- v1 is still there. Retiring is not deleting: a 2026 signature must still
  -- be able to name the words it froze.
  IF NOT EXISTS (SELECT 1 FROM church.consent_documents
                  WHERE organization_id = _md AND code='kids_parent_consent'
                    AND version = 1 AND retired_at IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 12d: v1 was not kept as a retired row';
  END IF;

  -- The other branch is untouched by a publish in this one.
  SELECT count(*) INTO _n FROM church.consent_documents
   WHERE organization_id = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
     AND code = 'kids_parent_consent' AND version = 1 AND retired_at IS NULL;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL 12e: publishing in MD disturbed VA'; END IF;

  RAISE NOTICE 'PASS 9-12 (publish validation, versioning, retirement)';
END;
$a$;

-- 13. The partial unique index really is what enforces "one live version",
--     not just the RPC being careful. A hand-crafted INSERT must fail.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _ok BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO church.consent_documents (organization_id, code, version, title,
      body, body_sha256, effective_from, published_by_name)
    VALUES (_md, 'kids_parent_consent', 99, 'Smuggled',
      '[{"key":"a"}]'::jsonb, repeat('a', 64), current_date, 'nobody');
  EXCEPTION WHEN unique_violation THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 13: a second live version was insertable'; END IF;
  RAISE NOTICE 'PASS 13 (one live version is a database guarantee)';
END;
$a$;

-- 14. The seed is idempotent: running it again publishes nothing.
DO $a$
DECLARE _before INT; _after INT;
BEGIN
  SELECT count(*) INTO _before FROM church.consent_documents;
  INSERT INTO church.consent_documents (organization_id, code, version, title, body,
    body_sha256, effective_from, published_by_name)
  SELECT o.id, 'kids_parent_consent', 1, 'dup', '[{"key":"a"}]'::jsonb,
         repeat('b',64), current_date, 'x'
  FROM public.organizations o
  WHERE NOT EXISTS (SELECT 1 FROM church.consent_documents d
                     WHERE d.organization_id = o.id AND d.code = 'kids_parent_consent');
  SELECT count(*) INTO _after FROM church.consent_documents;
  IF _after <> _before THEN
    RAISE EXCEPTION 'FAIL 14: the seed guard let a duplicate through (% -> %)', _before, _after;
  END IF;
  RAISE NOTICE 'PASS 14 (seed guard is idempotent)';
END;
$a$;
