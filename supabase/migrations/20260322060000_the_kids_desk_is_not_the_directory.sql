-- =============================================================================
-- The kids desk is not the directory
-- =============================================================================
--
-- A Kids Ministry leader signed in and saw Members and Families in the sidebar,
-- and behind them all 1,050 people in the congregation. They are not staff and
-- they are not an org admin. They hold one grant: kids_admin.
--
-- Two places bundled the directory into that grant:
--
--   1. src/shared/lib/capabilities.ts gave kids_admin and kids_leader
--      `members.read`, which is what put the links in the nav.
--   2. THIS file's ancestor, 20260320000400, put 'kids_admin' in the SELECT
--      policy for every directory table.
--
-- (1) is fixed in the same commit. (2) is the one that matters, because hiding
-- a link is not authorization — without this migration a kids leader keeps a
-- perfectly good PostgREST route to the whole congregation.
--
-- WHY THIS COSTS THE KIDS MODULE NOTHING
-- --------------------------------------
-- The kids module does not read a single directory table. Every query it makes
-- is either a kids-owned table (kids_sessions, kids_check_ins, rooms,
-- school_grades, check_in_stations, room_kids_config) or one of 38 SECURITY
-- DEFINER RPCs — station_search_households, station_child_safety_card,
-- station_pickup_candidates, kids_live_board, kids_room_roster and the rest.
-- SECURITY DEFINER bypasses RLS, so every one of them keeps working unchanged,
-- and every one of them logs what was looked at. The table read was the only
-- unaudited path, and nothing was using it.
--
-- This is the rule 20260320000400 already stated for kids_volunteer:
--
--     "a station account must reach child data only through the narrow,
--      audited RPCs added in a later migration, never by table read"
--
-- and then did not apply to kids_admin. It is also the rule the giving pair
-- were built on — giving_admin sees any donor's history and holds no directory
-- grant, because church.giving_donations hands it a name and nothing else.
--
-- WHAT IS DELIBERATELY LEFT ALONE
-- -------------------------------
--   * church.person_sensitive — allergies and medical notes. kids_admin keeps
--     SELECT and WRITE here. That table IS the kids ministry's data, its policy
--     is already the narrow one (members_admin + kids_admin, no
--     leadership_viewer, no kids_leader), and taking it away would break the
--     allergy flags the desk depends on. Reaching it still requires knowing a
--     person_id, which the directory read used to be the easy way to get.
--   * ministry_assignments / groups (20260320000500, 20260320000600) also list
--     kids_admin. Those are the serving and small-group rosters, not the
--     directory, and narrowing them is a separate decision with its own screens
--     to check.
--   * Every "Members can view their own ..." policy from 20260320001100. RLS
--     policies are OR'd, so a kids leader keeps their own record, their own
--     household and their own children exactly as any member does.
--
-- CONSEQUENCE, STATED PLAINLY
-- ---------------------------
-- A kids_admin can no longer open /members/:id to read a child's allergies off
-- the member profile. They read them at the desk through
-- station_child_safety_card, which writes church.check_in_audit. That is a
-- better audit story than the one being removed, not a worse one.
--
-- Someone who genuinely needs both keeps both — grants are additive rows, so
-- the fix for "our kids director also runs the office" is to grant them
-- members_viewer alongside kids_admin, which is now an explicit decision
-- somebody makes rather than a side effect of running the nursery.
--
-- Re-runnable: every policy is dropped and recreated.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Directory read, minus kids_admin
-- -----------------------------------------------------------------------------
-- Same five tables and the same policy names as 20260320000400, so this
-- replaces those policies rather than sitting alongside them.
DO $rls$
DECLARE
  t TEXT;
  read_perms TEXT :=
    'ARRAY[''members_admin'',''members_viewer'',''members_import'',''leadership_viewer'']::church.module_permission[]';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'households', 'people', 'household_members',
    'person_relationships', 'person_emergency_contacts'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Authorized users can view %s" ON church.%I', t, t);

    EXECUTE format(
      'CREATE POLICY "Authorized users can view %s"
         ON church.%I FOR SELECT TO authenticated
         USING (organization_id IN (SELECT * FROM church.my_orgs_with_any(%s)))',
      t, t, read_perms);
  END LOOP;
END
$rls$;

-- -----------------------------------------------------------------------------
-- Change history follows the directory
-- -----------------------------------------------------------------------------
-- people_history is who-changed-what on directory records. If a kids leader
-- cannot read the record, they have no business reading its edit trail.
DROP POLICY IF EXISTS "Authorized users can view people history" ON church.people_history;

CREATE POLICY "Authorized users can view people history"
  ON church.people_history FOR SELECT TO authenticated
  USING (organization_id IN (SELECT * FROM church.my_orgs_with_any(
    ARRAY['members_admin','members_viewer','leadership_viewer']::church.module_permission[])));

-- -----------------------------------------------------------------------------
-- household_summaries: one permission list, not two
-- -----------------------------------------------------------------------------
-- This RPC gated on members_admin/members_viewer/leadership_viewer while the
-- table policy above admitted members_import and kids_admin as well. The two
-- lists disagreeing is what made the Families page say "No families yet" to a
-- kids leader whose Members page was, on the same screen, reporting 516
-- households — the KPI counts the table, the list calls this function.
--
-- Recreated with members_import added so it matches the directory read policy
-- exactly. kids_admin is now correctly absent from both.
CREATE OR REPLACE FUNCTION church.household_summaries(_organization_id UUID)
RETURNS TABLE (
  household_id UUID,
  name TEXT,
  city TEXT,
  primary_contact_name TEXT,
  primary_phone TEXT,
  adult_count BIGINT,
  child_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
BEGIN
  IF NOT church.has_permission_in_org(
       _organization_id,
       ARRAY['members_admin','members_viewer','members_import','leadership_viewer']::church.module_permission[])
     AND _organization_id NOT IN (SELECT church.my_admin_orgs()) THEN
    RAISE EXCEPTION 'not_permitted' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.name,
    h.city,
    pc.nm,
    coalesce(h.primary_phone, pc.phone),
    coalesce(counts.adults, 0),
    coalesce(counts.children, 0)
  FROM church.households h
  LEFT JOIN LATERAL (
    SELECT coalesce(p.preferred_name, p.first_name) || ' ' || p.last_name AS nm,
           p.phone
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = h.id AND hm.end_date IS NULL AND NOT p.is_child
    ORDER BY hm.is_primary_contact DESC, p.first_name
    LIMIT 1
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE NOT p.is_child) AS adults,
           count(*) FILTER (WHERE p.is_child) AS children
    FROM church.household_members hm
    JOIN church.people p ON p.id = hm.person_id
    WHERE hm.household_id = h.id AND hm.end_date IS NULL
  ) counts ON true
  WHERE h.organization_id = _organization_id
    AND h.is_active
  ORDER BY h.name;
END;
$$;

GRANT EXECUTE ON FUNCTION church.household_summaries(UUID) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
