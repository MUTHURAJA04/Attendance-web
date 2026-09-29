-- Migration: Add multi-brand and multi-branch support to profiles and fn_admin_create_user
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Add brand_ids and branch_ids array columns to profiles if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'brand_ids'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN brand_ids uuid[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'branch_ids'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN branch_ids uuid[] DEFAULT '{}';
  END IF;
END $$;

-- 2. Populate brand_ids and branch_ids from existing brand_id and branch_id
UPDATE public.profiles
SET brand_ids = ARRAY[brand_id]
WHERE brand_id IS NOT NULL AND (brand_ids IS NULL OR cardinality(brand_ids) = 0);

UPDATE public.profiles
SET branch_ids = ARRAY[branch_id]
WHERE branch_id IS NOT NULL AND (branch_ids IS NULL OR cardinality(branch_ids) = 0);

-- 3. Upgrade fn_admin_create_user to support multi-select brand_ids and branch_ids
CREATE OR REPLACE FUNCTION fn_admin_create_user_v2(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_brand_ids uuid[] DEFAULT '{}',
  p_branch_ids uuid[] DEFAULT '{}',
  p_is_active boolean DEFAULT true
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_clean_email text := lower(trim(p_email));
  v_clean_role text := UPPER(trim(p_role));
  v_primary_brand_id uuid := NULL;
  v_primary_branch_id uuid := NULL;
BEGIN
  IF v_clean_email IS NULL OR v_clean_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  IF cardinality(p_brand_ids) > 0 THEN
    v_primary_brand_id := p_brand_ids[1];
  END IF;

  IF cardinality(p_branch_ids) > 0 THEN
    v_primary_branch_id := p_branch_ids[1];
  END IF;

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
          'brand_id', v_primary_brand_id,
          'branch_id', v_primary_branch_id,
          'brand_ids', p_brand_ids,
          'branch_ids', p_branch_ids
        ),
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change = '',
        phone_change = '',
        phone_change_token = '',
        email_change_token_current = '',
        reauthentication_token = '',
        email_change_confirm_status = 0,
        is_super_admin = false,
        is_sso_user = false,
        is_anonymous = false,
        updated_at = now()
    WHERE id = v_user_id;

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
      email_change_token_new,
      email_change,
      phone_change,
      phone_change_token,
      email_change_token_current,
      reauthentication_token,
      email_change_confirm_status,
      is_super_admin,
      is_sso_user,
      is_anonymous
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
        'brand_id', v_primary_brand_id,
        'branch_id', v_primary_branch_id,
        'brand_ids', p_brand_ids,
        'branch_ids', p_branch_ids
      ),
      now(),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      0,
      false,
      false,
      false
    );

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

  INSERT INTO public.profiles (
    id, role, branch_id, brand_id, brand_ids, branch_ids, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_user_id, v_clean_role, v_primary_branch_id, v_primary_brand_id, p_brand_ids, p_branch_ids, p_full_name, v_clean_email, p_is_active, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = v_clean_role,
    branch_id = v_primary_branch_id,
    brand_id = v_primary_brand_id,
    brand_ids = p_brand_ids,
    branch_ids = p_branch_ids,
    full_name = p_full_name,
    email = v_clean_email,
    is_active = p_is_active,
    updated_at = now();

  RETURN jsonb_build_object(
    'id', v_user_id,
    'email', v_clean_email,
    'role', v_clean_role,
    'full_name', p_full_name,
    'brand_id', v_primary_brand_id,
    'branch_id', v_primary_branch_id,
    'brand_ids', p_brand_ids,
    'branch_ids', p_branch_ids,
    'is_active', p_is_active
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Stored Procedure to Update a User with Multi-Brand & Multi-Branch Support
CREATE OR REPLACE FUNCTION fn_admin_update_user_v2(
  p_id uuid,
  p_full_name text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_brand_ids uuid[] DEFAULT NULL,
  p_branch_ids uuid[] DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_clean_role text := CASE WHEN p_role IS NOT NULL THEN UPPER(trim(p_role)) ELSE NULL END;
  v_primary_brand_id uuid := NULL;
  v_primary_branch_id uuid := NULL;
  v_meta jsonb;
BEGIN
  IF p_brand_ids IS NOT NULL AND cardinality(p_brand_ids) > 0 THEN
    v_primary_brand_id := p_brand_ids[1];
  END IF;

  IF p_branch_ids IS NOT NULL AND cardinality(p_branch_ids) > 0 THEN
    v_primary_branch_id := p_branch_ids[1];
  END IF;

  -- 1. Update password in auth.users if provided
  IF p_password IS NOT NULL AND length(trim(p_password)) >= 6 THEN
    UPDATE auth.users
    SET encrypted_password = crypt(trim(p_password), gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = p_id;
  END IF;

  -- 2. Build metadata to update in auth.users
  SELECT raw_user_meta_data INTO v_meta FROM auth.users WHERE id = p_id;
  v_meta := COALESCE(v_meta, '{}'::jsonb);

  IF p_full_name IS NOT NULL THEN
    v_meta := jsonb_set(v_meta, '{full_name}', to_jsonb(p_full_name));
  END IF;
  IF v_clean_role IS NOT NULL THEN
    v_meta := jsonb_set(v_meta, '{role}', to_jsonb(v_clean_role));
  END IF;
  IF p_brand_ids IS NOT NULL THEN
    v_meta := jsonb_set(v_meta, '{brand_ids}', to_jsonb(p_brand_ids));
    IF v_primary_brand_id IS NOT NULL THEN
      v_meta := jsonb_set(v_meta, '{brand_id}', to_jsonb(v_primary_brand_id::text));
    ELSE
      v_meta := jsonb_set(v_meta, '{brand_id}', 'null'::jsonb);
    END IF;
  END IF;
  IF p_branch_ids IS NOT NULL THEN
    v_meta := jsonb_set(v_meta, '{branch_ids}', to_jsonb(p_branch_ids));
    IF v_primary_branch_id IS NOT NULL THEN
      v_meta := jsonb_set(v_meta, '{branch_id}', to_jsonb(v_primary_branch_id::text));
    ELSE
      v_meta := jsonb_set(v_meta, '{branch_id}', 'null'::jsonb);
    END IF;
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = v_meta,
      updated_at = now()
  WHERE id = p_id;

  -- 3. Update profiles table
  UPDATE public.profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    role = COALESCE(v_clean_role, role),
    brand_id = CASE WHEN p_brand_ids IS NOT NULL THEN v_primary_brand_id ELSE brand_id END,
    branch_id = CASE WHEN p_branch_ids IS NOT NULL THEN v_primary_branch_id ELSE branch_id END,
    brand_ids = CASE WHEN p_brand_ids IS NOT NULL THEN p_brand_ids ELSE brand_ids END,
    branch_ids = CASE WHEN p_branch_ids IS NOT NULL THEN p_branch_ids ELSE branch_ids END,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_id,
    'role', v_clean_role,
    'full_name', p_full_name,
    'brand_id', v_primary_brand_id,
    'branch_id', v_primary_branch_id,
    'brand_ids', p_brand_ids,
    'branch_ids', p_branch_ids,
    'is_active', p_is_active
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Stored Procedure to Delete a User
CREATE OR REPLACE FUNCTION fn_admin_delete_user(
  p_id uuid
)
RETURNS jsonb AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = p_id;
  DELETE FROM auth.identities WHERE user_id = p_id;
  DELETE FROM auth.users WHERE id = p_id;
  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant Permissions
GRANT EXECUTE ON FUNCTION fn_admin_create_user_v2(text, text, text, text, uuid[], uuid[], boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_admin_update_user_v2(uuid, text, text, uuid[], uuid[], boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_admin_delete_user(uuid) TO anon, authenticated, service_role;
