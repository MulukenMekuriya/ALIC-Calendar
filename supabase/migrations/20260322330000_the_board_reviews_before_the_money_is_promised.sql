-- =====================================================
-- The Board's seat, and the admin's hand on the roster
-- =====================================================
--
-- Three things that belong together because they are all the same sentence:
-- somebody has to be able to say who does what, and the Board has to be able
-- to say what it thinks before the money is promised.
--
--   1. 'board' becomes a staff tier, so a board member can reach the budget.
--   2. The admin policies on public.user_organizations, restored.
--   3. budget.allocation_board_feedback: what the Board said, per request.

-- ---------------------------------------------------------------------------
-- 1. 'board' is staff
-- ---------------------------------------------------------------------------
--
-- public.is_staff() is the allowlist every RESTRICTIVE policy from
-- 20260321001600 consults. A role that is not in it reaches nothing — not the
-- budget, not the calendar, not even a list of ministries — so adding the tier
-- to the enum without adding it here would have produced a login that opens on
-- an empty screen.
--
-- WHAT THIS GRANTS, stated plainly, because it is more than the budget: a
-- board member now sees what a contributor sees — the calendar, the budget,
-- inventory, the staff directory. That is the access level asked for. It does
-- NOT include children's records: those are gated by church.module_grants
-- (kids_admin, kids_volunteer), which no tier confers on its own, so a board
-- seat is not a route to a child's medical form.

CREATE OR REPLACE FUNCTION public.is_staff(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = _organization_id
      AND role IN ('admin', 'contributor', 'treasury', 'finance', 'board')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff_anywhere()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'contributor', 'treasury', 'finance', 'board')
  )
$$;

-- Who is on the Board of this branch. SECURITY DEFINER for the same reason
-- is_org_admin is: it is read from policies on user_organizations itself, and
-- a policy that reads its own table through a plain subquery recurses.
CREATE OR REPLACE FUNCTION public.is_board(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND organization_id = _organization_id
      AND role = 'board'
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. An admin can actually set a role
-- ---------------------------------------------------------------------------
--
-- WHAT WAS WRONG. public.user_organizations carried five policies, every one
-- of them scoped to `user_id = auth.uid()`. An admin could read the roster and
-- nothing else. So Users & Roles -> Edit -> Update ran an UPDATE that matched
-- zero rows, PostgREST reported success because nothing errored, and the page
-- said "User updated successfully" while the role stayed exactly as it was.
-- Every attempt to promote somebody out of 'member' failed this way, silently.
-- Remove failed the same way, loudly, because that code checked the row count.
--
-- 20251227000000 wrote these three policies and is recorded as applied, but
-- none of them are in the database. The reason is visible in the SQL it used:
-- its INSERT and UPDATE policies read user_organizations from inside a policy
-- ON user_organizations, which recurses (42P17) the moment anyone writes. Only
-- its DELETE policy went through a SECURITY DEFINER function and survived the
-- design. The whole set was evidently dropped afterwards.
--
-- So they are rewritten here to go through public.is_org_admin(uuid), which is
-- SECURITY DEFINER and is already read by the SELECT policy on this table
-- every day without recursing.

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

-- The branch keeps at least one admin.
--
-- These three policies are new power in production, and the screen that uses
-- them lets an admin edit their own row. One mis-click on the only admin of a
-- branch would leave nobody able to appoint another, and no way back except
-- SQL. The count deliberately ignores the row being changed, so demoting
-- yourself is refused while another admin exists and permitted when one does.
CREATE OR REPLACE FUNCTION public.refuse_to_remove_the_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _others integer;
BEGIN
  -- Only a row that is losing its admin tier can leave a branch short.
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
-- 3. What the Board said
-- ---------------------------------------------------------------------------
--
-- One row per board member per request, so the Board is a room of people
-- rather than a single verdict, and each of them can come back and revise
-- their own line without overwriting anybody else's.
--
-- recommended_amount is nullable on purpose: "no change" and "cut this to
-- $4,000" are different answers, and a board member who only wants to say
-- something in words should not have to invent a figure to say it.
--
-- The request itself is untouched by this table. The Board advises; the office
-- still makes the edit and the approval, which is the process as described.

CREATE TABLE IF NOT EXISTS budget.allocation_board_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES budget.allocation_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board_member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board_member_name text NOT NULL,
  recommended_amount numeric(12,2),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT allocation_board_feedback_one_per_member UNIQUE (request_id, board_member_id),
  CONSTRAINT allocation_board_feedback_says_something
    CHECK (recommended_amount IS NOT NULL OR nullif(btrim(comment), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_allocation_board_feedback_request
  ON budget.allocation_board_feedback(request_id);
CREATE INDEX IF NOT EXISTS idx_allocation_board_feedback_org
  ON budget.allocation_board_feedback(organization_id);

DROP TRIGGER IF EXISTS update_allocation_board_feedback_updated_at
  ON budget.allocation_board_feedback;
CREATE TRIGGER update_allocation_board_feedback_updated_at
  BEFORE UPDATE ON budget.allocation_board_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE budget.allocation_board_feedback ENABLE ROW LEVEL SECURITY;

-- Read: the finance office and the Board. NOT the requesting ministry — the
-- Board is weighing one ministry's request against every other ministry's, and
-- that conversation is not addressed to the ministry. What the ministry is
-- owed is the decision, and it gets that in admin_notes on approval.
DROP POLICY IF EXISTS "Office and board can read board feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Office and board can read board feedback"
  ON budget.allocation_board_feedback FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = allocation_board_feedback.organization_id
        AND uo.role IN ('admin', 'treasury', 'finance', 'board')
    )
  );

-- Write: a board member, their own line, nobody else's.
DROP POLICY IF EXISTS "Board members write their own feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Board members write their own feedback"
  ON budget.allocation_board_feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    board_member_id = auth.uid()
    AND public.is_board(organization_id)
  );

DROP POLICY IF EXISTS "Board members revise their own feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Board members revise their own feedback"
  ON budget.allocation_board_feedback FOR UPDATE
  TO authenticated
  USING (board_member_id = auth.uid() AND public.is_board(organization_id))
  WITH CHECK (board_member_id = auth.uid() AND public.is_board(organization_id));

DROP POLICY IF EXISTS "Board members withdraw their own feedback"
  ON budget.allocation_board_feedback;
CREATE POLICY "Board members withdraw their own feedback"
  ON budget.allocation_board_feedback FOR DELETE
  TO authenticated
  USING (board_member_id = auth.uid() AND public.is_board(organization_id));

NOTIFY pgrst, 'reload schema';
