-- =====================================================
-- The kids team is a set the database already knows
-- =====================================================
--
-- The Volunteers tab opens a picker over church.kids_eligible_volunteers,
-- which returns every adult member of the branch. That is deliberate and
-- stays: somebody helping for the first time has no record anywhere, and an
-- inner join would hide exactly the person the leader is trying to add.
--
-- But in production that is 660 names, and a leader looking for one of about
-- forty regulars on a Sunday morning has to scroll past six hundred people
-- who have never served with children. So the UI now opens on the kids team
-- and puts the rest behind a button. This adds the one column that lets it
-- work out who is on the team, because the client cannot.
--
-- WHAT "ON THE TEAM" MEANS, and why it is not the obvious thing. The obvious
-- answer is church.kids_volunteers, and it is the wrong one: that table has
-- ZERO rows. Every one of ALIC's volunteers is on the team by holding a
-- kids_volunteer module grant, which lives in church.module_grants keyed by
-- auth user, not by person. A "team" built from kids_volunteers would open on
-- nobody at all.
--
-- So the set is the union of three things, any one of which makes somebody a
-- member of the Children's Ministry:
--
--   * a kids module grant (41 people today - the real answer),
--   * a church.kids_volunteers row (0 today, but it is what the table means),
--   * a current classroom assignment (3 today).
--
-- The client already has the classroom assignments, so those stay a UI-side
-- union; the other two need this function.

DROP FUNCTION IF EXISTS church.kids_eligible_volunteers(UUID);

CREATE FUNCTION church.kids_eligible_volunteers(_organization_id UUID)
RETURNS TABLE (
  person_id UUID,
  volunteer_id UUID,
  display_name TEXT,
  phone TEXT,
  is_active BOOLEAN,
  can_override BOOLEAN,
  may_not_serve_with_children BOOLEAN,
  on_kids_team BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  PERFORM church.assert_kids_leader(_organization_id);

  RETURN QUERY
  SELECT
    p.id,
    v.id,
    coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name,
    p.phone,
    coalesce(v.is_active, false),
    coalesce(v.can_override, false),
    coalesce(v.may_not_serve_with_children, false),
    -- Scoped to THIS branch. A grant is per organization, and somebody who
    -- serves with children in Silver Spring is not thereby on the team in
    -- Springfield.
    (v.id IS NOT NULL)
      OR EXISTS (
        SELECT 1 FROM church.module_grants mg
        WHERE mg.user_id = p.profile_id
          AND mg.organization_id = _organization_id
          AND mg.permission IN ('kids_admin', 'kids_leader', 'kids_volunteer')
      )
  FROM church.people p
  LEFT JOIN church.kids_volunteers v ON v.person_id = p.id
  WHERE p.organization_id = _organization_id
    AND NOT p.is_child
    AND p.is_active
    AND p.merged_into_person_id IS NULL
  -- The team first, then the roster flag, then the name. The picker sorts its
  -- own list, but an ordered result means the first page is useful even if a
  -- caller does not.
  ORDER BY
    (v.id IS NOT NULL) OR EXISTS (
      SELECT 1 FROM church.module_grants mg
      WHERE mg.user_id = p.profile_id
        AND mg.organization_id = _organization_id
        AND mg.permission IN ('kids_admin', 'kids_leader', 'kids_volunteer')
    ) DESC,
    coalesce(v.is_active, false) DESC,
    p.last_name, p.first_name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.kids_eligible_volunteers(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
