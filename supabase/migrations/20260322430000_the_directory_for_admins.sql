-- =====================================================
-- The directory, for the people who keep it
-- =====================================================
--
-- The Members and Families screens listed names and little else: the
-- directory's "Status" column said Active or Inactive and never Member or
-- Visitor, and nothing showed what needed fixing. On 10 October, of 705
-- active adults in Silver Spring, 404 had no membership status, 42 no email
-- and 46 no phone; 386 of 649 children had no school grade; and 62 names
-- appeared more than once.
--
-- This gives the screens what they need to show and fix that:
--
--   directory_people          every person, with their status, family and
--                             grade by name, for a table that filters, sorts
--                             and exports in the browser
--   directory_families        every family, with its status and last check-in
--   set_membership_status     one status for many people at once, recorded in
--                             people_history field by field like any edit
--   duplicate dismissals      "these are different people", so a reviewed
--                             pair stops being offered
--
-- WHO MAY READ: whoever may read the directory and the family list today,
-- the same list household_summaries checks. WHO MAY CHANGE: members_admin,
-- and church admins, who hold every module permission.
--
-- WHY ONE CALL FOR EVERYONE rather than a page at a time: 1,354 people is
-- small, and a table that sorts by family or status, counts what is missing
-- and exports exactly what is filtered is far simpler when the browser holds
-- them all. PostgREST returns at most 1,000 rows a call, so the screen asks
-- in slices (range) until a short one comes back; the ORDER BY ends on id so
-- the slices never overlap.

-- ---------------------------------------------------------- 1. reading

