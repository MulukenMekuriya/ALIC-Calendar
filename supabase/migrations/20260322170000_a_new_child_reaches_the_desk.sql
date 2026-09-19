-- =====================================================
-- A child you just added is a child the desk can find
-- =====================================================
--
-- Live testing, Sunday 14 September 2026. A parent arrived with a child who was
-- not on file. The child was added from Members → Families → Add a child. The
-- volunteer then searched the parent at the check-in station: the family came
-- up, with its other children, and the new child was not on it.
--
-- WHY. church.station_search_households is shaped around the HOUSEHOLD:
--
--     FROM church.households h
--     JOIN church.household_members chm ON chm.household_id = h.id ...
--     JOIN church.people c ON c.id = chm.person_id AND c.is_child ...
--
-- so a child is reachable at the desk on exactly one condition — they share a
-- household_members row with the adult being searched for. Nothing else counts.
-- Not the parent relationship. Not the pickup authorisation. Both of which
-- church.add_child_to_household writes for every adult of the family, and both
-- of which the CHECKOUT desk already trusts: station_pickup_candidates unions
-- them in, with the comment
--
--     -- Recorded guardians, who may have no household row at all — the state
--     -- every CSV-imported family is in.
--
-- So the two halves of the same desk disagreed about what makes an adult a
-- child's parent. Checkout asks three questions; search asked one. A child
-- whose link to their family is a relationship rather than a shared household
-- row — the imported families, a child added to a duplicate family record, a
-- child whose family record has no adult on it yet — cannot be found by their
-- parent's name, and a volunteer with a queue in front of them reads that as
-- "this child is not in the system" and registers them a second time.
--
-- WHAT CHANGES. The search stops being a household search that happens to
-- return children and becomes a CHILD search that reports which family each
-- child belongs to. A child is found when the words typed match:
--
--   * their own name                                    (as before)
--   * their family's name                               (as before)
--   * an adult who shares their household                (as before)
--   * an adult recorded as their parent or guardian      (NEW)
--   * an adult authorised to collect them                (NEW)
--
-- The last two are precisely church.is_approved_collector's own test, so the
-- desk can now find every child it is able to release, and no others.
--
-- A child with no family record at all is returned too, under their own name
-- and labelled as having none, because the alternative is a child standing at
-- the desk who the system refuses to admit exists. Everything downstream copes:
-- check_in_children reads the household only to decide who to text the pickup
-- code to, and station_household_adults simply returns nobody.
--
-- The station's own screen is untouched: same function name, same argument
-- list, same columns, so HouseholdMatch and the search UI carry on unchanged.
-- Rows for a child with no family carry that child's id as household_id, which
-- is what the screen groups by.


