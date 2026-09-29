-- Migration: Fix Database Error Querying Schema by Cloning Valid Auth Structure
-- Ensures branchadmin@gmail.com, brandadmin@gmail.com, and manager accounts match exact GoTrue schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_template_instance uuid;
  v_template_aud text := 'authenticated';
  v_template_role text := 'authenticated';
  v_branch_id uuid;
  v_brand_id uuid;
  v_branch_admin_id uuid := gen_random_uuid();
  v_brand_admin_id uuid := gen_random_uuid();
BEGIN
  -- 1. Get instance_id and defaults from existing working user if available
  SELECT instance_id, aud, role INTO v_template_instance, v_template_aud, v_template_role 
  FROM auth.users 
  WHERE email = 'kingsail108@gmail.com' 
  LIMIT 1;

  -- 2. Get first branch & brand
  SELECT id, brand_id INTO v_branch_id, v_brand_id FROM public.branches LIMIT 1;

  -- 3. Clean any existing broken entries
  DELETE FROM auth.identities WHERE user_id IN (
    SELECT id FROM auth.users WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com')
  );
  DELETE FROM auth.users WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com');
  DELETE FROM public.profiles WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com');

  -- 4. INSERT BRANCH ADMIN (branchadmin@gmail.com / Branch@123456)
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
    is_sso_user,
    deleted_at
  ) VALUES (
    v_template_instance,
    v_branch_admin_id,
    COALESCE(v_template_aud, 'authenticated'),
    COALESCE(v_template_role, 'authenticated'),
    'branchadmin@gmail.com',
    crypt('Branch@123456', gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', 'BRANCH_ADMIN', 'full_name', 'Branch Admin', 'branch_id', v_branch_id, 'brand_id', v_brand_id),
    now(),
    now(),
    '',
    '',
    false,
    false,
    null
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
    gen_random_uuid(),
    v_branch_admin_id,
    jsonb_build_object('sub', v_branch_admin_id::text, 'email', 'branchadmin@gmail.com'),
    'email',
    v_branch_admin_id::text,
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id, role, branch_id, brand_id, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_branch_admin_id, 'BRANCH_ADMIN', v_branch_id, v_brand_id, 'Branch Admin', 'branchadmin@gmail.com', true, now(), now()
  );

  -- 5. INSERT BRAND ADMIN (brandadmin@gmail.com / Brand@123456)
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
    is_sso_user,
    deleted_at
  ) VALUES (
    v_template_instance,
    v_brand_admin_id,
    COALESCE(v_template_aud, 'authenticated'),
    COALESCE(v_template_role, 'authenticated'),
    'brandadmin@gmail.com',
    crypt('Brand@123456', gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', 'BRAND_ADMIN', 'full_name', 'Brand Admin', 'brand_id', v_brand_id),
    now(),
    now(),
    '',
    '',
    false,
    false,
    null
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
    gen_random_uuid(),
    v_brand_admin_id,
    jsonb_build_object('sub', v_brand_admin_id::text, 'email', 'brandadmin@gmail.com'),
    'email',
    v_brand_admin_id::text,
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id, role, branch_id, brand_id, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_brand_admin_id, 'BRAND_ADMIN', NULL, v_brand_id, 'Brand Admin', 'brandadmin@gmail.com', true, now(), now()
  );

END;
$$;
