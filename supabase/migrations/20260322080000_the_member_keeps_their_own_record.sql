-- =====================================================
-- The member keeps their own record
-- =====================================================
--
-- Everything the portal shows a member about their own life in the church is
-- read-only, and the page says so out loud:
--
--     "To change anything here, speak to the church office — a household is
--      shared, so it is not edited from one person's login."
--
-- That sentence is true of WHO is in a household. It is not true of the
-- address on it, of the children in it, or of where the person reading it
-- serves on a Sunday — and a member who has moved house, had a baby or joined
-- the choir currently has to telephone the office so that somebody else can
-- type what they already know. The office is four people and a shared inbox.
--
-- This migration opens four narrow doors, and leaves the walls between them
-- standing. The rule throughout is the one 20260322050000 already settled for
-- family ties: a member may correct FACTS ABOUT THEMSELVES AND THEIR OWN
-- HOUSEHOLD, and may not create authority, remove history, or touch anybody
-- else.
--
-- WHAT A MEMBER MAY NOW CHANGE
-- ----------------------------
--   1. Their household's name, address and telephone number.
--   2. The children of their household: add one, correct one.
--   3. Where they serve: record a ministry, record that they have stopped.
--   4. Which group they are in: join one, leave one.
--
-- WHAT STAYS WITH THE OFFICE, AND WHY
-- -----------------------------------
--   * WHO IS IN THE HOUSEHOLD, apart from children. Adding an adult to a
--     household is not an address change: church.station_pickup_candidates
--     builds the collection screen from the child's household, and
--     church.notify_parents mails that household about check-in. "Add my
--     brother" would therefore hand a third party the right to collect a child
--     and a running commentary on their Sunday. That needs a human at the
--     office, exactly as 20260322050000 concluded for relationships.
--
--   * REMOVING ANYBODY, including a child added by mistake. Removal is how a
--     person quietly detaches themselves from a record that matters — a
--     custody arrangement, a safeguarding note — so it stays where the delete
--     path already is. A wrongly added child is a telephone call; a silently
--     removed one is not discoverable at all.
--
--   * MEDICAL AND CUSTODY DETAIL. church.person_sensitive and
--     church.kids_pickup_restrictions are deliberately untouched here, for the
--     same reason 20260320001100 left them out of self-service: they are read
--     at the check-in desk while a child is standing there, and widening them
--     deserves its own migration and its own argument, not a side-effect of an
--     address form.
--
--   * LEADERSHIP. A member may say they serve; they may not say they lead.
--     church.ministry_roles.is_leadership_role is what the leadership reports
--     filter on (BR-09), so a self-assigned "Leader" would be a person writing
--     themselves into the church's own account of who runs what. The same
--     applies in reverse: a member holding a leadership role cannot resign it
--     from a web form, because other people's records point at it.
--
-- A REVERSAL, STATED PLAINLY
-- --------------------------
-- src/modules/members/services/groupService.ts says, in as many words:
--
--     "an ordinary member cannot add themselves to a group: which cell someone
--      belongs to is the church's record, not a self-service preference"
--
-- That is overturned below, on purpose. It has produced a directory in which
-- the Bible-study rosters are whatever was true at import time, because the
-- only people who can write them are the ones who never attend. A membership a
-- member states about themselves is better evidence than a membership nobody
-- states at all, and church.group_memberships keeps ended rows either way, so
-- the history survives being wrong.

-- ---------------------------------------------------------------------------
-- Am I an adult of this household?
-- ---------------------------------------------------------------------------
-- The boundary for everything in part 1 and part 2. Not "am I in it" — a child
-- with a login is in it, and a child does not edit the family address.
--
-- NOT p.is_child rather than an age test, for the reason 20260320000400 gives
-- for the column existing at all: a safety flag a human sets beats a birthday
-- the church often does not hold.
CREATE OR REPLACE FUNCTION church.i_am_an_adult_of(_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = _household_id
      AND hm.end_date IS NULL
      AND p.profile_id = auth.uid()
      AND p.merged_into_person_id IS NULL
      AND NOT p.is_child
  )
$$;

