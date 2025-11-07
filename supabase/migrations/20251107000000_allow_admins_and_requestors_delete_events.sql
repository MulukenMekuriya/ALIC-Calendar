-- Drop the existing delete policy
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;

-- Add policy to allow admins to delete any event at any status
CREATE POLICY "Admins can delete all events"
  ON public.events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add policy to allow event requestors to delete their own events at any status
CREATE POLICY "Requestors can delete their own events"
  ON public.events FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());
