-- =====================================================
-- A branch admin controls the branch's roster, and nobody else does
-- =====================================================
--
-- Asked for 24 October 2026: on Users & Roles - OLD "let the org admin make
-- edits to users and roles and add new user or delete user, they need to
-- control users".
--
-- WHAT PRODUCTION HAD. public.user_organizations carried five policies, every
-- one scoped to `user_id = auth.uid()`:
--
--   - An admin could read the roster and do nothing else with it. Edit ran an
--     UPDATE that matched zero rows and Remove deleted nothing.
--   - Any signed-in user could UPDATE their own row, role included, and INSERT
--     a row for themselves in any branch with any role. Proven against
--     production in a rolled-back transaction on 24 October 2026: a plain
--     'member' ran one UPDATE and came back 'admin' of MD.
--
-- The admin policies were written on 26 September (as 20260322330000, on the
-- unmerged budget/the-board-reviews-the-year branch, alongside the Board tier)
-- and never deployed. Sections 1 and 2 here are that SQL without the Board.
--
--   1. Admin INSERT / UPDATE / DELETE policies, through public.is_org_admin,
--      which is SECURITY DEFINER and so does not recurse on this table.
--   2. A branch always keeps one admin.
--   3. A user can still write their own row, but not their own role, and can
--      only add themselves to a branch as 'member'.

-- ---------------------------------------------------------------------------
-- 1. The admin's hand on the roster
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can insert organization memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins can update organization memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Admins can delete organization memberships" ON public.user_organizations;

CREATE POLICY "Admins can insert organization memberships"
  ON public.user_organizations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Admins can update organization memberships"
  ON public.user_organizations FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY "Admins can delete organization memberships"
  ON public.user_organizations FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 2. The branch keeps at least one admin
-- ---------------------------------------------------------------------------
--
-- The screen lets an admin edit and remove their own row. One mis-click on the
-- only admin of a branch would leave nobody able to appoint another. The count
-- ignores the row being changed, so demoting yourself is refused while you are
-- the only admin and allowed once there is another.

CREATE OR REPLACE FUNCTION public.refuse_to_remove_the_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _others integer;
BEGIN
  IF OLD.role <> 'admin' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' AND NEW.organization_id = OLD.organization_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO _others
  FROM public.user_organizations
  WHERE organization_id = OLD.organization_id
    AND role = 'admin'
    AND user_id <> OLD.user_id;

  IF _others = 0 THEN
    RAISE EXCEPTION
      'This is the last admin of this branch. Make somebody else an admin first.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_keep_one_admin ON public.user_organizations;
CREATE TRIGGER trg_keep_one_admin
  BEFORE UPDATE OR DELETE ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.refuse_to_remove_the_last_admin();

-- ---------------------------------------------------------------------------
-- 3. Nobody promotes themselves
-- ---------------------------------------------------------------------------
--
-- Self-INSERT stays (joining a branch) but only as 'member'. Admins insert
-- through their own policy above; handle_new_user, the claim triggers and the
-- create-user function write as their owner or as service_role, which RLS
-- does not bind.

DROP POLICY IF EXISTS "Users can insert their own memberships" ON public.user_organizations;
CREATE POLICY "Users can insert their own memberships"
  ON public.user_organizations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'member');

-- Self-UPDATE stays too (is_primary is the user's own business), but a policy
-- cannot compare old and new, so the role, branch and owner of the row are
-- held still by a trigger for anyone who is not an admin of that branch.
--
-- SECURITY INVOKER on purpose: current_user is then the caller. A request from
-- the app runs as 'authenticated'; SECURITY DEFINER functions and the service
-- role run as someone else and are not this trigger's business.
CREATE OR REPLACE FUNCTION public.refuse_self_promotion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id)
     AND NOT public.is_org_admin(OLD.organization_id) THEN
    RAISE EXCEPTION 'Only an admin of this branch can change a role.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refuse_self_promotion ON public.user_organizations;
CREATE TRIGGER trg_refuse_self_promotion
  BEFORE UPDATE ON public.user_organizations
  FOR EACH ROW EXECUTE FUNCTION public.refuse_self_promotion();
