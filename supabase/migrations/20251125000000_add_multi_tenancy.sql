-- Multi-tenancy migration for church branches
-- This migration adds organizations (branches) support and assigns all existing data to MD-Silver Spring Branch

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  country TEXT,
  state TEXT,
  city TEXT,
  address TEXT,
  timezone TEXT DEFAULT 'America/New_York',
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_organizations junction table (many-to-many)
CREATE TABLE public.user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  role app_role DEFAULT 'contributor',
  is_primary BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Add organization_id to rooms
ALTER TABLE public.rooms
ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add organization_id to events
ALTER TABLE public.events
ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add default_organization_id to profiles
ALTER TABLE public.profiles
ADD COLUMN default_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Enable RLS on new tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

-- Create trigger for organizations updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX idx_user_organizations_user_id ON public.user_organizations(user_id);
CREATE INDEX idx_user_organizations_organization_id ON public.user_organizations(organization_id);
CREATE INDEX idx_rooms_organization_id ON public.rooms(organization_id);
CREATE INDEX idx_events_organization_id ON public.events(organization_id);
CREATE INDEX idx_profiles_default_organization_id ON public.profiles(default_organization_id);

-- Insert the first organization (MD-Silver Spring Branch)
INSERT INTO public.organizations (
  id,
  name,
  slug,
  country,
  state,
  city,
  address,
  timezone,
  contact_email,
  website,
  is_active
) VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'ALIC MD - Silver Spring',
  'md-silver-spring',
  'United States',
  'Maryland',
  'Silver Spring',
  '11961 Tech Rd, Silver Spring, MD 20904',
  'America/New_York',
  'info@addislidetchurch.org',
  'https://addislidetchurch.org',
  true
);

-- Assign all existing rooms to MD-Silver Spring Branch
UPDATE public.rooms
SET organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
WHERE organization_id IS NULL;

-- Assign all existing events to MD-Silver Spring Branch
UPDATE public.events
SET organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
WHERE organization_id IS NULL;

-- Assign all existing users to MD-Silver Spring Branch
INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
SELECT
  p.id as user_id,
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' as organization_id,
  COALESCE(
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = p.id LIMIT 1),
    'contributor'::app_role
  ) as role,
  true as is_primary
FROM public.profiles p
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Update profiles with default organization
UPDATE public.profiles
SET default_organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
WHERE default_organization_id IS NULL;

-- Make organization_id NOT NULL after backfilling
ALTER TABLE public.rooms
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.events
ALTER COLUMN organization_id SET NOT NULL;

-- Drop rooms unique constraint on name (allow same room name in different organizations)
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_name_key;

-- Add unique constraint for room name per organization
ALTER TABLE public.rooms ADD CONSTRAINT rooms_name_organization_unique UNIQUE (name, organization_id);

-- =====================================================
-- RLS Policies for Organizations
-- =====================================================

-- Users can view organizations they belong to
CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Allow public to view active organizations (for public calendar)
CREATE POLICY "Public can view active organizations"
  ON public.organizations FOR SELECT
  TO anon
  USING (is_active = true);

-- Admins can manage their organizations
CREATE POLICY "Admins can update their organizations"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- RLS Policies for User Organizations
-- =====================================================

-- Users can view their own organization memberships
CREATE POLICY "Users can view own organization memberships"
  ON public.user_organizations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all memberships in their organizations
CREATE POLICY "Admins can view organization memberships"
  ON public.user_organizations FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can manage memberships in their organizations
CREATE POLICY "Admins can manage organization memberships"
  ON public.user_organizations FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- Update Existing RLS Policies for Multi-tenancy
-- =====================================================

-- Drop existing room policies
DROP POLICY IF EXISTS "Everyone can view active rooms" ON public.rooms;
DROP POLICY IF EXISTS "Admins can manage rooms" ON public.rooms;

-- New room policies with organization filtering
CREATE POLICY "Users can view active rooms in their organizations"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

-- Allow public to view active rooms (for public calendar)
CREATE POLICY "Public can view active rooms"
  ON public.rooms FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Admins can manage rooms in their organizations"
  ON public.rooms FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Drop existing event policies
DROP POLICY IF EXISTS "Users can view published events" ON public.events;
DROP POLICY IF EXISTS "Users can view own events" ON public.events;
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;
DROP POLICY IF EXISTS "Contributors can create events" ON public.events;
DROP POLICY IF EXISTS "Contributors can update own draft/pending events" ON public.events;
DROP POLICY IF EXISTS "Admins can update all events" ON public.events;
DROP POLICY IF EXISTS "Admins can delete events" ON public.events;
DROP POLICY IF EXISTS "Contributors can view pending events" ON public.events;
DROP POLICY IF EXISTS "Public can view published events" ON public.events;
DROP POLICY IF EXISTS "Admins and requestors can delete events" ON public.events;

-- New event policies with organization filtering
CREATE POLICY "Users can view published events in their organizations"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own events in their organizations"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all events in their organizations"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Contributors can view pending events in their organizations"
  ON public.events FOR SELECT
  TO authenticated
  USING (
    status = 'pending_review'
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Contributors can create events in their organizations"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Contributors can update own draft/pending events in their organizations"
  ON public.events FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND status IN ('draft', 'pending_review')
    AND organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update all events in their organizations"
  ON public.events FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.user_organizations
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins and creators can delete events in their organizations"
  ON public.events FOR DELETE
  TO authenticated
  USING (
    (
      organization_id IN (
        SELECT organization_id FROM public.user_organizations
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
    OR (
      created_by = auth.uid()
      AND organization_id IN (
        SELECT organization_id FROM public.user_organizations
        WHERE user_id = auth.uid()
      )
    )
  );

-- Allow public to view published events (for public calendar)
CREATE POLICY "Public can view published events"
  ON public.events FOR SELECT
  TO anon
  USING (status = 'published');

-- =====================================================
-- Update Profile Policies for Multi-tenancy
-- =====================================================

-- Drop existing profile policies and recreate with org filtering
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

-- Users can view profiles in their organizations
CREATE POLICY "Users can view profiles in their organizations"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT uo.user_id FROM public.user_organizations uo
      WHERE uo.organization_id IN (
        SELECT organization_id FROM public.user_organizations
        WHERE user_id = auth.uid()
      )
    )
    OR id = auth.uid()
  );

-- Admins can update profiles in their organizations
CREATE POLICY "Admins can update profiles in their organizations"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT uo.user_id FROM public.user_organizations uo
      WHERE uo.organization_id IN (
        SELECT organization_id FROM public.user_organizations
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
    OR id = auth.uid()
  );

-- Admins can delete profiles in their organizations
CREATE POLICY "Admins can delete profiles in their organizations"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT uo.user_id FROM public.user_organizations uo
      WHERE uo.organization_id IN (
        SELECT organization_id FROM public.user_organizations
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to get user's current organization ID
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT default_organization_id FROM public.profiles WHERE id = _user_id),
    (SELECT organization_id FROM public.user_organizations WHERE user_id = _user_id AND is_primary = true LIMIT 1),
    (SELECT organization_id FROM public.user_organizations WHERE user_id = _user_id LIMIT 1)
  )
$$;

-- Function to check if user belongs to an organization
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = _user_id
      AND organization_id = _org_id
  )
$$;

-- Function to check if user is admin in an organization
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_organizations
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = 'admin'
  )
$$;
