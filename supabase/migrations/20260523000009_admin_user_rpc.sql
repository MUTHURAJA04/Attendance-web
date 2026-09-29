-- Migration: Admin User Creation & Management RPC Functions
-- Allows direct, secure user management bypassing external Auth API limitations

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Ensure profiles table has all necessary fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Ensure kingsail108@gmail.com has SUPER_ADMIN role in auth.users and profiles
DO $$
DECLARE
  v_super_user_id uuid;
BEGIN
  SELECT id INTO v_super_user_id FROM auth.users WHERE lower(email) = 'kingsail108@gmail.com' LIMIT 1;
  IF v_super_user_id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_build_object('role', 'SUPER_ADMIN', 'full_name', 'Super Admin'),
        email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_super_user_id;

    INSERT INTO profiles (id, role, branch_id, brand_id, full_name, email, is_active, updated_at)
    VALUES (v_super_user_id, 'SUPER_ADMIN', NULL, NULL, 'Super Admin', 'kingsail108@gmail.com', true, now())
    ON CONFLICT (id) DO UPDATE SET
      role = 'SUPER_ADMIN',
      full_name = 'Super Admin',
      email = 'kingsail108@gmail.com',
      is_active = true,
      updated_at = now();
  END IF;
END;
$$;

-- 3. Stored Procedure to Create a New User
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

  -- Check if user already exists in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email;
    
    -- Update existing auth user password and metadata
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
    -- Insert new auth user with confirmed email
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

  -- Upsert profile record
  INSERT INTO profiles (
    id,
    role,
    branch_id,
    brand_id,
    full_name,
    email,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_clean_role,
    p_branch_id,
    p_brand_id,
    p_full_name,
    v_clean_email,
    true,
    now(),
    now()
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

-- 4. Stored Procedure to Update a User
CREATE OR REPLACE FUNCTION fn_admin_update_user(
  p_id uuid,
  p_full_name text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_brand_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_clean_role text := CASE WHEN p_role IS NOT NULL THEN UPPER(trim(p_role)) ELSE NULL END;
BEGIN
  -- Update auth.users if password or metadata changed
  IF p_password IS NOT NULL AND length(p_password) >= 6 THEN
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_id;
  END IF;

  IF v_clean_role IS NOT NULL OR p_full_name IS NOT NULL OR p_brand_id IS NOT NULL OR p_branch_id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'role', v_clean_role,
      'full_name', p_full_name,
      'brand_id', p_brand_id,
      'branch_id', p_branch_id
    )),
    updated_at = now()
    WHERE id = p_id;
  END IF;

  -- Update profiles
  UPDATE profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    role = COALESCE(v_clean_role, role),
    brand_id = CASE WHEN p_brand_id IS NOT NULL THEN p_brand_id ELSE brand_id END,
    branch_id = CASE WHEN p_branch_id IS NOT NULL THEN p_branch_id ELSE branch_id END,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Stored Procedure to Delete a User
CREATE OR REPLACE FUNCTION fn_admin_delete_user(
  p_id uuid
)
RETURNS jsonb AS $$
BEGIN
  DELETE FROM profiles WHERE id = p_id;
  DELETE FROM auth.users WHERE id = p_id;
  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Permissions
GRANT EXECUTE ON FUNCTION fn_admin_create_user(text, text, text, text, uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_admin_update_user(uuid, text, text, uuid, uuid, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_admin_delete_user(uuid) TO anon, authenticated, service_role;
