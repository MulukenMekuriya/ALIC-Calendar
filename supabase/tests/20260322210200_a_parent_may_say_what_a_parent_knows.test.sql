-- Assertions for 20260322210200, inside BEGIN/ROLLBACK.

-- 1. The derived label.
DO $a$
BEGIN
  IF church.derive_allergy_label(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1: no allergies produced a label';
  END IF;
  IF church.derive_allergy_label('   ') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1b: whitespace produced a label';
  END IF;
  IF church.derive_allergy_label('Peanuts') <> 'Peanuts' THEN
    RAISE EXCEPTION 'FAIL 1c: a short list was altered';
  END IF;
  -- 24 is what chk_person_sensitive_label_len has always enforced on the
  -- column. Anything at or under it is untouched.
  IF church.derive_allergy_label('Peanuts and tree nuts') <> 'Peanuts and tree nuts' THEN
    RAISE EXCEPTION 'FAIL 1d: a 21-character list was cut';
  END IF;

  -- Longer than the column allows: it MUST be cut, and the cut must announce
  -- itself. A tag reading "Peanuts, tree nuts and" with "dairy" silently gone
  -- is a complete-looking list missing an allergen.
  IF church.derive_allergy_label('Peanuts, tree nuts and dairy') NOT LIKE '%' || chr(8230) THEN
    RAISE EXCEPTION 'FAIL 1e: a truncated list did not say it was truncated (%)',
      church.derive_allergy_label('Peanuts, tree nuts and dairy');
  END IF;

  -- NEVER longer than the column's CHECK, or a parent saving a real allergy
  -- list gets a constraint violation instead of a saved record.
  IF length(church.derive_allergy_label(
       'Peanuts, tree nuts, shellfish, dairy, eggs, soy and sesame seeds')) > 24 THEN
    RAISE EXCEPTION 'FAIL 1f: the derived label exceeds the column''s 24';
  END IF;

  -- A parent writing a paragraph does not produce a paragraph on the tag.
  IF length(church.derive_allergy_label(repeat('averylongword', 20))) > 24 THEN
    RAISE EXCEPTION 'FAIL 1g: one long word overflowed the column';
  END IF;
  IF church.derive_allergy_label(repeat('averylongword', 20)) NOT LIKE '%' || chr(8230) THEN
    RAISE EXCEPTION 'FAIL 1h: a hard cut did not announce itself';
  END IF;

  -- Newlines and runs of spaces collapse; a tag is one line.
  IF church.derive_allergy_label(E'Peanuts,\n\n  tree   nuts') <> 'Peanuts, tree nuts' THEN
    RAISE EXCEPTION 'FAIL 1i: whitespace was not flattened (%)',
      church.derive_allergy_label(E'Peanuts,\n\n  tree   nuts');
  END IF;
  RAISE NOTICE 'PASS 1 (derived label)';
END;
$a$;

-- 2-14. A parent editing, and what happens to the form.
DO $a$
DECLARE
  _md   UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _volu UUID := '13708053-2a4d-4c19-bd74-afd88da4cfee';
  _h1 UUID; _mum UUID; _selam UUID; _abel UUID; _outsider UUID; _h2 UUID;
  _sig UUID; _r RECORD; _st RECORD; _ok BOOLEAN; _n INT; _answers JSONB;
  _notif_before INT; _cc UUID;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);

  INSERT INTO church.households (organization_id, name) VALUES (_md,'ZZ Med Alpha')
    RETURNING id INTO _h1;
  INSERT INTO church.households (organization_id, name) VALUES (_md,'ZZ Med Beta')
    RETURNING id INTO _h2;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child, email, notify_by_email)
    VALUES (_md,'ZZMum','Med',false,'zzmum@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md,'ZZSelam','Med',true) RETURNING id INTO _selam;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md,'ZZAbel','Med',true) RETURNING id INTO _abel;
  INSERT INTO church.people (organization_id, first_name, last_name, is_child)
    VALUES (_md,'ZZOther','Beta',true) RETURNING id INTO _outsider;
  INSERT INTO church.household_members (organization_id, household_id, person_id, household_role)
  VALUES (_md,_h1,_mum,'head'),(_md,_h1,_selam,'child'),(_md,_h1,_abel,'child'),
         (_md,_h2,_outsider,'child');

  -- Become a PLAIN PARENT: a household member holding kids_volunteer and no
  -- admin grant at all. Running these as the kids admin would prove nothing -
  -- an admin legitimately reaches every child in the branch, so the household
  -- boundary would never be exercised.
  UPDATE church.people SET profile_id = NULL WHERE profile_id = _volu AND organization_id = _md;
  UPDATE church.people SET profile_id = _volu WHERE id = _mum;
  PERFORM set_config('request.jwt.claim.sub', _volu::TEXT, true);

  -- 2. A parent may edit their own child.
  IF NOT church.may_edit_child_medical(_selam) THEN
    RAISE EXCEPTION 'FAIL 2: a parent cannot edit their own child';
  END IF;

  -- 3. ...and not another household's child. This is the door, so it is the
  --    assertion that matters most in this migration.
  IF church.may_edit_child_medical(_outsider) THEN
    RAISE EXCEPTION 'FAIL 3: a parent can edit another household''s child';
  END IF;

  _ok := false;
  BEGIN
    PERFORM church.update_child_medical(_outsider, 'Peanuts');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 3b: the write door opened for an outsider'; END IF;

  _ok := false;
  BEGIN
    PERFORM church.my_child_medical(_outsider);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 3c: the read door opened for an outsider'; END IF;

  -- 4. "We asked and there is none" is distinguishable from "nobody asked".
  SELECT * INTO _r FROM church.my_child_medical(_selam);
  IF _r.has_record THEN RAISE EXCEPTION 'FAIL 4: a child with no row reads as having one'; END IF;

  -- 5. An unknown severity is refused rather than stored.
  _ok := false;
  BEGIN
    PERFORM church.update_child_medical(_selam, 'Peanuts', 'catastrophic');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%unknown_allergy_severity%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 5: an invented severity was accepted'; END IF;

  -- 'moderate' reads like a real answer and is NOT one of the four the column
  -- permits. Accepting it would hand the parent a constraint violation.
  _ok := false;
  BEGIN
    PERFORM church.update_child_medical(_selam, 'Peanuts', 'moderate');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%unknown_allergy_severity%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 5b: moderate was accepted but the column rejects it'; END IF;

  -- An allergy written down with no severity chosen must be REFUSED, not
  -- filed as 'none'. Defaulting there would record a stated allergy as no
  -- allergy, which is the worst thing this feature could do.
  _ok := false;
  BEGIN
    PERFORM church.update_child_medical(_selam, 'Peanuts');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%severity_required_with_allergies%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 5d: an allergy with no severity was accepted';
  END IF;

  -- ...and "Peanuts" with severity 'none' is the same contradiction.
  _ok := false;
  BEGIN
    PERFORM church.update_child_medical(_selam, 'Peanuts', 'none');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%severity_required_with_allergies%' THEN _ok := true; ELSE RAISE; END IF;
  END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 5e: an allergy filed as severity none was accepted';
  END IF;

  -- Notes with no allergies at all save fine, with severity defaulted to the
  -- literally-true 'none'.
  PERFORM church.update_child_medical(_abel, NULL, NULL, NULL, 'Wears hearing aids');
  IF (SELECT allergy_severity FROM church.person_sensitive WHERE person_id=_abel) <> 'none' THEN
    RAISE EXCEPTION 'FAIL 5f: a note with no allergy did not default to none';
  END IF;

  -- 'none' IS permitted: it is the stated negative, and recording it is the
  -- difference between "we asked and there is none" and "nobody asked".
  -- On the sibling, so the history counts below stay about one child.
  PERFORM church.update_child_medical(_abel, NULL, 'none', NULL, NULL, NULL, true);
  IF (SELECT allergy_severity FROM church.person_sensitive WHERE person_id=_abel) <> 'none' THEN
    RAISE EXCEPTION 'FAIL 5c: a stated "no known allergies" was not recorded';
  END IF;

  -- 6. The first write, with no signature on file yet: the record and the
  --    tag update, nothing goes stale, and NOBODY is emailed.
  SELECT count(*) INTO _notif_before FROM church.notification_log;
  SELECT * INTO _r FROM church.update_child_medical(_selam, 'Peanuts and tree nuts', 'severe');
  IF NOT _r.changed THEN RAISE EXCEPTION 'FAIL 6: the first write reported no change'; END IF;
  IF _r.consent_now_stale THEN
    RAISE EXCEPTION 'FAIL 6b: a family with no signature was told their form is stale';
  END IF;
  IF (SELECT count(*) FROM church.notification_log) <> _notif_before THEN
    RAISE EXCEPTION 'FAIL 6c: an edit with no signature on file sent email';
  END IF;
  IF (SELECT allergy_label_short FROM church.person_sensitive WHERE person_id=_selam)
     <> 'Peanuts and tree nuts' THEN
    RAISE EXCEPTION 'FAIL 6d: the classroom tag was not derived';
  END IF;
  IF (SELECT count(*) FROM church.person_sensitive_history WHERE person_id=_selam) <> 1 THEN
    RAISE EXCEPTION 'FAIL 6e: no history row';
  END IF;
  -- Who said so matters: a parent's account of their own child is the
  -- authoritative one, and an office correction is not.
  IF (SELECT changed_by_role FROM church.person_sensitive_history WHERE person_id=_selam)
     <> 'parent' THEN
    RAISE EXCEPTION 'FAIL 6f: a parent''s edit was recorded as staff';
  END IF;

  -- 7. Saving the same values again changes nothing and sends nothing.
  SELECT count(*) INTO _notif_before FROM church.notification_log;
  SELECT * INTO _r FROM church.update_child_medical(_selam, 'Peanuts and tree nuts', 'severe');
  IF _r.changed THEN RAISE EXCEPTION 'FAIL 7: an identical save reported a change'; END IF;
  IF (SELECT count(*) FROM church.person_sensitive_history WHERE person_id=_selam) <> 1 THEN
    RAISE EXCEPTION 'FAIL 7b: an identical save wrote a history row';
  END IF;
  IF (SELECT count(*) FROM church.notification_log) <> _notif_before THEN
    RAISE EXCEPTION 'FAIL 7c: an identical save sent email';
  END IF;

  -- Now sign for both children.
  SELECT jsonb_object_agg(r,'true') INTO _answers
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;

  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h1,ARRAY[_selam,_abel],_mum,'ZZ Mum Med','portal',_answers);

  SELECT * INTO _st FROM church.child_consent_state(_selam);
  IF _st.state <> 'covered' THEN RAISE EXCEPTION 'FAIL 8: fresh signature is %', _st.state; END IF;
  IF _st.resign_due_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 8b: a fresh signature already carries a deadline';
  END IF;

  -- 9. A medical change stales the form, sets a four-week deadline, and
  --    emails BOTH the admins and the parent - in one transaction, with
  --    nobody having to notice.
  SELECT count(*) INTO _notif_before FROM church.notification_log;
  SELECT * INTO _r FROM church.update_child_medical(_selam, 'Peanuts and dairy', 'severe');
  IF NOT _r.consent_now_stale THEN RAISE EXCEPTION 'FAIL 9: the form did not go stale'; END IF;
  IF _r.resign_due_by <> (current_date + 28) THEN
    RAISE EXCEPTION 'FAIL 9b: the deadline is % not %', _r.resign_due_by, current_date + 28;
  END IF;
  IF (SELECT count(*) FROM church.notification_log
       WHERE kind='kids_medical_updated' AND child_person_id=_selam) = 0 THEN
    RAISE EXCEPTION 'FAIL 9c: the admins were not told';
  END IF;
  IF (SELECT count(*) FROM church.notification_log
       WHERE kind='kids_consent_resign_needed' AND child_person_id=_selam) <> 1 THEN
    RAISE EXCEPTION 'FAIL 9d: the parent was not asked exactly once';
  END IF;

  -- The admin note carries NO medical detail. Putting a named minor's
  -- allergy into seven personal mailboxes is what this avoids.
  IF EXISTS (SELECT 1 FROM church.notification_log
              WHERE kind='kids_medical_updated' AND child_person_id=_selam
                AND (body ILIKE '%peanut%' OR body ILIKE '%dairy%' OR body ILIKE '%tree nut%')) THEN
    RAISE EXCEPTION 'FAIL 9e: the admin email named the allergy';
  END IF;

  -- The parent's email states the date.
  IF NOT EXISTS (SELECT 1 FROM church.notification_log
                  WHERE kind='kids_consent_resign_needed' AND child_person_id=_selam
                    AND body LIKE '%' || to_char(current_date + 28, 'FMDD FMMonth') || '%') THEN
    RAISE EXCEPTION 'FAIL 9f: the parent was not told the date';
  END IF;

  -- 10. INSIDE THE GRACE PERIOD THE CHILD IS STILL COVERED. A parent who
  --     reported a new allergy on Saturday must not be refused on Sunday.
  SELECT * INTO _st FROM church.child_consent_state(_selam);
  IF _st.state <> 'covered' THEN
    RAISE EXCEPTION 'FAIL 10: inside the grace period the child is %', _st.state;
  END IF;
  IF _st.resign_due_by <> (current_date + 28) THEN
    RAISE EXCEPTION 'FAIL 10b: the state did not carry the deadline';
  END IF;
  IF _st.medical_changed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL 10c: the state did not carry the change time';
  END IF;

  -- 11. The sibling who was on the same form is untouched: their medical
  --     record did not change, so their consent did not go stale.
  SELECT * INTO _st FROM church.child_consent_state(_abel);
  IF _st.state <> 'covered' OR _st.resign_due_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 11: a sibling was staled by another child''s edit (% / %)',
      _st.state, _st.resign_due_by;
  END IF;

  -- 12. FURTHER EDITS DO NOT EXTEND THE DEADLINE, and do not re-email. Were
  --     it otherwise the grace period would be unenforceable - a parent
  --     touching the form once a week would never reach it.
  SELECT count(*) INTO _n FROM church.notification_log
   WHERE kind='kids_consent_resign_needed' AND child_person_id=_selam;
  SELECT * INTO _r FROM church.update_child_medical(_selam, 'Peanuts, dairy, eggs', 'severe');
  IF _r.consent_now_stale THEN
    RAISE EXCEPTION 'FAIL 12: a second edit re-staled and re-dated the form';
  END IF;
  IF _r.resign_due_by <> (current_date + 28) THEN
    RAISE EXCEPTION 'FAIL 12b: the second edit moved the deadline to %', _r.resign_due_by;
  END IF;
  IF (SELECT count(*) FROM church.notification_log
       WHERE kind='kids_consent_resign_needed' AND child_person_id=_selam) <> _n THEN
    RAISE EXCEPTION 'FAIL 12c: a second edit sent a second letter';
  END IF;
  -- ...but the tag still updated, because that is the part that protects the child.
  IF (SELECT allergy_label_short FROM church.person_sensitive WHERE person_id=_selam)
     <> 'Peanuts, dairy, eggs' THEN
    RAISE EXCEPTION 'FAIL 12d: the tag did not follow the second edit';
  END IF;

  -- 13. ONCE THE FOUR WEEKS PASS, the child reads consent_out_of_date.
  SELECT cc.id INTO _cc FROM church.consent_children cc
   WHERE cc.consent_signature_id=_sig AND cc.child_person_id=_selam;
  UPDATE church.consent_children SET resign_due_by = current_date - 1 WHERE id = _cc;

  SELECT * INTO _st FROM church.child_consent_state(_selam);
  IF _st.state <> 'consent_out_of_date' THEN
    RAISE EXCEPTION 'FAIL 13: past the deadline the child is %', _st.state;
  END IF;
  -- The sibling is still covered: the deadline is per child, not per form.
  SELECT * INTO _st FROM church.child_consent_state(_abel);
  IF _st.state <> 'covered' THEN
    RAISE EXCEPTION 'FAIL 13b: one child''s deadline hit a sibling (%)', _st.state;
  END IF;

  -- 14. RE-SIGNING CLEARS IT, with no manual step anywhere.
  SELECT * INTO _r FROM church.sign_kids_consent(
    _md,_h1,ARRAY[_selam,_abel],_mum,'ZZ Mum Med','portal',_answers);
  SELECT * INTO _st FROM church.child_consent_state(_selam);
  IF _st.state <> 'covered' THEN
    RAISE EXCEPTION 'FAIL 14: re-signing left the child %', _st.state;
  END IF;
  IF _st.resign_due_by IS NOT NULL OR _st.medical_changed_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 14b: re-signing did not clear the staleness';
  END IF;

  RAISE NOTICE 'PASS 2-14 (the two doors, staleness, grace, reminders cleared)';
