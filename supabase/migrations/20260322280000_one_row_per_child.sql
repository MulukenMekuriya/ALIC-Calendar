-- =====================================================
-- One row per child
-- =====================================================
--
-- kiosk_find_household_by_phone showed every child twice, and a parent who
-- tapped through got "duplicate key value violates unique constraint
-- uq_kids_check_ins_one_active_per_session" — the database correctly refusing
-- to check one child in twice, in front of a parent, in a lobby.
--
-- THE JOIN WAS adult -> household -> child. When TWO adults in the household
-- match the number, the join produces one row per (adult, child) pair, so
-- every child appears once per matching parent.
--
-- The immediate cause at ALIC is a duplicate person record - two rows for
-- Abel Yeshitila, same mobile, same household. But that is not the real
-- point, and fixing the data would not fix this: TWO PARENTS SHARING ONE
-- MOBILE NUMBER IS COMPLETELY ORDINARY. A couple who give the church one
-- number between them would have hit exactly this on the first Sunday.
--
-- DISTINCT ON (p.id) rather than a plain DISTINCT. Plain DISTINCT happens to
-- work today only because both adults are in the same household, so the whole
-- row is identical; the moment a child belongs to two households, or two
-- matching adults sit in different ones, the rows differ and the duplicate
-- comes back. Keyed on the child, which is what "one row per child" actually
-- means, with an ORDER BY that makes the choice deterministic rather than
-- whatever the planner happens to emit.

CREATE OR REPLACE FUNCTION church.kiosk_find_household_by_phone(
  _kids_session_id UUID,
  _phone           TEXT,
  _station_id      UUID DEFAULT NULL
)
RETURNS TABLE (
  household_id     UUID,
  household_name   TEXT,
  child_person_id  UUID,
  child_name       TEXT,
  photo_path       TEXT,
  grade_name       TEXT,
  already_checked_in BOOLEAN
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION church.kiosk_find_household_by_phone(UUID, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