CREATE OR REPLACE FUNCTION church.assert_directory_reader(_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id,
       ARRAY['members_admin','members_viewer','members_import','leadership_viewer']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION church.assert_directory_reader(UUID) FROM PUBLIC, anon, authenticated;

/**
 * Every person not merged away, active or not, with what the directory shows.
 */
CREATE OR REPLACE FUNCTION church.directory_people(_organization_id UUID)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  preferred_name TEXT,
  is_child BOOLEAN,
  is_active BOOLEAN,
  email TEXT,
  phone TEXT,
  gender TEXT,
  birth_year SMALLINT,
  birth_month SMALLINT,
  membership_status_id UUID,
  membership_code TEXT,
  membership_name TEXT,
  household_id UUID,
  household_name TEXT,
  grade_name TEXT,
  has_login BOOLEAN,
  last_check_in DATE,
  created_at TIMESTAMPTZ,
  created_by_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.assert_directory_reader(_organization_id);

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, p.preferred_name, p.is_child, p.is_active,
         p.email, p.phone, p.gender, p.birth_year, p.birth_month,
         p.membership_status_id, ms.code, ms.display_name,
         hh.id, hh.name,
         g.display_name,
         p.profile_id IS NOT NULL,
         ci.last_in,
         p.created_at, p.created_by_name
  FROM church.people p
  LEFT JOIN church.membership_statuses ms ON ms.id = p.membership_status_id
  LEFT JOIN church.school_grades g ON g.id = p.school_grade_id
  -- Their family: the primary one, else any they are in today.
  LEFT JOIN LATERAL (
    SELECT h.id, h.name
    FROM church.household_members hm
    JOIN church.households h ON h.id = hm.household_id
    WHERE hm.person_id = p.id AND hm.end_date IS NULL
    ORDER BY hm.is_primary_household DESC, hm.start_date
    LIMIT 1
  ) hh ON true
  LEFT JOIN LATERAL (
    SELECT max(c.checked_in_at)::DATE AS last_in
    FROM church.kids_check_ins c
    WHERE c.child_person_id = p.id
  ) ci ON p.is_child
  WHERE p.organization_id = _organization_id
    AND p.merged_into_person_id IS NULL
  ORDER BY p.last_name, p.first_name, p.id;
END;
$$;

REVOKE ALL ON FUNCTION church.directory_people(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.directory_people(UUID) TO authenticated;

/**
 * Every active family, with its contact, its people, its status and when a
 * child of theirs was last checked in.
 *
 * A family's status is the strongest held by anyone in it today, the same
 * order the Kids Ministry uses for a child (kids_family_status): member,
 * regular attendee, visitor, else not recorded.
 */
CREATE OR REPLACE FUNCTION church.directory_families(_organization_id UUID)
RETURNS TABLE (
  household_id UUID,
  name TEXT,
  city TEXT,
  primary_contact_id UUID,
  primary_contact_name TEXT,
  primary_phone TEXT,
  primary_email TEXT,
  adult_count INTEGER,
  child_count INTEGER,
  family_status TEXT,
  last_check_in DATE,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.assert_directory_reader(_organization_id);

  RETURN QUERY
  SELECT h.id, h.name, h.city,
         pc.id, pc.nm, coalesce(h.primary_phone, pc.phone), pc.email,
         coalesce(m.adults, 0)::INTEGER, coalesce(m.children, 0)::INTEGER,
         CASE
           WHEN 'member' = ANY (m.codes) THEN 'member'
           WHEN 'regular_attendee' = ANY (m.codes) THEN 'regular_attendee'
           WHEN 'visitor' = ANY (m.codes) THEN 'visitor'
           ELSE 'not_recorded'
         END,
         ci.last_in,
         h.created_at
  FROM church.households h
  LEFT JOIN LATERAL (
    SELECT p.id, coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name AS nm,
           p.phone, p.email
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = h.id AND hm.end_date IS NULL
      AND NOT p.is_child AND p.merged_into_person_id IS NULL
    ORDER BY hm.is_primary_contact DESC, p.first_name
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE NOT p.is_child) AS adults,
           count(*) FILTER (WHERE p.is_child) AS children,
           array_agg(ms.code) FILTER (WHERE ms.code IS NOT NULL) AS codes
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    LEFT JOIN church.membership_statuses ms ON ms.id = p.membership_status_id
    WHERE hm.household_id = h.id AND hm.end_date IS NULL
      AND p.merged_into_person_id IS NULL
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT max(c.checked_in_at)::DATE AS last_in
    FROM church.household_members hm
    JOIN church.kids_check_ins c ON c.child_person_id = hm.person_id
    WHERE hm.household_id = h.id AND hm.end_date IS NULL
  ) ci ON true
  WHERE h.organization_id = _organization_id
    AND h.is_active
  ORDER BY h.name, h.id;
END;
$$;

REVOKE ALL ON FUNCTION church.directory_families(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.directory_families(UUID) TO authenticated;

-- ---------------------------------------------------------- 2. one status, many people

/**
 * Set one membership status on many people, and record each change in
 * people_history exactly as update_person_details does for one: the field,
 * the old value and the new, who, and a note saying it was done in bulk.
 * People who already have the status are left alone and not recorded.
 * Returns how many changed.
 */
CREATE OR REPLACE FUNCTION church.set_membership_status(
  _organization_id UUID, _person_ids UUID[], _membership_status_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  _actor TEXT;
  _n INTEGER;
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id, ARRAY['members_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
  IF _person_ids IS NULL OR cardinality(_person_ids) = 0 THEN
    RAISE EXCEPTION 'nobody_chosen';
  END IF;
  IF cardinality(_person_ids) > 2000 THEN
    RAISE EXCEPTION 'too_many_people';
  END IF;
  IF _membership_status_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM church.membership_statuses ms
       WHERE ms.id = _membership_status_id AND ms.organization_id = _organization_id) THEN
    RAISE EXCEPTION 'status_belongs_to_another_branch';
  END IF;

  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    'Unknown');

  WITH changed AS (
    UPDATE church.people p
       SET membership_status_id = _membership_status_id,
           updated_at = now()
      FROM church.people before
     WHERE p.id = before.id
       AND p.id = ANY (_person_ids)
       AND p.organization_id = _organization_id
       AND p.merged_into_person_id IS NULL
       AND p.membership_status_id IS DISTINCT FROM _membership_status_id
    RETURNING p.id, before.membership_status_id AS old_status
  ),
  recorded AS (
    INSERT INTO church.people_history (
      organization_id, person_id, action, field_name, old_value, new_value,
      actor_id, actor_name, notes)
    SELECT _organization_id, c.id, 'bulk_update', 'membership_status_id',
           c.old_status::TEXT, _membership_status_id::TEXT,
           auth.uid(), _actor,
           'Set for ' || cardinality(_person_ids) || ' people at once by an administrator'
    FROM changed c
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM recorded;

  RETURN _n;
END;
$$;

REVOKE ALL ON FUNCTION church.set_membership_status(UUID, UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.set_membership_status(UUID, UUID[], UUID) TO authenticated;

-- ---------------------------------------------------------- 3. not the same person

/**
 * "These people share a name but are not the same person." The screen finds
 * likely duplicates by name and stops offering a group once every person in
 * it is in one dismissal. A new person with the same name brings the group
 * back, because they have not been looked at.
 */
CREATE TABLE IF NOT EXISTS church.person_duplicate_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  person_ids UUID[] NOT NULL CHECK (cardinality(person_ids) >= 2),
  dismissed_by UUID,
  dismissed_by_name TEXT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_person_duplicate_dismissals_org
  ON church.person_duplicate_dismissals (organization_id);
ALTER TABLE church.person_duplicate_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON church.person_duplicate_dismissals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON church.person_duplicate_dismissals TO service_role;

CREATE OR REPLACE FUNCTION church.duplicate_dismissals(_organization_id UUID)
RETURNS TABLE (person_ids UUID[], dismissed_by_name TEXT, dismissed_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.assert_directory_reader(_organization_id);
  RETURN QUERY
  SELECT d.person_ids, d.dismissed_by_name, d.dismissed_at
  FROM church.person_duplicate_dismissals d
  WHERE d.organization_id = _organization_id
  ORDER BY d.dismissed_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION church.duplicate_dismissals(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.duplicate_dismissals(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION church.dismiss_duplicate_group(
  _organization_id UUID, _person_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id, ARRAY['members_admin']::church.module_permission[]) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;
  -- Every id must be a person of this branch: a dismissal naming somebody
  -- else's people would hide nothing here and leak nothing, but it is wrong.
  IF _person_ids IS NULL OR cardinality(_person_ids) < 2
     OR (SELECT count(*) FROM church.people p
          WHERE p.id = ANY (_person_ids) AND p.organization_id = _organization_id)
        <> cardinality(_person_ids) THEN
    RAISE EXCEPTION 'invalid_group';
  END IF;

  INSERT INTO church.person_duplicate_dismissals
    (organization_id, person_ids, dismissed_by, dismissed_by_name)
  VALUES (_organization_id, _person_ids, auth.uid(),
          coalesce((SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'Unknown'));
END;
$$;

REVOKE ALL ON FUNCTION church.dismiss_duplicate_group(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church.dismiss_duplicate_group(UUID, UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
