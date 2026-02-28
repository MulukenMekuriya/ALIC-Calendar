-- Allow all authenticated contributors to view approved events in their organizations
CREATE POLICY "Contributors can view approved events in their organizations"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    status = 'approved'
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );
