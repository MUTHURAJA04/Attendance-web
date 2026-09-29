-- Migration: Complete Clean Auth Fix for Branch Admin and Brand Admin
-- Run this in Supabase SQL Editor to resolve "Database error querying schema" and enable login with password "123456"

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_branch_admin_id uuid := '9c150d97-baed-4e4e-aeef-346064ec0714'::uuid;
  v_brand_admin_id uuid := 'ac53e4e8-5f2d-43a5-b847-8af83d290a77'::uuid;
  v_brand_id uuid := 'faa5598a-d3de-4533-96c0-5ed1b83d8e1a'::uuid; -- Annalakshmi
  v_branch_id uuid := '43950423-02f5-4878-8558-75c48ce8e743'::uuid; -- KALR1
  v_annalakshmi_org_id uuid;
BEGIN
  -- 1. Ensure Brand and Branch exist
  SELECT organization_id INTO v_annalakshmi_org_id FROM public.brands WHERE id = v_brand_id;
  
  -- If KALR1 branch does not exist, get first branch of Annalakshmi
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = v_branch_id) THEN
    SELECT id INTO v_branch_id FROM public.branches WHERE brand_id = v_brand_id LIMIT 1;
  END IF;

  -- 2. Clean any existing identities and users for these emails
  DELETE FROM auth.identities 
  WHERE user_id IN (
    SELECT id FROM auth.users WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com')
  );

  DELETE FROM auth.users 
  WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com');

  DELETE FROM public.profiles 
  WHERE lower(email) IN ('branchadmin@gmail.com', 'brandadmin@gmail.com')
     OR id IN (v_branch_admin_id, v_brand_admin_id);

  -- 3. INSERT BRANCH ADMIN (branchadmin@gmail.com / 123456)
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
    '00000000-0000-0000-0000-000000000000',
    v_branch_admin_id,
    'authenticated',
    'authenticated',
    'branchadmin@gmail.com',
    crypt('123456', gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'sub', v_branch_admin_id::text,
      'email', 'branchadmin@gmail.com',
      'email_verified', true,
      'phone_verified', false,
      'full_name', 'Branch Admin',
      'role', 'BRANCH_ADMIN',
      'brand_id', v_brand_id,
      'branch_id', v_branch_id
    ),
    now(),
    now(),
    null,
    null,
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
    jsonb_build_object(
      'sub', v_branch_admin_id::text,
      'email', 'branchadmin@gmail.com',
      'email_verified', true,
      'phone_verified', false,
      'full_name', 'Branch Admin',
      'role', 'BRANCH_ADMIN'
    ),
    'email',
    v_branch_admin_id::text,
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id, role, branch_id, brand_id, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_branch_admin_id,
    'BRANCH_ADMIN',
    v_branch_id,
    v_brand_id,
    'Branch Admin',
    'branchadmin@gmail.com',
    true,
    now(),
    now()
  );

  -- 4. INSERT BRAND ADMIN (brandadmin@gmail.com / 123456)
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
    '00000000-0000-0000-0000-000000000000',
    v_brand_admin_id,
    'authenticated',
    'authenticated',
    'brandadmin@gmail.com',
    crypt('123456', gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'sub', v_brand_admin_id::text,
      'email', 'brandadmin@gmail.com',
      'email_verified', true,
      'phone_verified', false,
      'full_name', 'Brand Admin',
      'role', 'BRAND_ADMIN',
      'brand_id', v_brand_id,
      'branch_id', null
    ),
    now(),
    now(),
    null,
    null,
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
    jsonb_build_object(
      'sub', v_brand_admin_id::text,
      'email', 'brandadmin@gmail.com',
      'email_verified', true,
      'phone_verified', false,
      'full_name', 'Brand Admin',
      'role', 'BRAND_ADMIN'
    ),
    'email',
    v_brand_admin_id::text,
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id, role, branch_id, brand_id, full_name, email, is_active, created_at, updated_at
  ) VALUES (
    v_brand_admin_id,
    'BRAND_ADMIN',
    null,
    v_brand_id,
    'Brand Admin',
    'brandadmin@gmail.com',
    true,
    now(),
    now()
  );

  -- 5. Auto-confirm any existing users
  UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, now());

END $$;
