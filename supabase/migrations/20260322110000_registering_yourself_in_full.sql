-- =====================================================
-- Registering yourself, in full
-- =====================================================
--
-- The QR-code page offered somebody the church did not have a four-field form:
-- a name, an email address and a telephone number. That is enough to make a
-- row and nothing like enough to be useful — no household, no address, no
-- spouse, no children, nothing for the Children's Ministry to check anybody in
-- with on the same Sunday morning.
--
-- The office already has the form that captures all of it,
-- church.register_member_family, and it writes the household, the person, the
-- spouse, every child, their parent relationships, their pickup
-- authorisations, the emergency contacts and the service interests in ONE
-- transaction. The right move is to let a new member reach that same function
-- rather than to grow a second, thinner one beside it that would drift.
--
-- SO THIS REPLACES THAT FUNCTION, unchanged except in three places, all of
-- them marked below:
--
--   1. The guard admits somebody registering themselves, defined narrowly as a
--      signed-in caller with NO person record in the branch. That is a state a
--      login is in exactly once.
--   2. A self-registration cannot choose its own membership status or
--      backdate member_since.
--   3. A self-registration is linked to the caller's login and put in front of
--      a human, the same two steps the QR page already did for the short form.
--
-- The office's path through this function is byte-for-byte what it was.
--
-- WHY NOT A SEPARATE FUNCTION. Because the next person to add a field to
-- registration would add it to one of the two, and the family that registers
-- itself on a Sunday would quietly stop getting whatever it was. A copy of 250
-- lines of transactional family-building is a copy that rots.

-- ---------------------------------------------------------------------------
-- Somebody with no record of their own
-- ---------------------------------------------------------------------------
-- The one state in which a stranger may write to the directory: signed in, and
-- unknown to this branch. It closes behind them — the record they create makes
-- this false for every subsequent call.
--
-- NOT "has no record anywhere": a person may legitimately be on file at
-- Springfield and new to Silver Spring, and the branches keep separate
-- directories.
CREATE OR REPLACE FUNCTION church.registering_themselves(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM church.people p
        WHERE p.profile_id = auth.uid()
          AND p.organization_id = _organization_id
          AND p.merged_into_person_id IS NULL)
$$;

