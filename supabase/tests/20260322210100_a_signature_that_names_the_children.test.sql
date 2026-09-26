-- Assertions for 20260322210100. Run inside BEGIN/ROLLBACK after the
-- migration. A real household is built from scratch so nothing depends on
-- which family happens to be first in production.

-- 0. Every one of the 29 pre-existing audit actions still inserts. The
--    constraint has now been widened four times and each widening has to
--    carry the whole list; restricted_pickup_override is written by
--    check_out_children TODAY, so dropping it breaks the live override path.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _act TEXT;
BEGIN
  FOREACH _act IN ARRAY ARRAY[
    'check_in','check_out','transfer','code_failed','override','sensitive_viewed',
    'restricted_pickup_attempt','restricted_pickup_override','pin_failed',
    'auto_expired','label_reprint','shift_opened','shift_closed','visitor_registered',
    'late_pickup_recorded','late_pickup_notified','late_pickup_dismissed',
    'hold_raised','hold_lifted','hold_settled','check_in_held',
    'incident_raised','incident_noted','incident_severity_changed','incident_reviewed',
    'incident_signed_off','incident_declined','incident_external_report','incident_sent',
    'consent_signed','consent_revoked','consent_child_withdrawn','consent_reviewed']
  LOOP
    INSERT INTO church.check_in_audit (organization_id, action, outcome, actor_name)
    VALUES (_md, _act, 'success', 'assertion');
  END LOOP;
  -- There was a DELETE here to tidy up. 20260322250000 made check_in_audit
  -- append-only with a trigger, so the tidy-up is now refused - correctly,
  -- and the trigger firing here is itself worth knowing. The rollback was
  -- always what actually cleaned up; the DELETE never did anything the
  -- transaction would not have undone a moment later.
  RAISE NOTICE 'PASS 0 (all 33 audit actions insert)';
END;
$a$;