GRANT EXECUTE ON FUNCTION church.i_am_an_adult_of(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. The household, as an editable thing
-- ---------------------------------------------------------------------------
--
-- church.my_household_members() already lists who is in it. This returns the
-- household ITSELF — the address that goes on a statement, the number the
-- office rings — which the portal has never shown, and says whether the
-- reader may edit it.
--
-- Returns a SET, not a row. Almost every member belongs to one household, but
-- church.my_household_ids() has always been a set (a student living between
-- two families is the case it was written for), and a function that silently
-- picked the first would show one address and save to another.
CREATE OR REPLACE FUNCTION church.my_household_detail()
RETURNS TABLE (
  household_id UUID,
  organization_id UUID,
  name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  primary_phone TEXT,
  i_can_edit BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    h.id,
    h.organization_id,
    h.name,
    h.address_line1,
    h.address_line2,
    h.city,
    h.state,
    h.postal_code,
    h.primary_phone,
    church.i_am_an_adult_of(h.id)
  FROM church.households h
  WHERE h.id IN (SELECT * FROM church.my_household_ids())
  ORDER BY h.name
$$;

GRANT EXECUTE ON FUNCTION church.my_household_detail() TO authenticated;

-- The seven columns a family knows better than the office does.
--
-- notes and is_active are NOT among them. `notes` is where the office writes
-- things about a family that the family is not the author of, and is_active is
-- how a household leaves the directory.
--
-- Refuses the whole patch on an unknown key rather than dropping it, which is
-- the rule church.update_person_details set: a form that quietly discards half
-- its fields teaches people the save button lies.
CREATE OR REPLACE FUNCTION church.update_my_household(
  _household_id UUID,
  _patch JSONB
)
RETURNS church.households
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  h church.households%ROWTYPE;
  _bad TEXT[];
  _allowed TEXT[] := ARRAY[
    'name', 'address_line1', 'address_line2',
    'city', 'state', 'postal_code', 'primary_phone'];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO h FROM church.households WHERE id = _household_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'household_not_found';
  END IF;

  -- The office keeps its existing path through RLS; this is the member one.
  IF NOT (church.i_am_an_adult_of(_household_id)
          OR church.has_permission_in_org(
               h.organization_id,
               ARRAY['members_admin']::church.module_permission[])) THEN
    RAISE EXCEPTION 'not_your_household' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(k) INTO _bad
    FROM jsonb_object_keys(_patch) AS k
   WHERE NOT (k = ANY(_allowed));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_field: %', array_to_string(_bad, ', ');
  END IF;

  IF _patch ? 'name' AND coalesce(btrim(_patch->>'name'), '') = '' THEN
    RAISE EXCEPTION 'household_name_required';
  END IF;

  UPDATE church.households SET
    name = CASE WHEN _patch ? 'name'
                THEN btrim(_patch->>'name') ELSE name END,
    address_line1 = CASE WHEN _patch ? 'address_line1'
                THEN NULLIF(btrim(coalesce(_patch->>'address_line1','')),'') ELSE address_line1 END,
    address_line2 = CASE WHEN _patch ? 'address_line2'
                THEN NULLIF(btrim(coalesce(_patch->>'address_line2','')),'') ELSE address_line2 END,
    city = CASE WHEN _patch ? 'city'
                THEN NULLIF(btrim(coalesce(_patch->>'city','')),'') ELSE city END,
    state = CASE WHEN _patch ? 'state'
                THEN NULLIF(btrim(coalesce(_patch->>'state','')),'') ELSE state END,
    postal_code = CASE WHEN _patch ? 'postal_code'
                THEN NULLIF(btrim(coalesce(_patch->>'postal_code','')),'') ELSE postal_code END,
    primary_phone = CASE WHEN _patch ? 'primary_phone'
                THEN NULLIF(btrim(coalesce(_patch->>'primary_phone','')),'') ELSE primary_phone END,
    updated_at = now()
  WHERE id = _household_id
  RETURNING * INTO h;

  RETURN h;
END;
$$;

GRANT EXECUTE ON FUNCTION church.update_my_household(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION church.update_my_household(UUID, JSONB) IS
  'Name, address and telephone of a household, editable by any adult who lives '
  'in it. Who is IN the household is deliberately not here: adding an adult '
  'changes who may collect a child and who is mailed about check-in.';

-- ---------------------------------------------------------------------------
-- 2. The children of the household
-- ---------------------------------------------------------------------------
--
-- church.add_child_to_household has asserted members_admin since 20260320011000.
-- The only change here is the caller test: members_admin OR an adult of THIS
-- household. Everything the function does afterwards — the person row, the
-- household membership, a parent relationship from every adult, a pickup
-- authorisation for every adult, the allergy record — is byte-for-byte what it
-- did before, because that work is what makes a child usable on a Sunday and
-- it must not fork into a member version and an office version.
--
-- WHY A PARENT MAY DO THIS AT ALL, when they may not add an adult.
-- The church already lets a family state its own children: 20260321000300's
-- station_register_visitor_family takes a walk-up family at the check-in desk
-- and writes exactly these rows from what a parent types on a kiosk, with no
-- office in the loop. A parent naming their own child in the portal is the
-- same act, done at home instead of in a queue on Sunday morning. What it
-- cannot do is name somebody else's child into their household: the new person
-- is CREATED by this call, so there is no existing record to capture.
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

  -- THE ONE CHANGE from 20260322010000.
  IF NOT (church.has_permission_in_org(
            _org, ARRAY['members_admin']::church.module_permission[])
          OR church.i_am_an_adult_of(_household_id)) THEN
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

GRANT EXECUTE ON FUNCTION church.add_child_to_household(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION church.add_child_to_household(UUID, JSONB) IS
  'Adds a NEW child to an existing family, doing everything registration does '
  'per child: person, household membership, a parent relationship from each '
  'adult, pickup authorisation for each, and any allergy record. Callable by '
  'members_admin, or by any adult of that household from My Church.';

-- Correcting a child already on the record.
--
-- A SEPARATE FUNCTION rather than a branch inside update_person_details,
-- because the field list is genuinely different and shorter. That function's
-- open list includes membership_status_id, member_since and the date somebody
-- accepted the Lord — statements about a person's standing in the church,
-- which a parent does not make on a child's behalf through a web form. What is
-- here is the set a parent is simply the better source for: what the child is
-- called, when they were born, and which grade they are in this year.
--
-- school_grade_id matters most of the three. It is admin-only in
-- update_person_details, and it is also what church.pick_room_for_child reads
-- first when placing a child in a classroom — so a grade nobody updated in
-- September is a five-year-old sent to the room they sat in last year.
CREATE OR REPLACE FUNCTION church.update_my_child(
  _child_id UUID,
  _patch JSONB
)
RETURNS church.people
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  p       church.people%ROWTYPE;
  _before church.people%ROWTYPE;
  _actor  TEXT;
  _bad    TEXT[];
  _allowed TEXT[] := ARRAY[
    'first_name', 'middle_name', 'last_name', 'preferred_name', 'amharic_name',
    'birth_year', 'birth_month', 'gender', 'school_grade_id'];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _before FROM church.people
   WHERE id = _child_id AND merged_into_person_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  IF NOT _before.is_child THEN
    RAISE EXCEPTION 'members_may_only_edit_their_children'
      USING ERRCODE = '42501',
            HINT = 'An adult edits their own record from My details.';
  END IF;

  -- The same boundary church.assert_family_editor draws: the child must be in
  -- a household the caller is an adult of. A child can live in two households,
  -- and either set of parents may correct their name.
  IF NOT EXISTS (
    SELECT 1
    FROM church.household_members hm
    WHERE hm.person_id = _child_id
      AND hm.end_date IS NULL
      AND church.i_am_an_adult_of(hm.household_id)
  ) THEN
    RAISE EXCEPTION 'child_not_in_your_household' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(k) INTO _bad
    FROM jsonb_object_keys(_patch) AS k
   WHERE NOT (k = ANY(_allowed));
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_field: %', array_to_string(_bad, ', ');
  END IF;

  IF _patch ? 'first_name' AND coalesce(btrim(_patch->>'first_name'), '') = '' THEN
    RAISE EXCEPTION 'first_name_required';
  END IF;
  IF _patch ? 'last_name' AND coalesce(btrim(_patch->>'last_name'), '') = '' THEN
    RAISE EXCEPTION 'last_name_required';
  END IF;

  IF _patch ? 'school_grade_id'
     AND NULLIF(btrim(coalesce(_patch->>'school_grade_id', '')), '') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM church.school_grades g
        WHERE g.id = (_patch->>'school_grade_id')::UUID
          AND g.organization_id = _before.organization_id) THEN
    RAISE EXCEPTION 'grade_belongs_to_another_branch';
  END IF;

  UPDATE church.people SET
    first_name = CASE WHEN _patch ? 'first_name'
                      THEN btrim(_patch->>'first_name') ELSE first_name END,
    middle_name = CASE WHEN _patch ? 'middle_name'
                      THEN NULLIF(btrim(coalesce(_patch->>'middle_name','')),'') ELSE middle_name END,
    last_name = CASE WHEN _patch ? 'last_name'
                      THEN btrim(_patch->>'last_name') ELSE last_name END,
    preferred_name = CASE WHEN _patch ? 'preferred_name'
                      THEN NULLIF(btrim(coalesce(_patch->>'preferred_name','')),'') ELSE preferred_name END,
    amharic_name = CASE WHEN _patch ? 'amharic_name'
                      THEN NULLIF(btrim(coalesce(_patch->>'amharic_name','')),'') ELSE amharic_name END,
    birth_year = CASE WHEN _patch ? 'birth_year'
                      THEN NULLIF(_patch->>'birth_year','')::SMALLINT ELSE birth_year END,
    birth_month = CASE WHEN _patch ? 'birth_month'
                      THEN NULLIF(_patch->>'birth_month','')::SMALLINT ELSE birth_month END,
    gender = CASE WHEN _patch ? 'gender'
                      THEN NULLIF(btrim(coalesce(_patch->>'gender','')),'') ELSE gender END,
    school_grade_id = CASE WHEN _patch ? 'school_grade_id'
                      THEN NULLIF(_patch->>'school_grade_id','')::UUID ELSE school_grade_id END,
    updated_at = now()
  WHERE id = _child_id
  RETURNING * INTO p;

  -- Recorded like every other edit to a person, with the old and the new
  -- value. 'parent_update' is its own action rather than borrowing
  -- 'self_update': the office reading this history needs to see that the
  -- change came from a parent's login and not from the child's own, because
  -- children do not have logins and a row claiming otherwise would be a
  -- question nobody could answer.
  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    'Unknown');

  INSERT INTO church.people_history (
    organization_id, person_id, action, field_name, old_value, new_value,
    actor_id, actor_name, notes)
  SELECT p.organization_id, p.id, 'parent_update',
         d.field, d.old_value, d.new_value,
         auth.uid(), _actor,
         'Updated by a parent from My Church'
  FROM church.person_field_diff(_before, p, _patch) d;

  RETURN p;
END;
$$;

GRANT EXECUTE ON FUNCTION church.update_my_child(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION church.update_my_child(UUID, JSONB) IS
  'Name, birthday, gender and school grade of a child in the caller''s own '
  'household. Not medical detail, not custody, not membership standing - see '
  'the header of 20260322080000 for why each is excluded.';

-- ---------------------------------------------------------------------------
-- The role a member may give themselves
-- ---------------------------------------------------------------------------
-- One helper for both ministries and groups, so the two cannot drift into
-- disagreeing about what "not leadership" means. Prefers a named code and
-- falls back to the lowest-sorted ordinary role, which keeps working in a
-- branch whose reference table someone has renamed.
CREATE OR REPLACE FUNCTION church.non_leadership_role(
  _organization_id UUID,
  _preferred_code TEXT
)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT r.id
  FROM church.ministry_roles r
  WHERE r.organization_id = _organization_id
    AND r.is_active
    AND NOT r.is_leadership_role
  ORDER BY (r.code = _preferred_code) DESC, r.sort_order, r.display_name
  LIMIT 1
$$;

-- The caller's person row in one branch, or an error naming the reason.
-- Every write below needs it, and every one of them wants the same message
-- when a login has never been linked to a member record.
CREATE OR REPLACE FUNCTION church.my_person_in_org(_organization_id UUID)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _person UUID;
BEGIN
  SELECT p.id INTO _person
  FROM church.people p
  WHERE p.profile_id = auth.uid()
    AND p.organization_id = _organization_id
    AND p.merged_into_person_id IS NULL
  LIMIT 1;

  IF _person IS NULL THEN
    RAISE EXCEPTION 'no_member_record_for_this_login' USING ERRCODE = '42501';
  END IF;

  RETURN _person;
END;
$$;

GRANT EXECUTE ON FUNCTION church.non_leadership_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.my_person_in_org(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Where I serve
-- ---------------------------------------------------------------------------
--
-- The picker. budget.ministries is shut to a member by a RESTRICTIVE policy
-- ("Members cannot reach ministries without a grant", 20260321001600), which
-- is right for the church's cost centres and wrong for the four words naming
-- where this member turns up on a Sunday — the same reasoning church.my_serving
-- already rests on.
--
-- is_serving_ministry IS filtered here, unlike in my_serving. The distinction
-- is the one 20260322030000 drew: the flag governs where a person may be
-- PLACED, so it belongs on the list of places to choose from, and not on the
-- list of places somebody already is.
CREATE OR REPLACE FUNCTION church.my_ministry_options(_organization_id UUID)
RETURNS TABLE (
  ministry_id UUID,
  name TEXT,
  already_serving BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    m.id,
    m.name,
    EXISTS (
      SELECT 1 FROM church.ministry_assignments ma
      WHERE ma.ministry_id = m.id
        AND ma.end_date IS NULL
        AND ma.person_id IN (SELECT * FROM church.my_person_ids()))
  FROM budget.ministries m
  WHERE m.organization_id = _organization_id
    AND _organization_id IN (SELECT * FROM church.my_orgs())
    AND m.is_active
    AND m.is_serving_ministry
  ORDER BY m.name
$$;

GRANT EXECUTE ON FUNCTION church.my_ministry_options(UUID) TO authenticated;

-- "I serve in the choir."
--
-- The role is chosen by the database, never passed in. That is the whole
-- safety property of this function: whatever the browser sends, the row that
-- lands carries an ordinary serving role, so no member can write themselves
-- into the leadership reports. See the header.
CREATE OR REPLACE FUNCTION church.join_ministry(_ministry_id UUID)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _org    UUID;
  _person UUID;
  _role   UUID;
  _id     UUID;
BEGIN
  SELECT m.organization_id INTO _org
  FROM budget.ministries m
  WHERE m.id = _ministry_id AND m.is_active AND m.is_serving_ministry;

  IF _org IS NULL THEN
    RAISE EXCEPTION 'ministry_not_open_for_serving';
  END IF;

  IF _org NOT IN (SELECT * FROM church.my_orgs()) THEN
    RAISE EXCEPTION 'not_your_branch' USING ERRCODE = '42501';
  END IF;

  _person := church.my_person_in_org(_org);

  -- Already there. Returning the existing row rather than raising, because
  -- two taps on a slow connection is not an error the member should have to
  -- read a message about.
  SELECT ma.id INTO _id
  FROM church.ministry_assignments ma
  WHERE ma.person_id = _person
    AND ma.ministry_id = _ministry_id
    AND ma.end_date IS NULL
  LIMIT 1;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  _role := church.non_leadership_role(_org, 'volunteer');
  IF _role IS NULL THEN
    RAISE EXCEPTION 'no_serving_role_configured_for_this_branch';
  END IF;

  BEGIN
    INSERT INTO church.ministry_assignments
      (organization_id, person_id, ministry_id, ministry_role_id,
       created_by, created_by_name, notes)
    VALUES (_org, _person, _ministry_id, _role, auth.uid(),
            coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid()),
                     'Member'),
            'Recorded by the member from My Church')
    RETURNING id INTO _id;
  EXCEPTION
    -- no_overlapping_ministry_assignment. Reachable when the member stepped
    -- out of this ministry today and stepped back in on the same day: the
    -- ended row still covers today, so the new one overlaps it.
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'already_recorded_in_this_ministry_today'
        USING HINT = 'The record already covers today. Try again tomorrow, or ask the office.';
  END;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.join_ministry(UUID) TO authenticated;

-- "I have stopped serving there."
--
-- Ended, never deleted (BR-11): somebody who led worship for six years should
-- still read that way afterwards. The row simply drops off my_serving, which
-- asks for current service.
--
-- A LEADERSHIP ROLE CANNOT BE ENDED HERE. Not because stepping down is
-- forbidden — people step down — but because it is not a fact about one person:
-- the ministry loses its leader the moment the row closes, and the office finds
-- out when a report changes. That conversation happens with a human.
CREATE OR REPLACE FUNCTION church.leave_ministry(_assignment_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _is_leadership BOOLEAN;
BEGIN
  SELECT r.is_leadership_role INTO _is_leadership
  FROM church.ministry_assignments ma
  JOIN church.ministry_roles r ON r.id = ma.ministry_role_id
  WHERE ma.id = _assignment_id
    AND ma.end_date IS NULL
    AND ma.person_id IN (SELECT * FROM church.my_person_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_your_assignment' USING ERRCODE = '42501';
  END IF;

  IF _is_leadership THEN
    RAISE EXCEPTION 'ask_the_office_to_end_a_leadership_role'
      USING ERRCODE = '42501',
            HINT = 'A ministry losing its leader is not a change one form should make quietly.';
  END IF;

  UPDATE church.ministry_assignments
     SET end_date = CURRENT_DATE, updated_at = now()
   WHERE id = _assignment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.leave_ministry(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. The group I am in
-- ---------------------------------------------------------------------------
--
-- Every active group in the branch, so a member can find one. This is the
-- first time a member has been able to see a group they do not already belong
-- to: the permissive policy from 20260320001100 shows them only their own.
--
-- WHAT IS WITHHELD, AND IT IS DELIBERATE. groups.location is free text and in
-- this church it is usually a family's home address — "the Alemus', 4412
-- Colesville Rd". That is shared with the people who attend, not published to
-- the whole congregation from a browsable list. So the browse list carries the
-- ROOM name, which is a room in this building, and church.my_groups() carries
-- the location once you are in the group. A member who wants the address of a
-- cell they have not joined asks, which is how they would have found out
-- anyway.
CREATE OR REPLACE FUNCTION church.my_group_options(_organization_id UUID)
RETURNS TABLE (
  group_id UUID,
  name TEXT,
  group_type TEXT,
  description TEXT,
  meeting_day TEXT,
  meeting_time TIME,
  room_name TEXT,
  member_count BIGINT,
  already_member BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT
    g.id,
    g.name,
    gt.display_name,
    g.description,
    g.meeting_day,
    g.meeting_time,
    rm.name,
    (SELECT count(*) FROM church.group_memberships gm2
      WHERE gm2.group_id = g.id AND gm2.end_date IS NULL),
    EXISTS (
      SELECT 1 FROM church.group_memberships gm
      WHERE gm.group_id = g.id
        AND gm.end_date IS NULL
        AND gm.person_id IN (SELECT * FROM church.my_person_ids()))
  FROM church.groups g
  JOIN church.group_types gt ON gt.id = g.group_type_id
  LEFT JOIN public.rooms rm ON rm.id = g.room_id
  WHERE g.organization_id = _organization_id
    AND _organization_id IN (SELECT * FROM church.my_orgs())
    AND g.is_active
  ORDER BY g.name
$$;

GRANT EXECUTE ON FUNCTION church.my_group_options(UUID) TO authenticated;

-- Joining, with the role picked by the database for the same reason as above.
CREATE OR REPLACE FUNCTION church.join_group(_group_id UUID)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _org    UUID;
  _person UUID;
  _role   UUID;
  _id     UUID;
BEGIN
  SELECT g.organization_id INTO _org
  FROM church.groups g WHERE g.id = _group_id AND g.is_active;

  IF _org IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF _org NOT IN (SELECT * FROM church.my_orgs()) THEN
    RAISE EXCEPTION 'not_your_branch' USING ERRCODE = '42501';
  END IF;

  _person := church.my_person_in_org(_org);

  SELECT gm.id INTO _id
  FROM church.group_memberships gm
  WHERE gm.person_id = _person AND gm.group_id = _group_id AND gm.end_date IS NULL
  LIMIT 1;
  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  _role := church.non_leadership_role(_org, 'member');
  IF _role IS NULL THEN
    RAISE EXCEPTION 'no_serving_role_configured_for_this_branch';
  END IF;

  BEGIN
    INSERT INTO church.group_memberships
      (organization_id, group_id, person_id, role_id, notes)
    VALUES (_org, _group_id, _person, _role,
            'Joined by the member from My Church')
    RETURNING id INTO _id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'already_recorded_in_this_group_today'
        USING HINT = 'The record already covers today. Try again tomorrow, or ask the office.';
  END;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.join_group(UUID) TO authenticated;

-- Leaving. Ended rather than deleted, so "who was in this cell last year"
-- survives; leadership reserved to the office, as with a ministry.
CREATE OR REPLACE FUNCTION church.leave_group(_membership_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _is_leadership BOOLEAN;
BEGIN
  SELECT r.is_leadership_role INTO _is_leadership
  FROM church.group_memberships gm
  JOIN church.ministry_roles r ON r.id = gm.role_id
  WHERE gm.id = _membership_id
    AND gm.end_date IS NULL
    AND gm.person_id IN (SELECT * FROM church.my_person_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_your_membership' USING ERRCODE = '42501';
  END IF;

  IF _is_leadership THEN
    RAISE EXCEPTION 'ask_the_office_to_end_a_leadership_role'
      USING ERRCODE = '42501',
            HINT = 'A group losing its leader is not a change one form should make quietly.';
  END IF;

  UPDATE church.group_memberships
     SET end_date = CURRENT_DATE, updated_at = now()
   WHERE id = _membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.leave_group(UUID) TO authenticated;

COMMENT ON FUNCTION church.join_group(UUID) IS
  'A member records the group they attend. Reverses the position stated in '
  'groupService.ts - see the header of 20260322080000. The role is chosen by '
  'this function, never passed in, so nobody can join as a leader.';

-- ---------------------------------------------------------------------------
-- my_children, carrying the parts a form has to edit
-- ---------------------------------------------------------------------------
--
-- It returned a display name and the NAME of a grade, which is everything a
-- table needs and nothing a form can use: "Selam One" cannot be split back
-- into a first and a last name once a child has two of either, and a grade
-- name cannot be posted back to a column that holds an id.
--
-- DROP then CREATE, not CREATE OR REPLACE: Postgres will not let a replace
-- change a function's return type. Both statements are in this one file and
-- therefore one transaction, so there is no moment when the function is
-- missing — the same reasoning 20260322070000 wrote down for
-- my_household_members.
DROP FUNCTION IF EXISTS church.my_children();

CREATE FUNCTION church.my_children()
RETURNS TABLE (
  person_id UUID,
  organization_id UUID,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  preferred_name TEXT,
  birth_year SMALLINT,
  birth_month SMALLINT,
  grade_name TEXT,
  school_grade_id UUID,
  household_id UUID,
  household_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT DISTINCT
    p.id,
    p.organization_id,
    trim(p.first_name || ' ' || p.last_name),
    p.first_name,
    p.last_name,
    p.preferred_name,
    p.birth_year,
    p.birth_month,
    g.display_name,
    p.school_grade_id,
    hm.household_id,
    h.name
  FROM church.household_members hm
  JOIN church.people p
    ON p.id = hm.person_id
   AND p.is_child
   AND p.merged_into_person_id IS NULL
  JOIN church.households h ON h.id = hm.household_id
  LEFT JOIN church.school_grades g ON g.id = p.school_grade_id
  WHERE hm.household_id IN (SELECT * FROM church.my_household_ids())
    AND hm.end_date IS NULL
  ORDER BY 3
$$;

GRANT EXECUTE ON FUNCTION church.my_children() TO authenticated;

NOTIFY pgrst, 'reload schema';
