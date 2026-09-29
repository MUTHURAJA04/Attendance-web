-- Migration: Clean Safe Account & RLS Repair (No DDL on auth schema)
-- Safe to execute in Supabase SQL Editor as 'postgres' role

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CLEAN PROFILES POLICIES & HELPER FUNCTIONS (Zero Recursion)
-- ============================================================================
CREATE OR REPLACE FUNCTION is_role(role_name text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = role_name,
    (auth.jwt() -> 'app_metadata' ->> 'role') = role_name,
    false
  );
$$;

CREATE OR REPLACE FUNCTION is_any_role(role_names text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = ANY(role_names),
    (auth.jwt() -> 'app_metadata' ->> 'role') = ANY(role_names),
    false
  );
$$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles self read" ON profiles;
DROP POLICY IF EXISTS "profiles self update" ON profiles;
DROP POLICY IF EXISTS "profiles_read_all_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_write_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;
DROP POLICY IF EXISTS "profiles_write_all" ON profiles;

CREATE POLICY "profiles_read_all" ON profiles FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "profiles_write_all" ON profiles FOR ALL TO authenticated, anon USING (true);

GRANT ALL ON profiles TO authenticated, anon;
GRANT ALL ON brands TO authenticated, anon;
GRANT ALL ON branches TO authenticated, anon;
GRANT ALL ON employees TO authenticated, anon;

-- ============================================================================
-- 2. SYNC IDENTITIES FOR ALL USERS (Fixes GoTrue Schema Query Failure)
-- ============================================================================
DO $$
DECLARE
  u RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    FOR u IN (SELECT id, email FROM auth.users WHERE email IS NOT NULL) LOOP
      -- Remove duplicate or corrupted identity
      DELETE FROM auth.identities WHERE user_id = u.id AND provider = 'email';
      
      -- Insert verified identity
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
  END IF;
END;
$$;

-- ============================================================================
-- 3. SETUP / RESET branchadmin@gmail.com (Password: Branch@123456)
-- ============================================================================
DO $$
DECLARE
  v_branch_admin_id uuid := gen_random_uuid();
  v_branch_id uuid;
  v_brand_id uuid;
BEGIN
  SELECT id, brand_id INTO v_branch_id, v_brand_id FROM branches LIMIT 1;

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

  -- Ensure identity exists
  DELETE FROM auth.identities WHERE user_id = v_branch_admin_id AND provider = 'email';
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_branch_admin_id, v_branch_admin_id, jsonb_build_object('sub', v_branch_admin_id::text, 'email', 'branchadmin@gmail.com'),
    'email', v_branch_admin_id::text, now(), now(), now()
  );

  -- Ensure profile exists
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
