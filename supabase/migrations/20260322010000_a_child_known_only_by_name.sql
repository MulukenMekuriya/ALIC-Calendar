-- =====================================================
-- A child the church knows only by name
-- =====================================================
--
-- church.people has carried CHECK (NOT is_child OR birth_year IS NOT NULL)
-- since 20260320000400, on this reasoning:
--
--     "Classroom placement is impossible without a birthday, so a child
--      record must carry one."
--
-- That was true when it was written. It stopped being true at 20260320002500,
-- which moved the Children's Ministry onto GRADE-based classrooms and gave
-- church.pick_room_for_child a three-tier fallback ending in a comment that
-- says exactly what the ministry believes:
--
--     -- 3. Nothing matched. The child is still placed, because a church does
--     --    not turn a child away at the door — but the reason is recorded so
--     --    the live board shows it and a leader can move them.
--
-- So the database has been refusing to store a child that the check-in desk
-- already knows how to handle. A child with no grade and no birthday is placed
-- in the emptiest open room, tagged "No matching classroom — please check
-- placement", and a leader moves them. Everything downstream already tolerates
-- the gap: church.age_in_months returns NULL without a birthday, so
-- church.age_band_for returns NULL, and both the desk search and the leader
-- roster reach it through a LEFT JOIN.
--
-- WHY THIS MATTERS NOW. The church's Breeze export names 434 children and
-- gives a birthday for none of them — the only rows in that file carrying a
-- birthdate are Breeze's own demo families. Under the old constraint those
-- children could not exist, which meant the Children's Ministry had the
-- parents and the families but nobody to check in. The constraint was not
-- protecting a child; it was keeping 434 of them out of the system that exists
-- to keep track of them on a Sunday morning.
--
-- WHAT IS NOT RELAXED
-- -------------------
--   * is_child still decides everything that matters for safety.
--     church.is_approved_collector authorises a household's adults via
--     `NOT p.is_child`, so a child is still structurally incapable of being
--     recorded as the person who collects another child. That check reads the
--     flag, never the birthday.
--   * The registration form still requires a birth year for a child it is
--     collecting from a family in person (MemberRegistrationPage validates it
--     before submitting), because somebody standing in front of you can be
--     asked. This only stops the DATABASE from refusing records the church
--     already has and cannot complete from memory.
--   * A missing birthday is not silent. church.children_missing_placement()
--     below is the worklist, and the check-in desk labels every such placement.

ALTER TABLE church.people
  DROP CONSTRAINT IF EXISTS chk_people_child_needs_birth;

COMMENT ON COLUMN church.people.birth_year IS
  'Year of birth. NULL is permitted even for a child: the church holds hundreds '
  'of children it knows only by name, and church.pick_room_for_child places '
  'them by grade, then age, then anywhere open rather than turning them away. '
  'church.children_missing_placement() lists the ones still to be completed.';