-- ---------------------------------------------------------------------------
-- 1. The desk searches for children
-- ---------------------------------------------------------------------------
--
-- Still STABLE. This one reads.
DROP FUNCTION IF EXISTS church.station_search_households(TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION church.station_search_households(
  _query TEXT, _kids_session_id UUID, _shift_token TEXT DEFAULT NULL)
RETURNS TABLE (
  household_id UUID, household_name TEXT, masked_phone TEXT,
  child_person_id UUID, child_display_name TEXT, age_band_code TEXT,
  grade_name TEXT,
  already_checked_in BOOLEAN, needs_staff BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  a church.resolved_actor;
  _digits TEXT;
  _term TEXT;
  _session UUID;
BEGIN
  a := church.resolve_actor(_shift_token);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_query, ''))) < 3 THEN
    RAISE EXCEPTION 'query_too_short';
  END IF;

  _session := _kids_session_id;
  IF _session IS NULL THEN
    SELECT s.id INTO _session
    FROM church.kids_sessions s
    WHERE s.organization_id = a.organization_id
      AND s.status = 'open'
      AND s.session_date = CURRENT_DATE
    ORDER BY s.opened_at DESC
    LIMIT 1;
  END IF;

  _term   := lower(btrim(_query));
  _digits := regexp_replace(_query, '\D', '', 'g');

  RETURN QUERY
  -- Every adult in the branch the typed words could mean. Evaluated once —
  -- three references, so PostgreSQL materialises it — rather than re-running
  -- the trigram match inside a subquery per child.
  WITH grown_up AS (
    SELECT p.id
    FROM church.people p
    WHERE p.organization_id = a.organization_id
      AND NOT p.is_child
      AND p.is_active
      AND p.merged_into_person_id IS NULL
      AND ((length(_digits) >= 4 AND p.phone_digits LIKE '%' || _digits)
        OR p.search_name % _term)
  ),
  -- The children those words reach. Five ways in, of which the last two are
  -- what this migration adds.
  hit AS (
    SELECT c.id
    FROM church.people c
    WHERE c.organization_id = a.organization_id
      AND c.is_child
      AND c.is_active
      AND c.merged_into_person_id IS NULL
      AND (
        c.search_name % _term

        -- Their family: its name, or an adult living in it.
        OR EXISTS (
          SELECT 1
          FROM church.household_members hm_child
          JOIN church.households h ON h.id = hm_child.household_id AND h.is_active
          WHERE hm_child.person_id = c.id
            AND hm_child.end_date IS NULL
            AND (
              h.name ILIKE '%' || _query || '%'
              OR EXISTS (
                SELECT 1
                FROM church.household_members hm_adult
                JOIN grown_up g ON g.id = hm_adult.person_id
                WHERE hm_adult.household_id = hm_child.household_id
                  AND hm_adult.end_date IS NULL)))

        -- A recorded parent or guardian. The direction and the
        -- implies_guardianship test are is_approved_collector's, not a new
        -- rule: an adult who could collect this child can find them.
        OR EXISTS (
          SELECT 1
          FROM church.person_relationships rel
          JOIN church.relationship_types rt
            ON rt.id = rel.relationship_type_id AND rt.implies_guardianship
          JOIN grown_up g ON g.id = rel.person_id
          WHERE rel.related_person_id = c.id
            AND rel.end_date IS NULL)

        -- An adult explicitly authorised to collect them: the grandmother who
        -- does the school run and is on no household record anywhere.
        OR EXISTS (
          SELECT 1
          FROM church.kids_pickup_authorizations pa
          JOIN grown_up g ON g.id = pa.authorized_person_id
          WHERE pa.child_person_id = c.id
            AND pa.lifted_at IS NULL
            AND pa.effective_from <= CURRENT_DATE
            AND (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE))
      )
  )
  SELECT
    -- A child with no family record still needs a card to sit on, and the
    -- screen groups by this column. Their own id is stable for as long as the
    -- search is on screen and cannot collide with a household's.
    coalesce(h.id, c.id),
    CASE
      WHEN h.name IS NOT NULL THEN h.name
      -- Said out loud, because it is the reason the office cannot ring anybody
      -- about this child and nobody will be offered at checkout.
      WHEN kin.names IS NOT NULL THEN kin.names || ' — no family record'
      ELSE coalesce(c.preferred_name, c.first_name) || ' ' || c.last_name
           || ' — no family record'
    END,
    coalesce(ph.masked, kin.masked),
    c.id,
    coalesce(c.preferred_name, c.first_name) || ' ' || left(c.last_name, 1) || '.',
    b.code,
    g.display_name,
    EXISTS (SELECT 1 FROM church.kids_check_ins ci
            WHERE ci.child_person_id = c.id
              AND ci.kids_session_id = _session
              AND ci.status = 'checked_in'),
    EXISTS (SELECT 1 FROM church.kids_pickup_restrictions pr
            WHERE pr.child_person_id = c.id
              AND pr.lifted_at IS NULL
              AND (pr.effective_to IS NULL OR pr.effective_to >= CURRENT_DATE))
  FROM hit
  JOIN church.people c ON c.id = hit.id
  -- The family this child belongs to, if any. Primary household first: a child
  -- living between two families has one card, at the one the church calls home.
  LEFT JOIN LATERAL (
    SELECT hh.id, hh.name
    FROM church.household_members hm
    JOIN church.households hh ON hh.id = hm.household_id AND hh.is_active
    WHERE hm.person_id = c.id AND hm.end_date IS NULL
    ORDER BY hm.is_primary_household DESC, hm.start_date DESC
    LIMIT 1
  ) h ON true
  LEFT JOIN church.school_grades g ON g.id = c.school_grade_id
  LEFT JOIN church.kids_age_bands b
         ON b.id = church.age_band_for(a.organization_id, c.birth_year, c.birth_month)
  -- The telephone number on the family, as before.
  LEFT JOIN LATERAL (
    SELECT CASE WHEN adult.phone_digits <> ''
                THEN '•••-' || right(adult.phone_digits, 4) END AS masked
    FROM church.household_members ahm
    JOIN church.people adult ON adult.id = ahm.person_id
    WHERE ahm.household_id = h.id AND ahm.end_date IS NULL
      AND NOT adult.is_child AND adult.phone_digits <> ''
    ORDER BY ahm.is_primary_contact DESC
    LIMIT 1
  ) ph ON true
  -- Who this child belongs to when no family record says. Named on the card so
  -- the volunteer can tell two children apart, and so the desk knows whose
  -- telephone number it is showing.
  --
  -- Driven from the child's own links — person_relationships(related_person_id)
  -- and the pickup authorisation's (child_person_id, …) unique index — rather
  -- than by asking of every adult in the branch whether they are this child's.
  -- Four rows read per child instead of six hundred.
  LEFT JOIN LATERAL (
    SELECT string_agg(DISTINCT k.nm, ', ') AS names,
           min(k.mask) AS masked
    FROM (
      SELECT coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name AS nm,
             CASE WHEN p.phone_digits <> ''
                  THEN '•••-' || right(p.phone_digits, 4) END AS mask
      FROM church.person_relationships rel
      JOIN church.relationship_types rt
        ON rt.id = rel.relationship_type_id AND rt.implies_guardianship
      JOIN church.people p
        ON p.id = rel.person_id
       AND p.is_active AND NOT p.is_child
       AND p.organization_id = a.organization_id
      WHERE rel.related_person_id = c.id
        AND rel.end_date IS NULL

      UNION

      SELECT coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
             CASE WHEN p.phone_digits <> ''
                  THEN '•••-' || right(p.phone_digits, 4) END
      FROM church.kids_pickup_authorizations pa
      JOIN church.people p
        ON p.id = pa.authorized_person_id
       AND p.is_active AND NOT p.is_child
       AND p.organization_id = a.organization_id
      WHERE pa.child_person_id = c.id
        AND pa.lifted_at IS NULL
        AND pa.effective_from <= CURRENT_DATE
        AND (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE)
    ) k
  ) kin ON true
  -- A child with no family sorts under their own name, in among the families,
  -- rather than in a clump at the end: the volunteer reads one alphabetical
  -- list and the child is where they expect them.
  ORDER BY 2, c.first_name
  LIMIT 40;