END;
$a$;

-- 15. The sweep sends each letter once, and nothing twice.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _adminu UUID := '0c2dd974-ba40-4d99-8db5-63804c38ed65';
  _h UUID; _mum UUID; _kid UUID; _sig UUID; _answers JSONB; _cc UUID;
  _r RECORD; _n1 INT; _n2 INT;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _adminu::TEXT, true);
  INSERT INTO church.households (organization_id,name) VALUES (_md,'ZZ Sweep') RETURNING id INTO _h;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child,email,notify_by_email)
    VALUES (_md,'ZZSweepMum','S',false,'zzsweep@example.test',true) RETURNING id INTO _mum;
  INSERT INTO church.people (organization_id,first_name,last_name,is_child)
    VALUES (_md,'ZZSweepKid','S',true) RETURNING id INTO _kid;
  INSERT INTO church.household_members (organization_id,household_id,person_id,household_role)
    VALUES (_md,_h,_mum,'head'),(_md,_h,_kid,'child');
  UPDATE church.people SET profile_id=NULL WHERE profile_id=_adminu AND organization_id=_md;
  UPDATE church.people SET profile_id=_adminu WHERE id=_mum;

  SELECT jsonb_object_agg(r,'true') INTO _answers
  FROM church.consent_documents d, unnest(d.required_acknowledgments) r
  WHERE d.organization_id=_md AND d.code='kids_parent_consent' AND d.retired_at IS NULL;
  SELECT signature_id INTO _sig FROM church.sign_kids_consent(
    _md,_h,ARRAY[_kid],_mum,'ZZ Sweep Mum','portal',_answers);
  PERFORM church.update_child_medical(_kid,'Bee stings','mild');

  SELECT cc.id INTO _cc FROM church.consent_children cc
   WHERE cc.consent_signature_id=_sig AND cc.child_person_id=_kid;

  -- A week to go.
  UPDATE church.consent_children SET resign_due_by = current_date + 5 WHERE id=_cc;
  SELECT * INTO _r FROM church.kids_consent_resign_sweep();
  IF _r.reminded < 1 THEN RAISE EXCEPTION 'FAIL 15: the week-out reminder did not send'; END IF;
  SELECT count(*) INTO _n1 FROM church.notification_log
   WHERE kind='kids_consent_resign_reminder' AND child_person_id=_kid;
  IF _n1 <> 1 THEN RAISE EXCEPTION 'FAIL 15b: % reminders, expected 1', _n1; END IF;

  -- Running it again the next day must not post the same letter twice.
  SELECT * INTO _r FROM church.kids_consent_resign_sweep();
  SELECT count(*) INTO _n2 FROM church.notification_log
   WHERE kind='kids_consent_resign_reminder' AND child_person_id=_kid;
  IF _n2 <> _n1 THEN RAISE EXCEPTION 'FAIL 15c: the sweep re-sent the reminder'; END IF;

  -- The day it passes.
  UPDATE church.consent_children SET resign_due_by = current_date - 1 WHERE id=_cc;
  SELECT * INTO _r FROM church.kids_consent_resign_sweep();
  IF _r.overdue < 1 THEN RAISE EXCEPTION 'FAIL 15d: the overdue notice did not send'; END IF;
  SELECT count(*) INTO _n1 FROM church.notification_log
   WHERE kind='kids_consent_resign_overdue' AND child_person_id=_kid;
  IF _n1 <> 1 THEN RAISE EXCEPTION 'FAIL 15e: % overdue notices, expected 1', _n1; END IF;

  SELECT * INTO _r FROM church.kids_consent_resign_sweep();
  SELECT count(*) INTO _n2 FROM church.notification_log
   WHERE kind='kids_consent_resign_overdue' AND child_person_id=_kid;
  IF _n2 <> _n1 THEN RAISE EXCEPTION 'FAIL 15f: the sweep re-sent the overdue notice'; END IF;

  -- Neither letter names the allergy.
  IF EXISTS (SELECT 1 FROM church.notification_log
              WHERE child_person_id=_kid
                AND kind IN ('kids_consent_resign_reminder','kids_consent_resign_overdue')
                AND body ILIKE '%bee sting%') THEN
    RAISE EXCEPTION 'FAIL 15g: a reminder named the allergy';
  END IF;

  RAISE NOTICE 'PASS 15 (the sweep sends each letter exactly once)';