-- ---------------------------------------------------------------------------
-- insert_person_from_json, no longer refusing a child without a birthday
-- ---------------------------------------------------------------------------
-- Unchanged from 20260320001200 apart from the removed guard.
CREATE OR REPLACE FUNCTION church.insert_person_from_json(
  _organization_id UUID,
  _p JSONB,
  _is_child BOOLEAN,
  _actor_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _id UUID;
  _birth_year SMALLINT := NULLIF(_p->>'birth_year', '')::SMALLINT;
  _birth_month SMALLINT := NULLIF(_p->>'birth_month', '')::SMALLINT;
BEGIN
  -- A child with no birth year is now a record the church is allowed to hold.
  -- The form still asks; the desk still flags the placement.
  INSERT INTO church.people (
    organization_id, first_name, middle_name, last_name, preferred_name,
    amharic_name, birth_year, birth_month, gender, marital_status,
    email, phone, membership_status_id, member_since,
    accepted_lord_year, accepted_lord_month, accepted_lord_is_approximate,
    is_child, school_grade_id, notes, created_by, created_by_name)
  VALUES (
    _organization_id,
    btrim(_p->>'first_name'),
    NULLIF(btrim(coalesce(_p->>'middle_name', '')), ''),
    btrim(_p->>'last_name'),
    NULLIF(btrim(coalesce(_p->>'preferred_name', '')), ''),
    NULLIF(btrim(coalesce(_p->>'amharic_name', '')), ''),
    _birth_year,
    _birth_month,
    NULLIF(_p->>'gender', ''),
    NULLIF(_p->>'marital_status', ''),
    NULLIF(btrim(coalesce(_p->>'email', '')), ''),
    NULLIF(btrim(coalesce(_p->>'phone', '')), ''),
    NULLIF(_p->>'membership_status_id', '')::UUID,
    NULLIF(_p->>'member_since', '')::DATE,
    NULLIF(_p->>'accepted_lord_year', '')::SMALLINT,
    NULLIF(_p->>'accepted_lord_month', '')::SMALLINT,
    coalesce((_p->>'accepted_lord_is_approximate')::BOOLEAN, false),
    _is_child,
    NULLIF(_p->>'school_grade_id', '')::UUID,
    NULLIF(btrim(coalesce(_p->>'notes', '')), ''),
    auth.uid(), _actor_name)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- ---------------------------------------------------------------------------
-- add_child_to_household, likewise
-- ---------------------------------------------------------------------------
-- Unchanged from 20260320011000 apart from the removed guard. Everything that
-- makes the child usable on a Sunday — household membership, a parent
-- relationship from each adult, pickup authorisation for each — is untouched.
CREATE OR REPLACE FUNCTION church.add_child_to_household(
  _household_id UUID,
  _child JSONB
)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _org UUID;
  _actor TEXT;
  _child_id UUID;
  _parent_type UUID;
  _adult RECORD;
  _surname TEXT;
BEGIN
  SELECT h.organization_id INTO _org
  FROM church.households h WHERE h.id = _household_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'household_not_found'; END IF;

  IF NOT church.has_permission_in_org(
       _org, ARRAY['members_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  IF coalesce(btrim(_child->>'first_name'), '') = '' THEN
    RAISE EXCEPTION 'first_name_required';
  END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Administrator');

  SELECT id INTO _parent_type FROM church.relationship_types
   WHERE organization_id = _org AND code = 'parent';

  -- Inherit the family surname, which is what the person adding them expects.
  -- Taken from an adult of this household rather than from the household name,
  -- which is often "The Smiths" or similar.
  SELECT p.last_name INTO _surname
  FROM church.household_members hm
  JOIN church.people p ON p.id = hm.person_id
  WHERE hm.household_id = _household_id AND hm.end_date IS NULL
    AND NOT p.is_child
  ORDER BY hm.is_primary_contact DESC
  LIMIT 1;

  _child_id := church.insert_person_from_json(
    _org,
    _child || jsonb_build_object(
      'last_name',
      coalesce(NULLIF(btrim(coalesce(_child->>'last_name', '')), ''),
               _surname, 'Unknown')),
    true, _actor);

  PERFORM church.set_child_sensitive_from_json(_child_id, _org, _child, _actor);

  INSERT INTO church.household_members
    (organization_id, household_id, person_id, household_role, is_primary_household)
  VALUES (_org, _household_id, _child_id, 'child', true);

  -- Every current adult of the family becomes a parent and an authorised
  -- collector. Without both, the check-in desk would offer nobody for this
  -- child and their own mother could not take them home.
  FOR _adult IN
    SELECT p.id
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = _household_id
      AND hm.end_date IS NULL
      AND NOT p.is_child
      AND p.is_active
  LOOP
    -- One direction only: a trigger mirrors the inverse, and writing both
    -- collides on the uniqueness constraint.
    INSERT INTO church.person_relationships
      (organization_id, person_id, related_person_id, relationship_type_id)
    VALUES (_org, _adult.id, _child_id, _parent_type)
    ON CONFLICT (person_id, related_person_id, relationship_type_id) DO NOTHING;

    INSERT INTO church.kids_pickup_authorizations
      (organization_id, child_person_id, authorized_person_id,
       relationship_note, created_by, created_by_name)
    VALUES (_org, _child_id, _adult.id, 'Parent', auth.uid(), _actor)
    ON CONFLICT (child_person_id, authorized_person_id) DO NOTHING;
  END LOOP;

  RETURN _child_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- The worklist the constraint used to be
-- ---------------------------------------------------------------------------
-- Refusing the record made the gap impossible. Allowing it makes the gap
-- invisible unless something reports it, so something does. This is the list
-- the office works through and the ministry fills in at the desk: which
-- children cannot be placed in a classroom yet, whose family they belong to,
-- and who to ask.
CREATE OR REPLACE FUNCTION church.children_missing_placement(_organization_id UUID)
RETURNS TABLE (
  person_id UUID,
  child_name TEXT,
  household_id UUID,
  household_name TEXT,
  has_birth_year BOOLEAN,
  has_grade BOOLEAN,
  parent_names TEXT,
  parent_phone TEXT,
  parent_email TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT (_organization_id IN (SELECT church.my_admin_orgs())
          OR church.has_permission_in_org(
               _organization_id,
               ARRAY['members_admin', 'members_viewer',
                     'kids_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.first_name || ' ' || c.last_name,
    h.id,
    h.name,
    c.birth_year IS NOT NULL,
    c.school_grade_id IS NOT NULL,
    adults.names,
    adults.phone,
    adults.email
  FROM church.people c
  LEFT JOIN church.household_members hm
         ON hm.person_id = c.id AND hm.end_date IS NULL
  LEFT JOIN church.households h ON h.id = hm.household_id
  LEFT JOIN LATERAL (
    SELECT string_agg(a.first_name || ' ' || a.last_name, ', '
                      ORDER BY a.first_name)      AS names,
           min(a.phone)                            AS phone,
           min(a.email)                            AS email
    FROM church.household_members ahm
    JOIN church.people a ON a.id = ahm.person_id
    WHERE ahm.household_id = hm.household_id
      AND ahm.end_date IS NULL
      AND NOT a.is_child
      AND a.is_active
  ) adults ON true
  WHERE c.organization_id = _organization_id
    AND c.is_child
    AND c.is_active
    AND c.merged_into_person_id IS NULL
    -- A child the desk cannot place by grade is the one that needs a human.
    AND c.school_grade_id IS NULL
  ORDER BY h.name NULLS LAST, c.first_name;
END;
$$;

REVOKE ALL ON FUNCTION church.children_missing_placement(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.children_missing_placement(UUID) TO authenticated;

COMMENT ON FUNCTION church.children_missing_placement(UUID) IS
  'Children who cannot yet be placed in a classroom by grade, with the family '
  'and the parent to ask. Replaces the CHECK constraint that used to make this '
  'state impossible to store — and therefore made 434 real children impossible '
  'to check in.';

NOTIFY pgrst, 'reload schema';
