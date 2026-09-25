-- =====================================================
-- The one who brought them is offered first
-- =====================================================
--
-- The pickup list learns to say which of the people on it actually dropped
-- the child off this morning, so the check-out screen can offer them first.
--
-- WHY THE DATABASE AND NOT THE SCREEN. kids_check_ins.dropped_off_by_person_id
-- has been recorded since check-in shipped and nothing has ever read it back.
-- The check-out screen could not know: it asks for candidates per check-in and
-- gets names, relationships and flags, but never "and this is the one who
-- brought them in". Adding it here means the fact travels with the list it
-- belongs to, and the intersection across siblings works on it for free.
--
-- WHAT THIS IS NOT. It is not an authorisation. dropped_off rides alongside
-- is_authorized and is_guardian and changes neither: a person who is not on
-- the list does not appear on it because they carried a child through the
-- door, and the restricted-pickup exclusion below is untouched. All it does
-- is change which name a volunteer has to tap.
--
-- Adding an output column is a new signature, so DROP then CREATE - the same
-- dance 20260320002300 itself had to do.

DROP FUNCTION IF EXISTS church.station_pickup_candidates(UUID, TEXT);

CREATE FUNCTION church.station_pickup_candidates(
  _check_in_id UUID, _shift_token TEXT DEFAULT NULL)
RETURNS TABLE (
  person_id UUID,
  display_name TEXT,
  relationship TEXT,
  is_authorized BOOLEAN,
  is_guardian BOOLEAN,
  child_has_restriction BOOLEAN,
  -- New: this person handed the child over this morning.
  dropped_off BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a church.resolved_actor;
  ci church.kids_check_ins%ROWTYPE;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_out THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ci FROM church.kids_check_ins k
   WHERE k.id = _check_in_id AND k.organization_id = a.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'check_in_not_found'; END IF;

  RETURN QUERY
  WITH restricted AS (
    SELECT pr.restricted_person_id AS pid
    FROM church.kids_pickup_restrictions pr
    WHERE pr.child_person_id = ci.child_person_id
      AND pr.effective_from <= CURRENT_DATE
      AND (pr.effective_to IS NULL OR pr.effective_to >= CURRENT_DATE)
  ),
  candidates AS (
    -- Adults sharing the child's household.
    SELECT p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name AS nm,
           coalesce(rt.display_name, 'Household member') AS rel,
           false AS explicit,
           coalesce(rt.implies_guardianship, false) AS guardian
    FROM church.household_members hm_child
    JOIN church.household_members hm_adult
      ON hm_adult.household_id = hm_child.household_id
     AND hm_adult.end_date IS NULL
    JOIN church.people p
      ON p.id = hm_adult.person_id AND NOT p.is_child AND p.is_active
    -- Read from the ADULT's side: the type names person_id's role, so
    -- (person_id = adult, related_person_id = child) is "Parent", while the
    -- mirrored row is "Child" and would label every guardian "Child".
    LEFT JOIN church.person_relationships rel
      ON rel.person_id = p.id
     AND rel.related_person_id = ci.child_person_id
     AND rel.end_date IS NULL
    LEFT JOIN church.relationship_types rt ON rt.id = rel.relationship_type_id
    WHERE hm_child.person_id = ci.child_person_id
      AND hm_child.end_date IS NULL

    UNION ALL

    -- Anyone explicitly authorised, who may live elsewhere entirely.
    SELECT p.id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
           coalesce(pa.relationship_note, 'Authorised for pickup'),
           true,
           false
    FROM church.kids_pickup_authorizations pa
    JOIN church.people p ON p.id = pa.authorized_person_id AND p.is_active
    WHERE pa.child_person_id = ci.child_person_id
      AND pa.effective_from <= CURRENT_DATE
      AND (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE)
  )
  -- Grouped by person only: someone can be BOTH a household member and
  -- explicitly authorised, and must appear once, not twice. The strongest
  -- description wins, which is why max() is taken over the flags.
  SELECT c.id,
         c.nm,
         (array_agg(c.rel ORDER BY c.explicit DESC, c.guardian DESC))[1],
         bool_or(c.explicit),
         bool_or(c.guardian),
         EXISTS (SELECT 1 FROM restricted),
         (c.id = ci.dropped_off_by_person_id)
  FROM candidates c
  WHERE NOT EXISTS (SELECT 1 FROM restricted r WHERE r.pid = c.id)
  GROUP BY c.id, c.nm
  -- The one who brought them first, then the existing order. A volunteer
  -- reading down the list meets the likely name at the top rather than
  -- hunting for it among people who look identical on screen.
  ORDER BY (c.id = ci.dropped_off_by_person_id) DESC,
           bool_or(c.explicit) DESC, bool_or(c.guardian) DESC, c.nm;
END;
$$;

GRANT EXECUTE ON FUNCTION church.station_pickup_candidates(UUID, TEXT)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
