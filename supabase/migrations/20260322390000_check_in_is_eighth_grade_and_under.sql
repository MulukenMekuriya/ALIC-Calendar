-- =====================================================
-- Check-in lists children up to 8th grade
-- =====================================================
--
-- Children's Ministry runs through 8th grade; 9th grade and up is the youth
-- ministry, which does not check in at the kids desk. The desk's search and
-- the lobby kiosk both listed every child on a family, so a parent with a
-- high-schooler saw them offered for a classroom that is not theirs. Decided
-- by the ministry on 9 October 2026.
--
-- THE RULE, in one place so the two screens cannot disagree:
--
--   a recorded grade decides it: above Grade 8 is not listed. Grade 8 is
--   found by its code, per church, so a church that renumbers its grades
--   keeps the cut in the right place;
--
--   with no grade recorded, a birth year and month decide it: a child who
--   had turned 14 before 1 September of this school year is 9th-grade age
--   and is not listed;
--
--   with neither, the child is listed. Nothing says they are too old, and
--   leaving a 7-year-old off the list is worse than offering a 15-year-old.
--
-- On 9 October that hid the 23 children recorded in Grades 9 to 12 at
-- Silver Spring. 398 children have no grade and no birth month; they stay
-- listed. Two recorded as Grade 8 or under are 14 by age: the recorded
-- grade wins, so they stay listed too.
--
-- Only the two lists change. check_in_children is untouched: a child the
-- desk already has on screen, or one a leader checks in on purpose, is not
-- refused.

/** Whether a child is past 8th grade, by recorded grade or, failing that, by age. */
CREATE OR REPLACE FUNCTION church.kids_is_past_eighth_grade(
  _organization_id UUID, _school_grade_id UUID,
  _birth_year SMALLINT, _birth_month SMALLINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT CASE
    WHEN _school_grade_id IS NOT NULL THEN coalesce((
      SELECT g.sort_order > coalesce((
               SELECT g8.sort_order FROM church.school_grades g8
               WHERE g8.organization_id = _organization_id AND g8.code = 'g8'), 100)
      FROM church.school_grades g
      WHERE g.id = _school_grade_id), false)
    -- Turned 14 before 1 September of this school year (which starts in
    -- August): more than 168 months old on that day.
    ELSE coalesce(church.age_in_months(
           _birth_year, _birth_month,
           make_date(EXTRACT(YEAR FROM current_date)::INTEGER
                     - CASE WHEN EXTRACT(MONTH FROM current_date) >= 8 THEN 0 ELSE 1 END,
                     9, 1)) > 168, false)
  END;
$$;

REVOKE ALL ON FUNCTION church.kids_is_past_eighth_grade(UUID, UUID, SMALLINT, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.kids_is_past_eighth_grade(UUID, UUID, SMALLINT, SMALLINT) TO authenticated;

-- ---------------------------------------------------------- the desk

-- Unchanged except the marked filter. Same signature, so grants are kept.
CREATE OR REPLACE FUNCTION church.station_search_households(_query text, _kids_session_id uuid, _shift_token text DEFAULT NULL::text)
 RETURNS TABLE(household_id uuid, household_name text, masked_phone text, child_person_id uuid, child_display_name text, age_band_code text, grade_name text, already_checked_in boolean, needs_staff boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
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
      -- Children's Ministry is 8th grade and under. See the head of
      -- 20260322390000.
      AND NOT church.kids_is_past_eighth_grade(
            c.organization_id, c.school_grade_id, c.birth_year, c.birth_month)
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
$function$;

-- ---------------------------------------------------------- the kiosk

-- Unchanged except the marked filter. Same signature, so grants are kept.
CREATE OR REPLACE FUNCTION church.kiosk_find_household_by_phone(_kids_session_id uuid, _phone text, _station_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(household_id uuid, household_name text, child_person_id uuid, child_name text, photo_path text, grade_name text, already_checked_in boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'church', 'public', 'extensions'
AS $function$
DECLARE
  a church.resolved_actor;
  _digits TEXT;
  _misses INTEGER;
  _found  BOOLEAN := false;
  _st UUID;
BEGIN
  a := church.resolve_actor(NULL);
  IF NOT a.can_check_in THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  _st := church.kiosk_active_station(_station_id, a.organization_id);

  IF _station_id IS NOT NULL AND _st IS NULL THEN
    RAISE EXCEPTION 'station_not_active'
      USING HINT = 'This device is no longer registered. Please see a Kids '
                   'Ministry leader.';
  END IF;

  _digits := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10);

  IF length(_digits) <> 10 THEN
    RAISE EXCEPTION 'phone_must_be_ten_digits'
      USING HINT = 'Please enter the full mobile number.';
  END IF;

  SELECT count(*) INTO _misses
  FROM church.check_in_audit au
  WHERE au.organization_id = a.organization_id
    AND au.action = 'kiosk_search_miss'
    AND au.created_at > now() - interval '10 minutes'
    AND (_st IS NULL OR au.station_id = _st);

  IF _misses >= 20 THEN
    RAISE EXCEPTION 'too_many_attempts'
      USING HINT = 'Please see a Kids Ministry volunteer, who can check you in.';
  END IF;

  RETURN QUERY
  WITH matched AS (
    -- One row per CHILD, however many adults on the number lead to them.
    SELECT DISTINCT ON (p.id)
           h.id   AS hh_id,
           h.name AS hh_name,
           p.id   AS kid_id,
           coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name AS kid_name,
           p.photo_path AS kid_photo,
           g.display_name AS kid_grade
    FROM church.people adult
    JOIN church.household_members hm_adult
      ON hm_adult.person_id = adult.id AND hm_adult.end_date IS NULL
    JOIN church.households h ON h.id = hm_adult.household_id
    JOIN church.household_members hm_child
      ON hm_child.household_id = h.id AND hm_child.end_date IS NULL
    JOIN church.people p ON p.id = hm_child.person_id
    LEFT JOIN church.school_grades g ON g.id = p.school_grade_id
    WHERE adult.organization_id = a.organization_id
      AND adult.phone_digits IS NOT NULL
      AND right(adult.phone_digits, 10) = _digits
      AND NOT adult.is_child
      AND adult.is_active
      AND p.is_child AND p.is_active AND p.merged_into_person_id IS NULL
      -- Children's Ministry is 8th grade and under. See the head of
      -- 20260322390000.
      AND NOT church.kids_is_past_eighth_grade(
            p.organization_id, p.school_grade_id, p.birth_year, p.birth_month)
    -- Deterministic: the same parent always sees the same household named,
    -- rather than whichever row the planner emitted first.
    ORDER BY p.id, h.name, h.id
  )
  SELECT m.hh_id, m.hh_name, m.kid_id, m.kid_name, m.kid_photo, m.kid_grade,
         EXISTS (SELECT 1 FROM church.kids_check_ins ci
                  WHERE ci.child_person_id = m.kid_id
                    AND ci.kids_session_id = _kids_session_id
                    AND ci.status = 'checked_in')
  FROM matched m
  ORDER BY m.kid_name;

  GET DIAGNOSTICS _misses = ROW_COUNT;
  _found := _misses > 0;

  IF NOT _found THEN
    INSERT INTO church.check_in_audit (
      organization_id, action, outcome, station_id, actor_name, detail)
    VALUES (a.organization_id, 'kiosk_search_miss', 'denied', _st, a.actor_name,
            jsonb_build_object('last4', right(_digits, 4)));
  END IF;
END;
$function$;

NOTIFY pgrst, 'reload schema';
