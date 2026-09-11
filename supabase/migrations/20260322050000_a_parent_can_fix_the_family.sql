-- =====================================================
-- A family record the office — and a parent — can fix
-- =====================================================
--
-- The Family tab has been read-only since 20260320000400. Relationships are
-- written by the import, by station_register_visitor_family and by
-- add_child_to_household, and after that nothing in the app can touch them.
-- The import's output makes the cost obvious: a single member can carry four
-- "Parent" rows naming two children, because the same two kids arrived under
-- two surname spellings and nobody could remove either pair.
--
-- Two callers get an edit path here, and they are deliberately not the same
-- size.
--
--   AN ADMIN (members_admin) edits any relationship on any record in the
--   branch. The RLS policies from 20260320000400 already allow this; what was
--   missing was a screen and a safe delete.
--
--   A MEMBER edits THEIR OWN CHILDREN and nothing else. Not their spouse, not
--   their siblings, not an arbitrary person in the directory, and they cannot
--   delete. The reason is below.
--
-- WHY A MEMBER MAY NOT SIMPLY NAME ANYONE
-- ---------------------------------------
-- A relationship row is not only a label. Two things read it as authority:
--
--   * relationship_types.implies_guardianship is true for 'parent' and
--     'guardian', and church.station_pickup_candidates uses it to set the
--     is_guardian / custody flag the check-in desk shows when a child is
--     collected.
--
--   * church.notify_parents (20260320001600) includes recorded parents and
--     guardians ACROSS HOUSEHOLDS in the recipient set. A self-declared
--     "I am the parent of <child>" would therefore opt a stranger into the
--     check-in and check-out messages for another family's child, naming them.
--
-- Neither of those is pickup authority by itself — station_pickup_candidates
-- builds its list from the child's HOUSEHOLD plus explicit
-- kids_pickup_authorizations rows, so a bare relationship cannot put a name on
-- the collection screen. But "a stranger starts receiving SMS about your
-- child" is harm enough on its own.
--
-- So the member path is contained by household: the child must already be in a
-- household the caller belongs to, which means the caller was already a pickup
-- candidate and already a notification recipient for that child. The member is
-- correcting how an existing tie is described, never inventing a new one.
--
-- DELETE IS ADMIN-ONLY, BY REQUEST.
-- A member can add a missing child and correct a wrong relationship type; they
-- cannot remove a row. Removing is how a person would quietly detach
-- themselves from a record that matters — a custody arrangement, a safeguarding
-- note — so it stays with the office.