-- 1-12. A family, signed for, and every coverage edge.
DO $a$
DECLARE
  _md   UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _h1 UUID; _h2 UUID;
  _mum UUID; _selam UUID; _abel UUID; _baby UUID; _orphan UUID;
  _sig UUID; _sig2 UUID; _r RECORD; _st TEXT; _ok BOOLEAN; _n INT;
  _answers JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);

  INSERT INTO church.households (organization_id, name) VALUES (_md, 'ZZ Test Alpha')
    RETURNING id INTO _h1;
  INSERT INTO church.households (organization_id, name) VALUES (_md, 'ZZ Test Beta')
    RETURNING id INTO _h2;

  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md, 'ZZMum', 'Alpha', false) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child, birth_year, birth_month)
    VALUES (_md, 'ZZSelam', 'Alpha', true, 2018, 4) RETURNING id INTO _selam;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md, 'ZZAbel', 'Alpha', true) RETURNING id INTO _abel;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md, 'ZZBaby', 'Alpha', true) RETURNING id INTO _baby;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md, 'ZZOrphan', 'None', true) RETURNING id INTO _orphan;

  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role)
  VALUES (_md, _h1, _mum, 'head'), (_md, _h1, _selam, 'child'), (_md, _h1, _abel, 'child');

  -- 1. A child with no household at all.
  SELECT state INTO _st FROM church.child_consent_state(_orphan);
  IF _st <> 'no_household' THEN RAISE EXCEPTION 'FAIL 1: expected no_household, got %', _st; END IF;

  -- 2. Before anybody signs, a child in a household is no_signature - NOT
  --    child_not_on_signature. The two sentences are different and a family
  --    who has never signed must not be told their child was left off a form.
  SELECT state INTO _st FROM church.child_consent_state(_selam);
  IF _st <> 'no_signature' THEN RAISE EXCEPTION 'FAIL 2: expected no_signature, got %', _st; END IF;

  -- 3. Signing without every required acknowledgment is refused by the
  --    SERVER, not merely by the screen.
  _ok := false;
  BEGIN
    PERFORM church.sign_kids_consent(_md, _h1, ARRAY[_selam, _abel], _mum,
      'ZZ Mum Alpha', 'kiosk', '{"participation_consent":"true"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%required_acknowledgment_missing%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 3: an incomplete form was accepted'; END IF;

  SELECT jsonb_object_agg(r, 'true') INTO _answers
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id = _md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;

  -- 4. Naming a child who is not in this household is refused. Otherwise one
  --    parent could put another family's child on their form.
  _ok := false;
  BEGIN
    PERFORM church.sign_kids_consent(_md, _h1, ARRAY[_selam, _orphan], _mum,
      'ZZ Mum Alpha', 'kiosk', _answers);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%child_not_in_this_household%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 4: signed for a child of another household'; END IF;

  -- 5. A signature naming nobody covers nobody, so it is refused outright.
  _ok := false;
  BEGIN
    PERFORM church.sign_kids_consent(_md, _h1, ARRAY[]::UUID[], _mum,
      'ZZ Mum Alpha', 'kiosk', _answers);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%at_least_one_child%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 5: an empty signature was accepted'; END IF;

  -- 6. The real thing.
  SELECT * INTO _r FROM church.sign_kids_consent(_md, _h1, ARRAY[_selam, _abel], _mum,
    'ZZ Mum Alpha', 'kiosk', _answers);
  _sig := _r.signature_id;
  IF _r.children_named <> 2 THEN RAISE EXCEPTION 'FAIL 6: named % children', _r.children_named; END IF;
  IF _r.superseded_signature_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 6b: a first signature superseded something';
  END IF;

  -- The version and hash are frozen from the document, not joined at read.
  IF _r.document_sha256 <> (SELECT body_sha256 FROM church.consent_documents
      WHERE organization_id=_md AND code='kids_parent_consent' AND retired_at IS NULL) THEN
    RAISE EXCEPTION 'FAIL 6c: the signature froze the wrong hash';
  END IF;

  -- The child's name and date of birth are frozen as text for the PDF.
  IF (SELECT child_name_at_signing FROM church.consent_children
       WHERE consent_signature_id=_sig AND child_person_id=_selam) <> 'ZZSelam Alpha' THEN
    RAISE EXCEPTION 'FAIL 6d: the child name was not frozen';
  END IF;
  IF (SELECT child_dob_text FROM church.consent_children
       WHERE consent_signature_id=_sig AND child_person_id=_selam) <> '2018-04' THEN
    RAISE EXCEPTION 'FAIL 6e: the date of birth was not frozen';
  END IF;

  -- 7. Both named children are covered.
  SELECT state INTO _st FROM church.child_consent_state(_selam);
  IF _st <> 'covered' THEN RAISE EXCEPTION 'FAIL 7: Selam is %', _st; END IF;
  SELECT state INTO _st FROM church.child_consent_state(_abel);
  IF _st <> 'covered' THEN RAISE EXCEPTION 'FAIL 7b: Abel is %', _st; END IF;

  -- 8. A CHILD ADDED AFTER THE SIGNATURE IS child_not_on_signature, NOT
  --    no_signature. The family HAS signed; this child was not on the form.
  --    Different sentence, different remedy.
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role)
  VALUES (_md, _h1, _baby, 'child');
  SELECT state INTO _st FROM church.child_consent_state(_baby);
  IF _st <> 'child_not_on_signature' THEN
    RAISE EXCEPTION 'FAIL 8: a later child is %, expected child_not_on_signature', _st;
  END IF;

  -- 9. A CHILD WHO MOVES HOUSEHOLD IS STILL COVERED. Nobody withdrew
  --    anything, so nothing lapses. Coverage follows the child.
  UPDATE church.household_members SET end_date = current_date
   WHERE household_id=_h1 AND person_id=_abel;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role)
  VALUES (_md, _h2, _abel, 'child');

  SELECT state INTO _st FROM church.child_consent_state(_abel);
  IF _st <> 'covered' THEN RAISE EXCEPTION 'FAIL 9: after moving, Abel is %', _st; END IF;

  -- ...but the NEW household is told covered_elsewhere, so the portal can
  --    offer them a fresh form instead of a blank screen.
  SELECT state INTO _st FROM church.child_consent_state(_abel, _h2);
  IF _st <> 'covered_elsewhere' THEN
    RAISE EXCEPTION 'FAIL 9b: the new household sees %, expected covered_elsewhere', _st;
  END IF;

  -- ...and THE DESK, which passes no household, sees only 'covered'. A
  --    volunteer must not learn a custody history from a check-in screen.
  SELECT state INTO _st FROM church.child_consent_state(_abel, NULL);
  IF _st <> 'covered' THEN RAISE EXCEPTION 'FAIL 9c: the desk sees %', _st; END IF;

  -- 9d. A PORTAL signature must be signed by the parent themselves. A kids
  --     admin cannot put a parent's name on a self-service consent - free
  --     text alone is what lets "Mickey Mouse" onto a legal record, and the
  --     portal's whole evidential claim is that the signer was authenticated.
  _ok := false;
  BEGIN
    PERFORM church.sign_kids_consent(_md, _h1, ARRAY[_selam], _mum,
      'ZZ Mum Alpha', 'portal', _answers);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 9d: an admin signed a portal consent as a parent';
  END IF;

  -- Now make ZZMum the caller's own person record, which is what a real
  -- parent signing in the portal looks like. uq_people_profile_per_org means
  -- the admin's real person row has to let go of the account first.
  UPDATE church.people SET profile_id = NULL
   WHERE profile_id = _adminu AND organization_id = _md;
  UPDATE church.people SET profile_id = _adminu WHERE id = _mum;

  -- 10. Re-signing supersedes the old signature WITHOUT removing coverage
  --     from anybody named on it. Superseding is presentational.
  SELECT * INTO _r FROM church.sign_kids_consent(_md, _h1, ARRAY[_selam, _baby], _mum,
    'ZZ Mum Alpha', 'portal', _answers);
  IF (SELECT signer_auth_user_id FROM church.consent_signatures WHERE id = _r.signature_id)
     IS DISTINCT FROM _adminu THEN
    RAISE EXCEPTION 'FAIL 10a: a portal signature did not record its authenticated signer';
  END IF;
  _sig2 := _r.signature_id;
  IF _r.superseded_signature_id <> _sig THEN
    RAISE EXCEPTION 'FAIL 10: expected to supersede %, got %', _sig, _r.superseded_signature_id;
  END IF;
  SELECT state INTO _st FROM church.child_consent_state(_baby);
  IF _st <> 'covered' THEN RAISE EXCEPTION 'FAIL 10b: the new baby is %', _st; END IF;

  -- Abel was on the superseded form and not on the new one. He is STILL
  --   covered: nobody withdrew anything.
  SELECT state INTO _st FROM church.child_consent_state(_abel);
  IF _st <> 'covered' THEN
    RAISE EXCEPTION 'FAIL 10c: superseding removed coverage from Abel (%)', _st;
  END IF;

  -- 11. Withdrawing ONE child leaves the siblings covered.
  PERFORM church.withdraw_child_consent(_sig2, _baby, 'test');
  SELECT state INTO _st FROM church.child_consent_state(_baby);
  IF _st <> 'child_not_on_signature' THEN
    RAISE EXCEPTION 'FAIL 11: after withdrawal the baby is %', _st;
  END IF;
  SELECT state INTO _st FROM church.child_consent_state(_selam);
  IF _st <> 'covered' THEN RAISE EXCEPTION 'FAIL 11b: withdrawing one child hit a sibling (%)', _st; END IF;

  -- 12. Revoking every live signature in the household leaves the children
  --     'revoked' - a sentence that says what happened, not 'no_signature'
  --     which would say the family never signed.
  PERFORM church.revoke_kids_consent(_sig2, 'test');
  PERFORM church.revoke_kids_consent(_sig,  'test');
  SELECT state INTO _st FROM church.child_consent_state(_selam);
  IF _st <> 'revoked' THEN RAISE EXCEPTION 'FAIL 12: after revocation Selam is %', _st; END IF;

  RAISE NOTICE 'PASS 1-12 (coverage: the six states, moves, supersession, withdrawal)';
