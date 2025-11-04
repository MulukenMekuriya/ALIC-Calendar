-- Migration: Allow contributors to view all pending_review events
-- This enables contributors to see what rooms/times are already requested
-- and get notified about conflicts in the UI
-- Date: 2025-11-03

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view own events" ON public.events;

-- Create new policies for better granularity
-- Users can still view their own events regardless of status
CREATE POLICY "Users can view own events"
  ON public.events FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- Contributors can now view all pending_review events
-- This allows them to see what rooms/times are already requested by others
CREATE POLICY "Contributors can view pending_review events"
  ON public.events FOR SELECT
  TO authenticated
  USING (status = 'pending_review');
