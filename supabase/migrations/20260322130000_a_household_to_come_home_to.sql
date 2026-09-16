-- =====================================================
-- A household to come home to
-- =====================================================
--
-- church.register_new_member creates a person and nothing else. That was right
-- when the QR page emailed somebody a link and the whole interaction ended
-- there. It is wrong now that the same person is signed in ten seconds later
-- and looking at My Church, because a person with no household sees this on
-- the tab of that name:
--
--     "You are not recorded in a household yet. The church office can put
--      that right."
--
-- — which is a dead end dressed as an answer. Worse, it is the tab where the
-- address, the telephone number and the children are added, and every one of
-- those needs a household to hang on. So somebody who registers themselves
-- can currently do nothing at all with the screens 20260322080000 built for
-- exactly this person.
--
-- One household, created with them in it, turns all of it on: they can put in
-- their address, add their children, and the check-in desk knows those
-- children on Sunday. Nothing else has to be built and no second form has to
-- exist.
--
-- THE NAME. trim(first || ' ' || last), matching what the Breeze import did
-- for a household of one — the portal already renders "Muluken Mekuriya" as a
-- household name and nobody blinks. Not "The Mekuriya Family", which is a
-- guess about a family we have not met, and is wrong for the single adult who
-- makes up a good share of these.
--
-- PRIMARY CONTACT, because they are the only contact. is_primary_household
-- likewise: this is their household, not a second one they also belong to.
CREATE OR REPLACE FUNCTION church.register_new_member(
  _organization_id UUID,
  _first_name TEXT,
  _last_name TEXT,
  _email TEXT,
  _phone TEXT,
  _auth_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _person_id UUID;
  _household_id UUID;
  _status_id UUID;
  _actor TEXT;
  _name TEXT;
BEGIN
  IF coalesce(btrim(_first_name), '') = '' OR coalesce(btrim(_last_name), '') = '' THEN
    RAISE EXCEPTION 'first_name_required';
  END IF;
  IF coalesce(btrim(_email), '') = '' THEN
    RAISE EXCEPTION 'email_required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id) THEN
    RAISE EXCEPTION 'branch_not_found';
  END IF;

  _name := btrim(btrim(_first_name) || ' ' || btrim(_last_name));

  SELECT id INTO _status_id FROM church.membership_statuses
   WHERE organization_id = _organization_id AND code = 'member' AND is_active;

  _actor := coalesce(_name, 'Self-registered');

  _person_id := church.insert_person_from_json(
    _organization_id,
    jsonb_build_object(
      'first_name', btrim(_first_name),
      'last_name', btrim(_last_name),
      'email', btrim(_email),
      'phone', NULLIF(btrim(coalesce(_phone, '')), ''),
      'membership_status_id', _status_id,
      'member_since', CURRENT_DATE,
      'notes', 'Registered themselves from the QR code on '
               || to_char(CURRENT_DATE, 'FMDD Month YYYY')),
    false,
    _actor);

  -- NEW at 20260322130000. uq_households_org_name means two Selam Abebes
  -- cannot both have a household of that name, so a collision falls back to a
  -- name nobody has to like — the office renames it, and the member can too
  -- from My household. Failing the registration over a duplicate surname
  -- would be absurd.
  BEGIN
    INSERT INTO church.households (organization_id, name, primary_phone, created_by_name)
    VALUES (_organization_id, _name,
            NULLIF(btrim(coalesce(_phone, '')), ''), _actor)
    RETURNING id INTO _household_id;
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO church.households (organization_id, name, primary_phone, created_by_name)
    VALUES (_organization_id,
            _name || ' (' || to_char(CURRENT_DATE, 'FMDD Mon YYYY') || ')',
            NULLIF(btrim(coalesce(_phone, '')), ''), _actor)
    RETURNING id INTO _household_id;
  END;

  INSERT INTO church.household_members
    (organization_id, household_id, person_id, household_role,
     is_primary_contact, is_primary_household)
  VALUES (_organization_id, _household_id, _person_id, 'adult', true, true);

  PERFORM church.claim_attach_login(_person_id, _auth_user_id);
  PERFORM church.claim_open_followup(_person_id);

  RETURN _person_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.register_new_member(UUID, TEXT, TEXT, TEXT, TEXT, UUID)
  TO service_role;

COMMENT ON FUNCTION church.register_new_member(UUID, TEXT, TEXT, TEXT, TEXT, UUID) IS
  'A person, a household with them in it, the login joined to both, and a '
  'follow-up card. The household is what makes My Church usable to them '
  'immediately - it is where the address, the telephone number and the '
  'children are added, and all three need one to exist.';

NOTIFY pgrst, 'reload schema';
