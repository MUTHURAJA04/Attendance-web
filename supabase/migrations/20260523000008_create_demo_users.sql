-- Migration: Create Auth Accounts for RBAC Roles with Verified Passwords
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
  v_org_id uuid;
  v_brand_id uuid;
  v_branch_id uuid;
  v_super_id uuid := gen_random_uuid();
  v_brand_admin_id uuid := gen_random_uuid();
  v_branch_admin_id uuid := gen_random_uuid();
  v_manager_id uuid := gen_random_uuid();
  v_staff_id uuid := gen_random_uuid();
BEGIN
  -- 1. Ensure Org, Brand, and Branch exist
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name) VALUES ('Main Organization') RETURNING id INTO v_org_id;
  END IF;

  SELECT id INTO v_brand_id FROM brands WHERE organization_id = v_org_id LIMIT 1;
  IF v_brand_id IS NULL THEN
    INSERT INTO brands (name, organization_id) VALUES ('Main Brand', v_org_id) RETURNING id INTO v_brand_id;
  END IF;

  SELECT id INTO v_branch_id FROM branches WHERE name = 'KALR1' LIMIT 1;
  IF v_branch_id IS NULL THEN
    INSERT INTO branches (name, city, state, brand_id, is_active)
    VALUES ('KALR1', 'Chennai', 'Tamil Nadu', v_brand_id, true)
    RETURNING id INTO v_branch_id;
  END IF;

  -- 2. Create / Update Super Admin Account (admin@restaurant.com / Admin@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@restaurant.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_super_id, 'authenticated', 'authenticated',
      'admin@restaurant.com', crypt('Admin@123456', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      '{"role":"SUPER_ADMIN","full_name":"Raja Super Admin"}',
      now(), now(), '', ''
    );
  ELSE
    SELECT id INTO v_super_id FROM auth.users WHERE email = 'admin@restaurant.com';
    UPDATE auth.users
    SET encrypted_password = crypt('Admin@123456', gen_salt('bf')),
        raw_user_meta_data = '{"role":"SUPER_ADMIN","full_name":"Raja Super Admin"}',
        email_confirmed_at = now()
    WHERE id = v_super_id;
  END IF;

  -- Upsert Profile
  INSERT INTO profiles (id, role, branch_id, created_at)
  VALUES (v_super_id, 'SUPER_ADMIN', NULL, now())
  ON CONFLICT (id) DO UPDATE SET role = 'SUPER_ADMIN';

  -- 3. Create / Update Brand Admin Account (brandadmin@restaurant.com / Brand@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'brandadmin@restaurant.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_brand_admin_id, 'authenticated', 'authenticated',
      'brandadmin@restaurant.com', crypt('Brand@123456', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('role', 'BRAND_ADMIN', 'full_name', 'Kalyan Brand Admin', 'brand_id', v_brand_id),
      now(), now(), '', ''
    );
  ELSE
    SELECT id INTO v_brand_admin_id FROM auth.users WHERE email = 'brandadmin@restaurant.com';
    UPDATE auth.users
    SET encrypted_password = crypt('Brand@123456', gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object('role', 'BRAND_ADMIN', 'full_name', 'Kalyan Brand Admin', 'brand_id', v_brand_id),
        email_confirmed_at = now()
    WHERE id = v_brand_admin_id;
  END IF;

  INSERT INTO profiles (id, role, branch_id, created_at)
  VALUES (v_brand_admin_id, 'BRAND_ADMIN', NULL, now())
  ON CONFLICT (id) DO UPDATE SET role = 'BRAND_ADMIN';

  -- 4. Create / Update Branch Admin Account (branchadmin@restaurant.com / Branch@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'branchadmin@restaurant.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_branch_admin_id, 'authenticated', 'authenticated',
      'branchadmin@restaurant.com', crypt('Branch@123456', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('role', 'BRANCH_ADMIN', 'full_name', 'Chennai Branch Admin', 'branch_id', v_branch_id),
      now(), now(), '', ''
    );
  ELSE
    SELECT id INTO v_branch_admin_id FROM auth.users WHERE email = 'branchadmin@restaurant.com';
    UPDATE auth.users
    SET encrypted_password = crypt('Branch@123456', gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object('role', 'BRANCH_ADMIN', 'full_name', 'Chennai Branch Admin', 'branch_id', v_branch_id),
        email_confirmed_at = now()
    WHERE id = v_branch_admin_id;
  END IF;

  INSERT INTO profiles (id, role, branch_id, created_at)
  VALUES (v_branch_admin_id, 'BRANCH_ADMIN', v_branch_id, now())
  ON CONFLICT (id) DO UPDATE SET role = 'BRANCH_ADMIN', branch_id = v_branch_id;

  -- 5. Create / Update Manager Account (manager@restaurant.com / Manager@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@restaurant.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_manager_id, 'authenticated', 'authenticated',
      'manager@restaurant.com', crypt('Manager@123456', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('role', 'MANAGER', 'full_name', 'Operations Manager', 'branch_id', v_branch_id),
      now(), now(), '', ''
    );
  ELSE
    SELECT id INTO v_manager_id FROM auth.users WHERE email = 'manager@restaurant.com';
    UPDATE auth.users
    SET encrypted_password = crypt('Manager@123456', gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object('role', 'MANAGER', 'full_name', 'Operations Manager', 'branch_id', v_branch_id),
        email_confirmed_at = now()
    WHERE id = v_manager_id;
  END IF;

  INSERT INTO profiles (id, role, branch_id, created_at)
  VALUES (v_manager_id, 'MANAGER', v_branch_id, now())
  ON CONFLICT (id) DO UPDATE SET role = 'MANAGER', branch_id = v_branch_id;

  -- 6. Create / Update Branch Staff Account (staff@restaurant.com / Staff@123456)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'staff@restaurant.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_staff_id, 'authenticated', 'authenticated',
      'staff@restaurant.com', crypt('Staff@123456', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}',
      jsonb_build_object('role', 'BRANCH_STAFF', 'full_name', 'Front Desk Staff', 'branch_id', v_branch_id),
      now(), now(), '', ''
    );
  ELSE
    SELECT id INTO v_staff_id FROM auth.users WHERE email = 'staff@restaurant.com';
    UPDATE auth.users
    SET encrypted_password = crypt('Staff@123456', gen_salt('bf')),
        raw_user_meta_data = jsonb_build_object('role', 'BRANCH_STAFF', 'full_name', 'Front Desk Staff', 'branch_id', v_branch_id),
        email_confirmed_at = now()
    WHERE id = v_staff_id;
  END IF;

  INSERT INTO profiles (id, role, branch_id, created_at)
  VALUES (v_staff_id, 'BRANCH_STAFF', v_branch_id, now())
  ON CONFLICT (id) DO UPDATE SET role = 'BRANCH_STAFF', branch_id = v_branch_id;

END;
$$;