END;
$$;

GRANT EXECUTE ON FUNCTION church.station_search_households(TEXT, UUID, TEXT)
  TO authenticated;

COMMENT ON FUNCTION church.station_search_households(TEXT, UUID, TEXT) IS
  'The desk''s search. Finds a CHILD by their own name, their family''s name, '
  'an adult of their household, a recorded guardian, or an adult authorised to '
  'collect them — the same links checkout trusts — and reports which family '
  'each child belongs to, or that they have none.';


-- ---------------------------------------------------------------------------
-- 2. The children nobody at the desk can reach by a parent's name
-- ---------------------------------------------------------------------------
--
-- Section 1 means the desk finds a child through any adult connected to them.
-- This is the list of children who have no such adult: no active household
-- with a grown-up on it, no guardian relationship, no pickup authorisation.
--
-- That list is not a cosmetic worklist. A child on it:
--   * can be found at the desk only by typing the child's own name,
--   * has nobody church.is_approved_collector will accept, so checking them
--     out needs the admin override path, and
--   * gets no pickup-code text message, because there is no number to send to.
--
-- It is the state the September bug left one child in, and the state a family
-- record with no adult on it puts every child added to it in.
CREATE OR REPLACE FUNCTION church.children_without_an_adult(_organization_id UUID)
RETURNS TABLE (
  person_id UUID,
  child_name TEXT,
  household_id UUID,
  household_name TEXT,
  has_household BOOLEAN,
  has_grade BOOLEAN,
  added_on DATE,
  added_by TEXT
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
    h.id IS NOT NULL,
    c.school_grade_id IS NOT NULL,
    c.created_at::DATE,
    c.created_by_name
  FROM church.people c
  LEFT JOIN LATERAL (
    SELECT hh.id, hh.name
    FROM church.household_members hm
    JOIN church.households hh ON hh.id = hm.household_id AND hh.is_active
    WHERE hm.person_id = c.id AND hm.end_date IS NULL
    ORDER BY hm.is_primary_household DESC, hm.start_date DESC
    LIMIT 1
  ) h ON true
  WHERE c.organization_id = _organization_id
    AND c.is_child
    AND c.is_active
    AND c.merged_into_person_id IS NULL
    -- Nobody in their family.
    AND NOT EXISTS (
      SELECT 1
      FROM church.household_members hm_child
      JOIN church.household_members hm_adult
        ON hm_adult.household_id = hm_child.household_id
       AND hm_adult.end_date IS NULL
      JOIN church.people p
        ON p.id = hm_adult.person_id AND NOT p.is_child AND p.is_active
      WHERE hm_child.person_id = c.id AND hm_child.end_date IS NULL)
    -- No recorded guardian.
    AND NOT EXISTS (
      SELECT 1
      FROM church.person_relationships rel
      JOIN church.relationship_types rt
        ON rt.id = rel.relationship_type_id AND rt.implies_guardianship
      JOIN church.people p
        ON p.id = rel.person_id AND NOT p.is_child AND p.is_active
      WHERE rel.related_person_id = c.id AND rel.end_date IS NULL)
    -- Nobody authorised to collect them.
    AND NOT EXISTS (
      SELECT 1
      FROM church.kids_pickup_authorizations pa
      JOIN church.people p ON p.id = pa.authorized_person_id AND p.is_active
      WHERE pa.child_person_id = c.id
        AND pa.lifted_at IS NULL
        AND pa.effective_from <= CURRENT_DATE
        AND (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE))
  ORDER BY c.created_at DESC, c.first_name;
END;
$$;

REVOKE ALL ON FUNCTION church.children_without_an_adult(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION church.children_without_an_adult(UUID) TO authenticated;

COMMENT ON FUNCTION church.children_without_an_adult(UUID) IS
  'Children with no adult attached by any route — no household with a grown-up '
  'on it, no guardian, nobody authorised to collect them. The desk can only '
  'find them by the child''s own name, checkout needs an override, and no '
  'pickup code can be texted. Newest first: the mistake made this morning is '
  'at the top.';


-- ---------------------------------------------------------------------------
-- 3. Adding a child to a family with no adult on it says so
-- ---------------------------------------------------------------------------
--
-- The screen that produced the bug lets an admin add a child to any family
-- record, including one whose adults are all ended or which never had any —
-- which is what a duplicate family record from the import looks like. The
-- child then has no parent relationship and no pickup authorisation, because
-- add_child_to_household writes one per adult of the household and there were
-- none.
--
-- Not refused: a church that has the child's name and not the parent's should
-- still be able to write the child down, and the desk (section 1) will find
-- them by name. Recorded instead, so the office sees it on
-- children_without_an_adult() and the volunteer sees "no family record" on the
-- card instead of a family name that means nothing.
--
-- Everything else about the function is byte-for-byte 20260322080000's.
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
  _adults INTEGER := 0;
BEGIN
  SELECT h.organization_id INTO _org
  FROM church.households h WHERE h.id = _household_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'household_not_found'; END IF;

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

  FOR _adult IN
    SELECT p.id
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = _household_id
      AND hm.end_date IS NULL
      AND NOT p.is_child
      AND p.is_active
  LOOP
    _adults := _adults + 1;

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

  -- THE ONE ADDITION. Written to the child's own history, which is where the
  -- office already looks to see how a record came to be the way it is.
  IF _adults = 0 THEN
    INSERT INTO church.people_history
      (organization_id, person_id, action, actor_id, actor_name, notes)
    VALUES (_org, _child_id, 'created', auth.uid(), _actor,
            'Added to a family with no adult on it, so no parent and nobody '
            'authorised to collect them was recorded. The check-in desk can '
            'find this child by their own name only.');
  END IF;

  RETURN _child_id;
END;
$$;

GRANT EXECUTE ON FUNCTION church.add_child_to_household(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION church.add_child_to_household(UUID, JSONB) IS
  'Adds a NEW child to an existing family, doing everything registration does '
  'per child: person, household membership, a parent relationship from each '
  'adult, pickup authorisation for each, and any allergy record. Callable by '
  'members_admin, or by any adult of that household from My Church. A family '
  'with no adult on it is recorded in people_history, because the child it '
  'produces is one church.children_without_an_adult() has to report.';

NOTIFY pgrst, 'reload schema';
