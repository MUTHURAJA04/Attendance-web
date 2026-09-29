-- Migration: Complete Fix for Auth Schema & "Database error querying schema"
-- Ensures GoTrue can authenticate branchadmin@gmail.com, brandadmin@gmail.com, and all accounts

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. DISABLE RLS ON AUTH SCHEMA TABLES (GoTrue manages auth internally)
-- ============================================================================
ALTER TABLE IF EXISTS auth.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auth.identities DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auth.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS auth.refresh_tokens DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. GRANT FULL PERMISSIONS TO SUPABASE AUTH ROLES
-- ============================================================================
GRANT ALL ON SCHEMA auth TO postgres, supabase_auth_admin, service_role, authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres, supabase_auth_admin, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO postgres, supabase_auth_admin, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO postgres, supabase_auth_admin, service_role;

GRANT ALL ON SCHEMA public TO postgres, supabase_auth_admin, service_role, authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, supabase_auth_admin, service_role, authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, supabase_auth_admin, service_role, authenticated, anon;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, supabase_auth_admin, service_role, authenticated, anon;

-- ============================================================================
-- 3. ENSURE CLEAN IDENTITIES FOR ALL USERS (Fixes GoTrue Schema Query Failure)
-- ============================================================================
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN (SELECT id, email, raw_user_meta_data FROM auth.users WHERE email IS NOT NULL) LOOP
    -- Delete any corrupted identity for this user
    DELETE FROM auth.identities WHERE user_id = u.id AND provider = 'email';
    
    -- Insert clean identity record
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
      u.id,
      u.id,
      jsonb_build_object('sub', u.id::text, 'email', lower(trim(u.email))),
      'email',
      u.id::text,
      now(),
      now(),
      now()
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 4. ENSURE BRANCHADMIN@GMAIL.COM IS FULLY REGISTERED WITH VERIFIED PASSWORD
-- Password: Branch@123456
-- ============================================================================
DO $$
DECLARE
  v_branch_admin_id uuid := gen_random_uuid();
  v_branch_id uuid;
  v_brand_id uuid;
BEGIN
  -- Get default branch & brand
  SELECT id, brand_id INTO v_branch_id, v_brand_id FROM branches LIMIT 1;

  -- Create or Update branchadmin@gmail.com
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'branchadmin@gmail.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_branch_admin_id,
      'authenticated',
      'authenticated',
      'branchadmin@gmail.com',
      crypt('Branch@123456', gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', 'BRANCH_ADMIN', 'full_name', 'Branch Admin', 'branch_id', v_branch_id, 'brand_id', v_brand_id),
      now(),
      now(),
      '',
      ''
    );
  ELSE
    SELECT id INTO v_branch_admin_id FROM auth.users WHERE lower(email) = 'branchadmin@gmail.com';
    UPDATE auth.users
    SET encrypted_password = crypt('Branch@123456', gen_salt('bf', 10)),
        raw_user_meta_data = jsonb_build_object('role', 'BRANCH_ADMIN', 'full_name', 'Branch Admin', 'branch_id', v_branch_id, 'brand_id', v_brand_id),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_branch_admin_id;
  END IF;

  -- Sync identity
  DELETE FROM auth.identities WHERE user_id = v_branch_admin_id AND provider = 'email';
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
    v_branch_admin_id,
    v_branch_admin_id,
    jsonb_build_object('sub', v_branch_admin_id::text, 'email', 'branchadmin@gmail.com'),
    'email',
    v_branch_admin_id::text,
    now(),
    now(),
    now()
  );

  -- Sync profile
  INSERT INTO profiles (
    id, role, branch_id, brand_id, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_branch_admin_id, 'BRANCH_ADMIN', v_branch_id, v_brand_id, 'Branch Admin', 'branchadmin@gmail.com', true, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'BRANCH_ADMIN',
    branch_id = v_branch_id,
    brand_id = v_brand_id,
    full_name = 'Branch Admin',
    email = 'branchadmin@gmail.com',
    is_active = true,
    updated_at = now();

END;
$$;

-- ============================================================================
-- 5. ENSURE BRANDADMIN@GMAIL.COM IS FULLY REGISTERED
-- Password: Brand@123456
-- ============================================================================
DO $$
DECLARE
  v_brand_admin_id uuid := gen_random_uuid();
  v_brand_id uuid;
BEGIN
  SELECT id INTO v_brand_id FROM brands LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'brandadmin@gmail.com') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_brand_admin_id,
      'authenticated',
      'authenticated',
      'brandadmin@gmail.com',
      crypt('Brand@123456', gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', 'BRAND_ADMIN', 'full_name', 'Brand Admin', 'brand_id', v_brand_id),
      now(),
      now(),
      '',
      ''
    );
  ELSE
    SELECT id INTO v_brand_admin_id FROM auth.users WHERE lower(email) = 'brandadmin@gmail.com';
    UPDATE auth.users
    SET encrypted_password = crypt('Brand@123456', gen_salt('bf', 10)),
        raw_user_meta_data = jsonb_build_object('role', 'BRAND_ADMIN', 'full_name', 'Brand Admin', 'brand_id', v_brand_id),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_brand_admin_id;
  END IF;

  DELETE FROM auth.identities WHERE user_id = v_brand_admin_id AND provider = 'email';
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
    v_brand_admin_id,
    v_brand_admin_id,
    jsonb_build_object('sub', v_brand_admin_id::text, 'email', 'brandadmin@gmail.com'),
    'email',
    v_brand_admin_id::text,
    now(),
    now(),
    now()
  );

  INSERT INTO profiles (
    id, role, branch_id, brand_id, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_brand_admin_id, 'BRAND_ADMIN', NULL, v_brand_id, 'Brand Admin', 'brandadmin@gmail.com', true, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'BRAND_ADMIN',
    brand_id = v_brand_id,
    full_name = 'Brand Admin',
    email = 'brandadmin@gmail.com',
    is_active = true,
    updated_at = now();

END;
$$;