END;
$a$;

-- 13. A kids_volunteer cannot read a signature directly - the answers carry a
--     medical form. The desk gets a state from the definer RPC and nothing else.
DO $a$
DECLARE _n INT; _pol INT;
BEGIN
  SELECT count(*) INTO _pol FROM pg_policies
   WHERE schemaname='church' AND tablename IN ('consent_signatures','consent_children')
     AND cmd <> 'SELECT';
  IF _pol <> 0 THEN
    RAISE EXCEPTION 'FAIL 13: % non-SELECT policies on the consent tables', _pol;
  END IF;

  -- No policy mentions kids_volunteer or leadership_viewer.
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname='church' AND tablename IN ('consent_signatures','consent_children')
     AND (qual LIKE '%kids_volunteer%' OR qual LIKE '%leadership_viewer%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 13b: a volunteer or reporting role can read signatures';
  END IF;
  RAISE NOTICE 'PASS 13 (no write policies, no volunteer read)';
END;
$a$;

-- 14. The attribution CHECKs really are structural.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _doc UUID; _sha TEXT; _person UUID; _ok BOOLEAN;
BEGIN
  SELECT id, body_sha256 INTO _doc, _sha FROM church.consent_documents
   WHERE organization_id=_md AND code='kids_parent_consent' AND retired_at IS NULL;
  SELECT id INTO _person FROM church.people
   WHERE organization_id=_md AND NOT is_child AND is_active LIMIT 1;

  -- A portal signature with no authenticated user.
  _ok := false;
  BEGIN
    INSERT INTO church.consent_signatures (organization_id, consent_document_id,
      document_code, document_version, document_sha256, signer_person_id,
      signer_printed_name, source)
    VALUES (_md, _doc, 'kids_parent_consent', 1, _sha, _person, 'A Parent', 'portal');
  EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 14: a portal signature with no signer_auth_user_id'; END IF;

  -- An in-person signature with neither a witness nor a device.
  _ok := false;
  BEGIN
    INSERT INTO church.consent_signatures (organization_id, consent_document_id,
      document_code, document_version, document_sha256, signer_person_id,
      signer_printed_name, source)
    VALUES (_md, _doc, 'kids_parent_consent', 1, _sha, _person, 'A Parent', 'kiosk');
  EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 14b: an unattributed in-person signature'; END IF;

  -- A device alone IS enough for a self-service kiosk.
  INSERT INTO church.consent_signatures (organization_id, consent_document_id,
    document_code, document_version, document_sha256, signer_person_id,
    signer_printed_name, source, witness_station_id)
  VALUES (_md, _doc, 'kids_parent_consent', 1, _sha, _person, 'A Parent', 'kiosk',
          gen_random_uuid());

  RAISE NOTICE 'PASS 14 (attribution is structural, and a device counts)';
END;
$a$;

-- 15. The coverage card runs and counts the real 534.
DO $a$
DECLARE _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; _r RECORD;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '0c2dd974-ba40-4d99-8db5-63804c38ed65', true);
  SELECT * INTO _r FROM church.kids_consent_coverage(_md);
  IF _r.children_total < 534 THEN
    RAISE EXCEPTION 'FAIL 15: coverage counted only % children', _r.children_total;
  END IF;
  IF _r.children_covered + _r.children_uncovered <> _r.children_total THEN
    RAISE EXCEPTION 'FAIL 15b: covered + uncovered does not equal the total';
  END IF;
  RAISE NOTICE 'PASS 15 (coverage card: % children, % covered, % households)',
    _r.children_total, _r.children_covered, _r.households_total;
END;
$a$;
