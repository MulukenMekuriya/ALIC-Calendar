-- =====================================================
-- Adding a child to a person, not to a family record
-- =====================================================
--
-- Same Sunday, one step further back than 20260322170000.
--
-- The office has exactly one screen that CREATES a child: Members → Families →
-- open the family → Add a child. It needs a family record with the parent on
-- it. A member imported from Breeze often has none — the export carried people,
-- and a household was only built where the file gave one — and a parent with no
-- family record cannot be found on the Families page at all.
--
-- So an admin standing at the desk with that parent in front of them has two
-- options, and both are wrong:
--
--   * Register a family from scratch, which creates a SECOND person record for
--     a parent who is already in the directory.
--   * Open the parent's record, Family tab, and link an EXISTING person, which
--     is the only thing that screen does. It cannot create the child, and
--     nothing in the app can mark a person already in the directory as a child.
--
-- The second is what happened on 14 September, with the relationship recorded
-- the wrong way round on top of it: the parent was stored as the CHILD of the
-- person they had just named. Neither of them ever reached the check-in desk.
--
-- This adds the missing door: add a child to a PERSON. Where they already have
-- a family record, the child joins it and nothing else changes. Where they do
-- not, one is made for them first, named the way registration names one, with
-- the parent on it as the primary contact — because the family record is not a
-- formality, it is what carries the address, what the pickup-code text message
-- is sent from, and what the desk shows on the card.
--
-- Everything that makes a child usable on a Sunday is then done by
-- church.add_child_to_household, unchanged and uncopied: the person row, the
-- household membership, a parent relationship from every adult, a pickup
-- authorisation for every adult, the allergy record. This function's whole job
-- is to guarantee it a family to work with.
CREATE OR REPLACE FUNCTION church.add_child_to_person(
  _parent_person_id UUID,
  _child JSONB
)
RETURNS TABLE (child_person_id UUID, household_id UUID, household_created BOOLEAN)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _org UUID;
  _parent church.people%ROWTYPE;
  _actor TEXT;
  _hh UUID;
  _made BOOLEAN := false;
  _child_id UUID;
BEGIN
  SELECT * INTO _parent
  FROM church.people p
  WHERE p.id = _parent_person_id AND p.merged_into_person_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'person_not_found'; END IF;
  _org := _parent.organization_id;

  -- The office, or that person themselves from My Church. The same two the
  -- rest of the family editing path admits.
  IF NOT (church.has_permission_in_org(
            _org, ARRAY['members_admin']::church.module_permission[])
          OR coalesce(_parent.profile_id = auth.uid(), false)) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  -- A child is not a parent. Recording one under another child would put a
  -- minor on the list of people allowed to collect somebody.
  IF _parent.is_child THEN
    RAISE EXCEPTION 'parent_is_a_child'
      USING HINT = 'This record is marked as a child. Mark them as an adult '
                   'first, or add the child to the adult who is responsible '
                   'for them.';
  END IF;

  IF NOT _parent.is_active THEN
    RAISE EXCEPTION 'parent_is_archived';
  END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Administrator');

  -- The family they already have. Primary first, then any live one: a parent
  -- listed on their own household and on their mother's should have the child
  -- land on theirs.
  SELECT hm.household_id INTO _hh
  FROM church.household_members hm
  JOIN church.households h
    ON h.id = hm.household_id AND h.is_active AND h.organization_id = _org
  WHERE hm.person_id = _parent_person_id
    AND hm.end_date IS NULL
  ORDER BY hm.is_primary_household DESC, hm.start_date DESC
  LIMIT 1;

  IF _hh IS NULL THEN
    -- Named the way church.register_member_family's screen names one: Ethiopian
    -- naming has no family surname, so "the Bekele household" is not a thing
    -- anybody says, and the family is referred to by the person.
    INSERT INTO church.households
      (organization_id, name, primary_phone, created_by, created_by_name)
    VALUES (_org,
            btrim(coalesce(_parent.first_name, '') || ' ' ||
                  coalesce(_parent.last_name, '')),
            _parent.phone, auth.uid(), _actor)
    RETURNING id INTO _hh;

    INSERT INTO church.household_members
      (organization_id, household_id, person_id, household_role,
       is_primary_contact, is_primary_household)
    VALUES (_org, _hh, _parent_person_id, 'adult', true,
            -- Only claim the primary slot if they do not hold one elsewhere;
            -- uq_household_members_one_primary allows exactly one live row.
            NOT EXISTS (SELECT 1 FROM church.household_members hm2
                        WHERE hm2.person_id = _parent_person_id
                          AND hm2.end_date IS NULL
                          AND hm2.is_primary_household));

    INSERT INTO church.people_history
      (organization_id, person_id, action, actor_id, actor_name, notes)
    VALUES (_org, _parent_person_id, 'admin_update', auth.uid(), _actor,
            'A family record was created for them so a child could be added. '
            'The address and telephone number are still to be filled in.');

    _made := true;
  END IF;

  -- The one path that writes a usable child, reused rather than repeated.
  _child_id := church.add_child_to_household(_hh, _child);

  RETURN QUERY SELECT _child_id, _hh, _made;
END;
$$;

GRANT EXECUTE ON FUNCTION church.add_child_to_person(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION church.add_child_to_person(UUID, JSONB) IS
  'Adds a NEW child to a PERSON, making them a family record first if they '
  'have none, then delegating to church.add_child_to_household so the child '
  'gets everything a Sunday needs: household membership, a parent relationship '
  'and a pickup authorisation from every adult of the family. For members_admin '
  'or that person themselves.';

NOTIFY pgrst, 'reload schema';