GRANT EXECUTE ON FUNCTION church.registering_themselves(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION church.register_member_family(
  _organization_id UUID,
  _person JSONB,
  _household JSONB DEFAULT NULL,
  _spouse JSONB DEFAULT NULL,
  _children JSONB DEFAULT '[]'::jsonb,
  _emergency_contacts JSONB DEFAULT '[]'::jsonb,
  _service_interest_ministry_ids UUID[] DEFAULT NULL
)
-- Output parameter names are prefixed because a RETURNS TABLE column shadows
-- any same-named table column inside the body, which makes ON CONFLICT
-- (person_id, ...) and WHERE person_id = ... ambiguous to plpgsql.
RETURNS TABLE (out_person_id UUID, out_household_id UUID,
               out_spouse_person_id UUID, out_child_count INTEGER)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _self BOOLEAN;
  _actor_name TEXT;
  _hh UUID;
  _me UUID;
  _spouse_id UUID;
  _spouse_mode TEXT;
  _child JSONB;
  _child_id UUID;
  _kids INTEGER := 0;
  _contact JSONB;
  _ministry UUID;
  _spouse_type UUID;
  _parent_type UUID;
BEGIN
  -- WIDENED at 20260322110000: the office, or somebody registering THEMSELVES.
  --
  -- church.registering_themselves is true only for a signed-in caller who has
  -- no person record in this branch at all, which is a state each login passes
  -- through exactly once — the moment after they set a password on the QR-code
  -- page and before this call writes their record. Every later call by the
  -- same login is refused, because by then they have a record.
  _self := church.registering_themselves(_organization_id);

  IF NOT (_self OR church.has_permission_in_org(
       _organization_id, ARRAY['members_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  -- A self-registration does not get to choose its own standing in the church
  -- or backdate its membership. The church asked that these people be recorded
  -- as members; what they may not do is arrive as a 'Member since 1998' the
  -- office never agreed to.
  IF _self THEN
    _person := _person
      || jsonb_build_object(
           'membership_status_id',
           (SELECT ms.id FROM church.membership_statuses ms
             WHERE ms.organization_id = _organization_id
               AND ms.code = 'member' AND ms.is_active),
           'member_since', CURRENT_DATE);
  END IF;

  IF coalesce(btrim(_person->>'first_name'), '') = ''
     OR coalesce(btrim(_person->>'last_name'), '') = '' THEN
    RAISE EXCEPTION 'first_and_last_name_required';
  END IF;

  _actor_name := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Administrator');

  SELECT id INTO _spouse_type FROM church.relationship_types
   WHERE organization_id = _organization_id AND code = 'spouse';
  SELECT id INTO _parent_type FROM church.relationship_types
   WHERE organization_id = _organization_id AND code = 'parent';

  -- Household -------------------------------------------------------------
  -- Address lives here, once, rather than repeated on every family member.
  IF _household IS NOT NULL AND coalesce(btrim(_household->>'name'), '') <> '' THEN
    INSERT INTO church.households (
      organization_id, name, address_line1, address_line2, city, state,
      postal_code, country, primary_phone, created_by, created_by_name)
    VALUES (
      _organization_id, btrim(_household->>'name'),
      NULLIF(btrim(coalesce(_household->>'address_line1', '')), ''),
      NULLIF(btrim(coalesce(_household->>'address_line2', '')), ''),
      NULLIF(btrim(coalesce(_household->>'city', '')), ''),
      NULLIF(btrim(coalesce(_household->>'state', '')), ''),
      NULLIF(btrim(coalesce(_household->>'postal_code', '')), ''),
      coalesce(NULLIF(btrim(coalesce(_household->>'country', '')), ''), 'USA'),
      NULLIF(btrim(coalesce(_household->>'primary_phone', '')), ''),
      auth.uid(), _actor_name)
    RETURNING id INTO _hh;
  END IF;

  -- Primary person --------------------------------------------------------
  _me := church.insert_person_from_json(_organization_id, _person, false, _actor_name);

  IF _hh IS NOT NULL THEN
    INSERT INTO church.household_members
      (organization_id, household_id, person_id, household_role,
       is_primary_contact, is_primary_household)
    VALUES (_organization_id, _hh, _me, 'adult', true, true);
  END IF;

  -- Spouse ----------------------------------------------------------------
  _spouse_mode := coalesce(_spouse->>'mode', 'none');

  IF _spouse_mode = 'link' THEN
    _spouse_id := (_spouse->>'person_id')::UUID;
    -- Guard against linking a spouse from the other branch.
    PERFORM 1 FROM church.people
     WHERE id = _spouse_id AND organization_id = _organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'spouse_not_found_in_organization';
    END IF;
  ELSIF _spouse_mode = 'create' THEN
    _spouse_id := church.insert_person_from_json(
      _organization_id, _spouse->'person', false, _actor_name);
  END IF;

  IF _spouse_id IS NOT NULL THEN
    IF _spouse_id = _me THEN
      RAISE EXCEPTION 'cannot_be_own_spouse';
    END IF;

    -- Only ONE direction is written: a trigger mirrors the inverse, and
    -- writing both would collide on the uniqueness constraint.
    INSERT INTO church.person_relationships
      (organization_id, person_id, related_person_id, relationship_type_id)
    VALUES (_organization_id, _me, _spouse_id, _spouse_type)
    ON CONFLICT (person_id, related_person_id, relationship_type_id) DO NOTHING;

    -- Put the spouse in the household, unless they already belong to one.
    IF _hh IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM church.household_members
                       WHERE person_id = _spouse_id AND end_date IS NULL) THEN
      INSERT INTO church.household_members
        (organization_id, household_id, person_id, household_role, is_primary_household)
      VALUES (_organization_id, _hh, _spouse_id, 'adult', true);
    END IF;
  END IF;

  -- Children --------------------------------------------------------------
  FOR _child IN SELECT * FROM jsonb_array_elements(coalesce(_children, '[]'::jsonb))
  LOOP
    CONTINUE WHEN coalesce(btrim(_child->>'first_name'), '') = '';

    -- Children inherit the family surname unless one is given, which is what
    -- the person filling the form expects.
    _child_id := church.insert_person_from_json(
      _organization_id,
      _child || jsonb_build_object(
        'last_name',
        coalesce(NULLIF(btrim(coalesce(_child->>'last_name', '')), ''),
                 _person->>'last_name')),
      true, _actor_name);

    _kids := _kids + 1;

    IF _hh IS NOT NULL THEN
      INSERT INTO church.household_members
        (organization_id, household_id, person_id, household_role, is_primary_household)
      VALUES (_organization_id, _hh, _child_id, 'child', true);
    END IF;

    INSERT INTO church.person_relationships
      (organization_id, person_id, related_person_id, relationship_type_id)
    VALUES (_organization_id, _me, _child_id, _parent_type)
    ON CONFLICT (person_id, related_person_id, relationship_type_id) DO NOTHING;

    IF _spouse_id IS NOT NULL THEN
      INSERT INTO church.person_relationships
        (organization_id, person_id, related_person_id, relationship_type_id)
      VALUES (_organization_id, _spouse_id, _child_id, _parent_type)
      ON CONFLICT (person_id, related_person_id, relationship_type_id) DO NOTHING;
    END IF;

    -- Both parents may collect the child. Explicit rows rather than inferred
    -- from the relationship, because Kids checkout reads this list directly.
    INSERT INTO church.kids_pickup_authorizations
      (organization_id, child_person_id, authorized_person_id, relationship_note,
       created_by, created_by_name)
    VALUES (_organization_id, _child_id, _me, 'Parent', auth.uid(), _actor_name)
    ON CONFLICT (child_person_id, authorized_person_id) DO NOTHING;

    IF _spouse_id IS NOT NULL THEN
      INSERT INTO church.kids_pickup_authorizations
        (organization_id, child_person_id, authorized_person_id, relationship_note,
         created_by, created_by_name)
      VALUES (_organization_id, _child_id, _spouse_id, 'Parent', auth.uid(), _actor_name)
      ON CONFLICT (child_person_id, authorized_person_id) DO NOTHING;
    END IF;

    -- KID-021 requires an emergency contact before a child can be checked in,
    -- so the family's contacts are attached to each child as well as the adult.
    FOR _contact IN SELECT * FROM jsonb_array_elements(coalesce(_emergency_contacts, '[]'::jsonb))
    LOOP
      CONTINUE WHEN coalesce(btrim(_contact->>'name'), '') = ''
                 OR coalesce(btrim(_contact->>'phone'), '') = '';
      INSERT INTO church.person_emergency_contacts
        (organization_id, person_id, name, relationship, phone, priority)
      VALUES (_organization_id, _child_id, btrim(_contact->>'name'),
              NULLIF(btrim(coalesce(_contact->>'relationship', '')), ''),
              btrim(_contact->>'phone'),
              coalesce((_contact->>'priority')::INTEGER, 1));
    END LOOP;
  END LOOP;

  -- Emergency contacts for the adult ---------------------------------------
  FOR _contact IN SELECT * FROM jsonb_array_elements(coalesce(_emergency_contacts, '[]'::jsonb))
  LOOP
    CONTINUE WHEN coalesce(btrim(_contact->>'name'), '') = ''
               OR coalesce(btrim(_contact->>'phone'), '') = '';
    INSERT INTO church.person_emergency_contacts
      (organization_id, person_id, name, relationship, phone, priority)
    VALUES (_organization_id, _me, btrim(_contact->>'name'),
            NULLIF(btrim(coalesce(_contact->>'relationship', '')), ''),
            btrim(_contact->>'phone'),
            coalesce((_contact->>'priority')::INTEGER, 1));
  END LOOP;

  -- Service interests -------------------------------------------------------
  IF _service_interest_ministry_ids IS NOT NULL THEN
    FOREACH _ministry IN ARRAY _service_interest_ministry_ids
    LOOP
      INSERT INTO church.person_service_interests
        (organization_id, person_id, ministry_id, status)
      VALUES (_organization_id, _me, _ministry, 'interested')
      ON CONFLICT (person_id, ministry_id) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO church.people_history
    (organization_id, person_id, action, actor_id, actor_name, notes)
  VALUES (_organization_id, _me, 'registered', auth.uid(), _actor_name,
          format('Registered with %s children%s', _kids,
                 CASE WHEN _spouse_id IS NOT NULL THEN ' and a spouse' ELSE '' END));

  -- The step that makes the whole thing worth doing. Without it they finish a
  -- long form, land in My Church and are told their login is not linked to a
  -- member record — see church.claim_attach_login, which refuses if either
  -- side is already spoken for.
  IF _self THEN
    PERFORM church.claim_attach_login(_me, auth.uid());
    PERFORM church.claim_open_followup(_me);
  END IF;

  RETURN QUERY SELECT _me, _hh, _spouse_id, _kids;
END;
$$;

GRANT EXECUTE ON FUNCTION church.register_member_family(
  UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID[]) TO authenticated;

COMMENT ON FUNCTION church.register_member_family(UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID[]) IS
  'Registers a whole family in one transaction. Callable by members_admin for '
  'anybody, and by a signed-in person with no record in the branch for '
  'themselves - in which case the membership status is forced, member_since is '
  'today, the new record is linked to their login and a follow-up card opens.';

NOTIFY pgrst, 'reload schema';
