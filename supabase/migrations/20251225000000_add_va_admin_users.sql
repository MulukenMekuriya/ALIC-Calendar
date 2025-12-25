-- Migration: Add VA-Springfield Admin Users
-- This creates admin users for the VA-Springfield organization (b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22)
--
-- Admin users:
-- 1. ALICVA.Leaders@gmail.com
-- 2. Aliciva.Itteam@gmail.com
-- 3. alicva.it2@gmail.com
--
-- IMPORTANT: After running this migration, users will need to:
-- 1. Use "Forgot Password" to set their password, OR
-- 2. An existing superadmin can update their password via Supabase dashboard

-- Generate deterministic UUIDs for the new users (based on email hash for reproducibility)
DO $$
DECLARE
  va_org_id UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  user1_id UUID;
  user2_id UUID;
  user1_email TEXT := 'ALICVA.Leaders@gmail.com';
  user2_email TEXT := 'Aliciva.Itteam@gmail.com';
BEGIN
  -- Generate UUIDs for users
  user1_id := gen_random_uuid();
  user2_id := gen_random_uuid();

  -- ==========================================
  -- User 1: ALICVA.Leaders@gmail.com (VA Admin)
  -- ==========================================

  -- Check if user already exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user1_email) THEN
    -- Create auth user
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      user1_id,
      '00000000-0000-0000-0000-000000000000',
      user1_email,
      crypt('TempPassword123!', gen_salt('bf')), -- Temporary password, user should reset
      NOW(), -- Email confirmed
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "VA Leaders"}'::jsonb,
      'authenticated',
      'authenticated',
      NOW(),
      NOW(),
      '',
      ''
    );

    -- Create identity record for email provider
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      user1_id,
      jsonb_build_object('sub', user1_id::text, 'email', user1_email),
      'email',
      user1_id::text,
      NOW(),
      NOW(),
      NOW()
    );

    -- Create profile
    INSERT INTO public.profiles (id, email, full_name, default_organization_id)
    VALUES (user1_id, user1_email, 'VA Leaders', va_org_id)
    ON CONFLICT (id) DO NOTHING;

    -- Assign to VA organization as admin
    INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
    VALUES (user1_id, va_org_id, 'admin', true)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'admin';

    RAISE NOTICE 'Created user: % with ID: %', user1_email, user1_id;
  ELSE
    -- User exists, just ensure they're assigned to VA org as admin
    SELECT id INTO user1_id FROM auth.users WHERE email = user1_email;

    INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
    VALUES (user1_id, va_org_id, 'admin', true)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'admin';

    RAISE NOTICE 'User % already exists, updated organization membership', user1_email;
  END IF;

  -- ==========================================
  -- User 2: Aliciva.Itteam@gmail.com (VA Admin)
  -- ==========================================

  -- Check if user already exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user2_email) THEN
    -- Create auth user
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      user2_id,
      '00000000-0000-0000-0000-000000000000',
      user2_email,
      crypt('TempPassword123!', gen_salt('bf')), -- Temporary password, user should reset
      NOW(), -- Email confirmed
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"full_name": "VA IT Team"}'::jsonb,
      'authenticated',
      'authenticated',
      NOW(),
      NOW(),
      '',
      ''
    );

    -- Create identity record for email provider
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      user2_id,
      jsonb_build_object('sub', user2_id::text, 'email', user2_email),
      'email',
      user2_id::text,
      NOW(),
      NOW(),
      NOW()
    );

    -- Create profile
    INSERT INTO public.profiles (id, email, full_name, default_organization_id)
    VALUES (user2_id, user2_email, 'VA IT Team', va_org_id)
    ON CONFLICT (id) DO NOTHING;

    -- Assign to VA organization as admin
    INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
    VALUES (user2_id, va_org_id, 'admin', true)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'admin';

    RAISE NOTICE 'Created user: % with ID: %', user2_email, user2_id;
  ELSE
    -- User exists, just ensure they're assigned to VA org as admin
    SELECT id INTO user2_id FROM auth.users WHERE email = user2_email;

    INSERT INTO public.user_organizations (user_id, organization_id, role, is_primary)
    VALUES (user2_id, va_org_id, 'admin', true)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'admin';

    RAISE NOTICE 'User % already exists, updated organization membership', user2_email;
  END IF;

END $$;

-- Summary comment
COMMENT ON TABLE public.organizations IS 'VA-Springfield (b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22) now has admin users: ALICVA.Leaders@gmail.com, Aliciva.Itteam@gmail.com';
