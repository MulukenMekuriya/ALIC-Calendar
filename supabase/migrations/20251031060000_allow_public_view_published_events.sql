-- Allow anonymous (public) users to view published events
-- This enables the public calendar to display events without authentication

CREATE POLICY "Public can view published events"
  ON public.events FOR SELECT
  TO anon
  USING (status = 'published');

-- Also allow anonymous users to view active rooms
-- So the public calendar can display room information
CREATE POLICY "Public can view active rooms"
  ON public.rooms FOR SELECT
  TO anon
  USING (is_active = true);
