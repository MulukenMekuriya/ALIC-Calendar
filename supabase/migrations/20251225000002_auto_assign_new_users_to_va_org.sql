-- Migration: Auto-assign new users to VA-Springfield organization as contributors
-- When users sign up, they will automatically be added to the VA organization

-- Update the handle_new_user function to also assign users to VA organization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  va_org_id UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
BEGIN
  -- Only create profile if user has confirmed their email (completed invite signup)
  IF NEW.email_confirmed_at IS NOT NULL THEN
    -- Create profile entry (use metadata if available, otherwise email)
    INSERT INTO public.profiles (id, full_name, email, default_organization_id)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NEW.email,
      va_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
      default_organization_id = COALESCE(profiles.default_organization_id, va_org_id);

    -- Assign contributor role by default (legacy table)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'contributor')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Assign user to VA organization as contributor
    INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
    VALUES (NEW.id, va_org_id, 'contributor', true)
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Note: The trigger on_auth_user_created already exists, so no need to recreate it
