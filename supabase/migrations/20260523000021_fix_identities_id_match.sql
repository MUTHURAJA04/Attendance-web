-- Migration: Permanent GoTrue Auth Fix with UUID type for auth.identities.id
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Redefine fn_admin_create_user with uuid id and text provider_id
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

  -- 1. Check if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_clean_email) THEN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_clean_email;

    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = jsonb_build_object(
          'sub', v_user_id::text,
          'email', v_clean_email,
          'email_verified', true,
          'phone_verified', false,
          'full_name', p_full_name,
          'role', v_clean_role,
          'brand_id', p_brand_id,
          'branch_id', p_branch_id
        ),
        confirmation_token = NULL,
        recovery_token = NULL,
        updated_at = now()
    WHERE id = v_user_id;

    -- Refresh Identity with id = v_user_id (UUID)
    DELETE FROM auth.identities WHERE user_id = v_user_id;
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
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_clean_email,
        'email_verified', true,
        'phone_verified', false,
        'full_name', p_full_name,
        'role', v_clean_role
      ),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );

  ELSE
    -- Insert new auth user
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
      recovery_token,
      is_super_admin,
      is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_clean_email,
      crypt(p_password, gen_salt('bf', 10)),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_clean_email,
        'email_verified', true,
        'phone_verified', false,
        'full_name', p_full_name,
        'role', v_clean_role,
        'brand_id', p_brand_id,
        'branch_id', p_branch_id
      ),
      now(),
      now(),
      NULL,
      NULL,
      false,
      false
    );

    -- Insert identity where id = v_user_id (UUID)
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
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', v_clean_email,
        'email_verified', true,
        'phone_verified', false,
        'full_name', p_full_name,
        'role', v_clean_role
      ),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  END IF;

  -- 2. Upsert profile
  INSERT INTO public.profiles (
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

-- 2. Clean and resync all identities with UUID id
DO $$
BEGIN
  DELETE FROM auth.identities;

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    u.id,
    u.id,
    jsonb_build_object(
      'sub', u.id::text,
      'email', lower(u.email),
      'email_verified', true,
      'phone_verified', false,
      'role', COALESCE(u.raw_user_meta_data->>'role', 'BRANCH_STAFF'),
      'full_name', COALESCE(u.raw_user_meta_data->>'full_name', u.email)
    ),
    'email',
    u.id::text,
    now(),
    now(),
    now()
  FROM auth.users u
  WHERE u.email IS NOT NULL;

  UPDATE auth.users
  SET confirmation_token = NULL,
      recovery_token = NULL,
      email_confirmed_at = COALESCE(email_confirmed_at, now());
END $$;
