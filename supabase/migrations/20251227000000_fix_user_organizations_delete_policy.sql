-- Fix DELETE policy for user_organizations table
-- The existing "FOR ALL" policy has recursion issues when deleting

-- Drop the existing ALL policy and create separate policies for each operation
DROP POLICY IF EXISTS "Admins can manage organization memberships" ON public.user_organizations;

-- Create INSERT policy for admins
CREATE POLICY "Admins can insert organization memberships"
  ON public.user_organizations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.role = 'admin'
        AND uo.organization_id = organization_id
    )
  );

-- Create UPDATE policy for admins
CREATE POLICY "Admins can update organization memberships"
  ON public.user_organizations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.role = 'admin'
        AND uo.organization_id = user_organizations.organization_id
    )
  );

-- Create DELETE policy for admins using a security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.can_admin_delete_user_org(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND organization_id = target_org_id
  )
$$;

CREATE POLICY "Admins can delete organization memberships"
  ON public.user_organizations FOR DELETE
  TO authenticated
  USING (
    public.can_admin_delete_user_org(organization_id)
  );
