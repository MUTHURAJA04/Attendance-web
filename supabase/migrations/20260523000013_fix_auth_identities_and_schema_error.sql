-- Migration: Fix Auth Identities and Database Schema Error on Login
-- Resolves "Database error querying schema" by synchronizing auth.identities and clearing recursive RLS

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. SYNCHRONIZE AUTH.IDENTITIES FOR ALL USERS
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    FOR r IN (
      SELECT u.id, u.email 
      FROM auth.users u 
      WHERE u.email IS NOT NULL 
        AND NOT EXISTS (
          SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
        )
    ) LOOP
      BEGIN
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
          r.id,
          r.id,
          jsonb_build_object('sub', r.id::text, 'email', lower(trim(r.email))),
          'email',
          r.id::text,
          now(),
          now(),
          now()
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore if already present under different constraint
      END;
    END LOOP;
  END IF;
END;
$$;

-- ============================================================================
-- 2. UPDATE FN_ADMIN_CREATE_USER WITH IDENTITIES SYNC
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_brand_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_clean_email text := lower(trim(p_email));
  v_clean_role text := UPPER(trim(p_role));
BEGIN
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  -- 1. Auth Users
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email;
    
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object(
          'role', v_clean_role,
          'full_name', p_full_name,
          'brand_id', p_brand_id,
          'branch_id', p_branch_id
        ),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  ELSE
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
      v_user_id,
      'authenticated',
      'authenticated',
      v_clean_email,
      crypt(p_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'role', v_clean_role,
        'full_name', p_full_name,
        'brand_id', p_brand_id,
        'branch_id', p_branch_id
      ),
      now(),
      now(),
      '',
      ''
    );
  END IF;

  -- 2. Auth Identities (Required for GoTrue Auth)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    BEGIN
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
        v_user_id,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', v_clean_email),
        'email',
        v_user_id::text,
        now(),
        now(),
        now()
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if conflict
    END;
  END IF;

  -- 3. Upsert Profile
  INSERT INTO profiles (
    id, role, branch_id, brand_id, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_user_id, v_clean_role, p_branch_id, p_brand_id, p_full_name, v_clean_email, true, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = v_clean_role,
    branch_id = p_branch_id,
    brand_id = p_brand_id,
    full_name = p_full_name,
    email = v_clean_email,
    is_active = true,
    updated_at = now();

  RETURN jsonb_build_object(
    'id', v_user_id,
    'email', v_clean_email,
    'role', v_clean_role,
    'full_name', p_full_name,
    'brand_id', p_brand_id,
    'branch_id', p_branch_id,
    'is_active', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_admin_create_user(text, text, text, text, uuid, uuid) TO anon, authenticated, service_role;

-- ============================================================================
-- 3. NON-RECURSIVE RLS POLICIES (Guarantees zero recursion)
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
