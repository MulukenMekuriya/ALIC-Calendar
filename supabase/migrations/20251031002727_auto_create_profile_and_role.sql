-- Create function to automatically create profile and assign contributor role on signup
-- This triggers when invited user confirms their email and completes signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create profile if user has confirmed their email (completed invite signup)
  IF NEW.email_confirmed_at IS NOT NULL THEN
    -- Create profile entry (use metadata if available, otherwise email)
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      NEW.email
    )
    ON CONFLICT (id) DO NOTHING;

    -- Assign contributor role by default
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'contributor')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for both INSERT and UPDATE
-- INSERT: handles new user creation
-- UPDATE: handles when invited user confirms email
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