END;
$a$;

-- 16. The grace period is a setting, and shortening it does not move a
--     deadline a family has already been given.
DO $a$
DECLARE
  _md UUID := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  _volu UUID := '13708053-2a4d-4c19-bd74-afd88da4cfee';
  _ok BOOLEAN;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _volu::TEXT, true);
  _ok := false;
  BEGIN
    PERFORM church.set_consent_resign_grace(_md, 7);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL 16: a volunteer changed the grace period'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '0c2dd974-ba40-4d99-8db5-63804c38ed65'::TEXT, true);
  _ok := false;
  BEGIN
    PERFORM church.set_consent_resign_grace(_md, 0);
  EXCEPTION WHEN check_violation THEN _ok := true; END;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL 16b: a zero-day grace was accepted - that is refusing '
                    'a child the morning after their parent told us something';
  END IF;

  PERFORM church.set_consent_resign_grace(_md, 14);
  IF (SELECT resign_grace_days FROM church.kids_consent_policy WHERE organization_id=_md) <> 14 THEN
    RAISE EXCEPTION 'FAIL 16c: the grace period did not change';
  END IF;
  RAISE NOTICE 'PASS 16 (the grace period is a setting with sane bounds)';
END;
$a$;

-- 17. A parent still cannot touch custody records, and nothing added here
--     opened a door to them.
DO $a$
DECLARE _n INT;
BEGIN
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname='church' AND tablename='kids_pickup_restrictions'
     AND (qual ILIKE '%my_person_ids%' OR qual ILIKE '%my_household%');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 17: a household-scoped policy appeared on custody records';
  END IF;

  SELECT count(*) INTO _n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='church'
    AND p.proname IN ('update_child_medical','my_child_medical','may_edit_child_medical')
    AND pg_get_functiondef(p.oid) ILIKE '%kids_pickup_restrictions%';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 17b: a medical door reads or writes custody records';
  END IF;

  -- Photo consent stays with section 9 of the form, not the medical door -
  -- can_view_photos_of treats false as hiding the photo from the parent too.
  SELECT count(*) INTO _n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='church' AND p.proname='update_child_medical'
    AND pg_get_functiondef(p.oid) ILIKE '%photo_consent%';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL 17c: the medical door writes photo_consent';
  END IF;
  RAISE NOTICE 'PASS 17 (custody and photo consent are still out of reach)';
END;
$a$;