-- ---------------------------------------------------------------------------
-- First, the mirror has to survive an edit
-- ---------------------------------------------------------------------------
--
-- church.mirror_person_relationship is an AFTER INSERT trigger and only that.
-- It has therefore been correct exactly as long as nothing ever changed or
-- removed a row — which was true while the table was append-only, and stops
-- being true on the next line of this file.
--
-- Without this, deleting "Abayneh is parent of Yididia" leaves "Yididia is
-- child of Abayneh" standing, and the two screens that read from opposite ends
-- disagree permanently. Changing a type is worse: the row says Guardian and
-- its mirror still says Child-of-a-Parent.
--
-- The depth guard is what stops the cure becoming the disease. Maintaining the
-- mirror re-enters this same trigger; anything at depth > 1 is this function's
-- own writes, not a second edit that needs propagating.
CREATE OR REPLACE FUNCTION church.sync_person_relationship_mirror()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _old_inverse UUID;
  _new_inverse UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT inv.id INTO _old_inverse
  FROM church.relationship_types rt
  JOIN church.relationship_types inv
    ON inv.code = rt.inverse_code
   AND inv.organization_id = rt.organization_id
  WHERE rt.id = OLD.relationship_type_id;

  -- No inverse configured: the INSERT trigger never made a mirror for this
  -- row, so there is nothing to keep in step.
  IF _old_inverse IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM church.person_relationships
     WHERE person_id = OLD.related_person_id
       AND related_person_id = OLD.person_id
       AND relationship_type_id = _old_inverse;
    RETURN OLD;
  END IF;

  SELECT inv.id INTO _new_inverse
  FROM church.relationship_types rt
  JOIN church.relationship_types inv
    ON inv.code = rt.inverse_code
   AND inv.organization_id = rt.organization_id
  WHERE rt.id = NEW.relationship_type_id;

  -- Replaced rather than updated in place. The uniqueness constraint is
  -- (person_id, related_person_id, relationship_type_id), so moving the mirror
  -- onto a new type can collide with a row that already exists; delete-then-
  -- insert lets ON CONFLICT absorb that instead of raising at the member.
  DELETE FROM church.person_relationships
   WHERE person_id = OLD.related_person_id
     AND related_person_id = OLD.person_id
     AND relationship_type_id = _old_inverse;

  IF _new_inverse IS NOT NULL THEN
    INSERT INTO church.person_relationships
      (organization_id, person_id, related_person_id, relationship_type_id,
       is_mirrored, start_date, end_date, notes)
    VALUES
      (NEW.organization_id, NEW.related_person_id, NEW.person_id, _new_inverse,
       true, NEW.start_date, NEW.end_date, NEW.notes)
    ON CONFLICT (person_id, related_person_id, relationship_type_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION church.sync_person_relationship_mirror() IS
  'Keeps the mirrored inverse of a relationship in step when the human-authored '
  'row is changed or removed. The AFTER INSERT trigger from 20260320000400 '
  'covers creation; this covers the other two, which nothing did before '
  '20260322050000 because the table was append-only in practice.';

DROP TRIGGER IF EXISTS sync_person_relationship_on_update ON church.person_relationships;
CREATE TRIGGER sync_person_relationship_on_update
  AFTER UPDATE OF relationship_type_id, start_date, end_date, notes
  ON church.person_relationships
  FOR EACH ROW EXECUTE FUNCTION church.sync_person_relationship_mirror();

DROP TRIGGER IF EXISTS sync_person_relationship_on_delete ON church.person_relationships;
CREATE TRIGGER sync_person_relationship_on_delete
  AFTER DELETE ON church.person_relationships
  FOR EACH ROW EXECUTE FUNCTION church.sync_person_relationship_mirror();

-- ---------------------------------------------------------------------------
-- Who may edit this tie
-- ---------------------------------------------------------------------------
-- Returns the organization so callers do not fetch the rows twice, and raises
-- rather than returning false: every caller below treats a refusal as fatal,
-- and a boolean that someone forgets to check is the shape of the next bug.
CREATE OR REPLACE FUNCTION church.assert_family_editor(
  _person_id UUID,
  _related_person_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _org UUID;
  _related_is_child BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.organization_id INTO _org
  FROM church.people p
  WHERE p.id = _person_id AND p.merged_into_person_id IS NULL;

  IF _org IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  -- Both people must sit in the same branch. The composite foreign keys on
  -- person_relationships already guarantee this for a stored row; checking it
  -- here means the caller gets a comprehensible error rather than a constraint
  -- violation, and that a cross-branch id cannot be used to probe for
  -- existence.
  IF NOT EXISTS (
    SELECT 1 FROM church.people p
     WHERE p.id = _related_person_id
       AND p.organization_id = _org
       AND p.merged_into_person_id IS NULL
  ) THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  -- The office: anything in the branch.
  IF church.has_permission_in_org(
       _org, ARRAY['members_admin']::church.module_permission[]) THEN
    RETURN _org;
  END IF;

  -- A member: only from their own record, and only towards a child who is
  -- already in a household they belong to. See the header for why the
  -- household is the boundary and not, say, "any child".
  IF NOT EXISTS (
    SELECT 1 FROM church.people p
     WHERE p.id = _person_id AND p.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT p.is_child INTO _related_is_child
  FROM church.people p WHERE p.id = _related_person_id;

  IF NOT coalesce(_related_is_child, false) THEN
    RAISE EXCEPTION 'members_may_only_edit_their_children'
      USING ERRCODE = '42501',
            HINT = 'Ask the office to change a relationship to another adult.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM church.household_members hm
    WHERE hm.person_id = _related_person_id
      AND hm.end_date IS NULL
      AND hm.household_id IN (SELECT * FROM church.my_household_ids())
  ) THEN
    RAISE EXCEPTION 'child_not_in_your_household'
      USING ERRCODE = '42501',
            HINT = 'Ask the office to add the child to your household first.';
  END IF;

  RETURN _org;
END;
$$;

GRANT EXECUTE ON FUNCTION church.assert_family_editor(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Add a tie, or correct the one that is there
-- ---------------------------------------------------------------------------
-- One function for both because "add" and "change the type" are the same
-- intent expressed twice — the pair of people is the identity of the tie, and
-- the type is the part being stated. Written as delete-then-insert for the
-- same uniqueness reason the mirror is.
CREATE OR REPLACE FUNCTION church.set_person_relationship(
  _person_id UUID,
  _related_person_id UUID,
  _relationship_type_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _org UUID;
  _code TEXT;
  _is_admin BOOLEAN;
  _id UUID;
BEGIN
  IF _person_id = _related_person_id THEN
    RAISE EXCEPTION 'cannot_relate_a_person_to_themselves';
  END IF;

  _org := church.assert_family_editor(_person_id, _related_person_id);

  SELECT rt.code INTO _code
  FROM church.relationship_types rt
  WHERE rt.id = _relationship_type_id
    AND rt.organization_id = _org
    AND rt.is_active;

  IF _code IS NULL THEN
    RAISE EXCEPTION 'relationship_type_not_found';
  END IF;

  _is_admin := church.has_permission_in_org(
    _org, ARRAY['members_admin']::church.module_permission[]);

  -- A member describes how they stand towards their own child, so the only
  -- two types that mean anything on that path are the two that name an adult's
  -- role. 'child' from a parent's record would be backwards, and 'spouse' or
  -- 'sibling' towards a child is the kind of row that should have a second
  -- pair of eyes on it.
  IF NOT _is_admin AND _code NOT IN ('parent', 'guardian') THEN
    RAISE EXCEPTION 'members_may_only_set_parent_or_guardian'
      USING ERRCODE = '42501';
  END IF;

  -- Clear whatever type this pair currently carries, in the stated direction.
  -- The delete trigger above takes the mirror with it.
  DELETE FROM church.person_relationships
   WHERE person_id = _person_id
     AND related_person_id = _related_person_id;

  INSERT INTO church.person_relationships
    (organization_id, person_id, related_person_id, relationship_type_id)
  VALUES (_org, _person_id, _related_person_id, _relationship_type_id)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.set_person_relationship(UUID, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION church.set_person_relationship(UUID, UUID, UUID) IS
  'Record or correct one family tie, stated from _person_id towards '
  '_related_person_id. members_admin may state any type between any two people '
  'in the branch; a member may only state parent or guardian, only from their '
  'own record, and only towards a child already in their household.';

-- ---------------------------------------------------------------------------
-- Removing one
-- ---------------------------------------------------------------------------
-- members_admin rather than org admin, which WIDENS what 20260320000400
-- allowed: its DELETE policy names my_admin_orgs(). That policy was written in
-- a loop that also covered church.people, where the caution belongs — SEC-004
-- says a person is deactivated, never deleted. A relationship is not a person.
-- Striking one of the four duplicate "Parent" rows the import produced is
-- ordinary directory maintenance, and routing it through the org's owner makes
-- the office wait on someone who has no idea which of the two Yididias is real.
--
-- The row is removed outright rather than end-dated. An end_date would keep it
-- in the table where every reader already filters end_date IS NULL, which is
-- indistinguishable from deletion everywhere except the one place it matters:
-- a duplicate would still be sitting there the next time somebody looked.
CREATE OR REPLACE FUNCTION church.delete_person_relationship(_relationship_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  r church.person_relationships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO r FROM church.person_relationships WHERE id = _relationship_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT church.has_permission_in_org(
       r.organization_id, ARRAY['members_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  -- Always delete from the human-authored side, so the trigger has a mirror to
  -- find. Handed the mirror row, it would delete that one and leave the
  -- original — the exact asymmetry this migration exists to close.
  IF r.is_mirrored THEN
    DELETE FROM church.person_relationships
     WHERE person_id = r.related_person_id
       AND related_person_id = r.person_id
       AND NOT is_mirrored;
    -- Belt and braces: if no human-authored counterpart existed, the mirror is
    -- an orphan from before this migration and goes on its own.
    DELETE FROM church.person_relationships WHERE id = _relationship_id;
  ELSE
    DELETE FROM church.person_relationships WHERE id = _relationship_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION church.delete_person_relationship(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Who this person can be linked to
-- ---------------------------------------------------------------------------
-- The picker needs names, and names live behind the members module's RLS. A
-- member holds no module grant at all, so without a definer function their
-- "add my child" dropdown is empty — the same failure that
-- church.donation_defaults hit in 20260322000200.
--
-- Returns exactly what the two callers may act on, so the screen cannot offer
-- a choice the write would then refuse: everyone in the branch for an admin,
-- and the children of the caller's own households for a member.
CREATE OR REPLACE FUNCTION church.family_link_candidates(
  _person_id UUID,
  _search TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  is_child BOOLEAN,
  household_name TEXT,
  already_related BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _org UUID;
  _is_admin BOOLEAN;
  _q TEXT := NULLIF(btrim(coalesce(_search, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.organization_id INTO _org
  FROM church.people p WHERE p.id = _person_id;
  IF _org IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  _is_admin := church.has_permission_in_org(
    _org, ARRAY['members_admin']::church.module_permission[]);

  IF NOT _is_admin AND NOT EXISTS (
    SELECT 1 FROM church.people p
     WHERE p.id = _person_id AND p.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.first_name,
         p.last_name,
         p.is_child,
         h.name AS household_name,
         EXISTS (
           SELECT 1 FROM church.person_relationships r
            WHERE r.person_id = _person_id
              AND r.related_person_id = p.id
         ) AS already_related
  FROM church.people p
  LEFT JOIN church.household_members hm
    ON hm.person_id = p.id AND hm.end_date IS NULL
  LEFT JOIN church.households h ON h.id = hm.household_id
  WHERE p.organization_id = _org
    AND p.id <> _person_id
    AND p.is_active
    AND p.merged_into_person_id IS NULL
    AND (
      _is_admin
      OR (p.is_child
          AND hm.household_id IN (SELECT * FROM church.my_household_ids()))
    )
    AND (
      _q IS NULL
      OR p.first_name ILIKE '%' || _q || '%'
      OR p.last_name  ILIKE '%' || _q || '%'
    )
  ORDER BY p.is_child DESC, p.first_name, p.last_name
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION church.family_link_candidates(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- A parent adding a child who is simply not in the system
-- ---------------------------------------------------------------------------
-- add_child_to_household has been members_admin-only since 20260320011000.
-- Widened to also accept an active adult OF THAT HOUSEHOLD, which is the whole
-- of the member path: a mother adding her own new baby to her own family.
--
-- Everything the function already does is what makes this safe to open up. It
-- writes the child into one named household, makes every current adult of that
-- household a parent and an authorised collector, and touches nothing outside
-- it. A member calling it can therefore only produce a child who belongs to
-- them, which is the same row the office would have typed.
--
-- The body is unchanged from 20260322010000 apart from the permission block.
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
       _org, ARRAY['members_admin']::church.module_permission[])
     AND NOT EXISTS (
       SELECT 1
       FROM church.household_members hm
       JOIN church.people p ON p.id = hm.person_id
       WHERE hm.household_id = _household_id
         AND hm.end_date IS NULL
         AND NOT p.is_child
         AND p.is_active
         AND p.profile_id = auth.uid()
     ) THEN
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

COMMENT ON FUNCTION church.add_child_to_household(UUID, JSONB) IS
  'Create a child and place them in one household, making every current adult '
  'of it a parent and an authorised collector. Callable by members_admin, or '
  'by an active adult of that same household adding their own child.';

-- ---------------------------------------------------------------------------
-- The member''s own family, for the portal
-- ---------------------------------------------------------------------------
-- church.my_children (20260322000600) answers "who are my children" from the
-- HOUSEHOLD. This answers "what does the record say about how we are related",
-- which is the thing being edited, and carries the relationship row's id so the
-- screen can act on it.
CREATE OR REPLACE FUNCTION church.my_family()
RETURNS TABLE (
  relationship_id UUID,
  person_id UUID,
  related_person_id UUID,
  first_name TEXT,
  last_name TEXT,
  is_child BOOLEAN,
  relationship_code TEXT,
  relationship_name TEXT,
  editable BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT r.id,
         r.person_id,
         r.related_person_id,
         p.first_name,
         p.last_name,
         p.is_child,
         rt.code,
         rt.display_name,
         -- Mirrors assert_family_editor's member branch exactly, so the screen
         -- greys out precisely what the write would refuse.
         (p.is_child AND rt.code IN ('parent', 'guardian') AND EXISTS (
            SELECT 1 FROM church.household_members hm
             WHERE hm.person_id = p.id
               AND hm.end_date IS NULL
               AND hm.household_id IN (SELECT * FROM church.my_household_ids())
         )) AS editable
  FROM church.person_relationships r
  JOIN church.people p ON p.id = r.related_person_id
  JOIN church.relationship_types rt ON rt.id = r.relationship_type_id
  WHERE r.person_id IN (SELECT * FROM church.my_person_ids())
    AND r.end_date IS NULL
    AND p.merged_into_person_id IS NULL
  ORDER BY p.is_child DESC, rt.sort_order, p.first_name
$$;

GRANT EXECUTE ON FUNCTION church.my_family() TO authenticated;

NOTIFY pgrst, 'reload schema';
