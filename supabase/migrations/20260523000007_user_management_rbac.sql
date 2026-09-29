-- Migration: User Management & RBAC Enhancements
-- Adds support for Super Admin, Brand Admin, Branch Admin, Manager, and Branch Staff roles

-- 1. Ensure profiles table has all required columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Create index on profiles for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_brand ON profiles(brand_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch ON profiles(branch_id);

-- 3. Stored Procedure to List Users with Scoped RBAC
CREATE OR REPLACE FUNCTION fn_list_rbac_users()
RETURNS jsonb AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_caller_brand uuid;
  v_caller_branch uuid;
  v_users jsonb;
BEGIN
  v_caller_id := auth.uid();
  
  -- Get caller profile info
  SELECT role, brand_id, branch_id 
  INTO v_caller_role, v_caller_brand, v_caller_branch
  FROM profiles 
  WHERE id = v_caller_id;

  -- Fallback to user_metadata role if profile role is not set
  IF v_caller_role IS NULL THEN
    v_caller_role := (auth.jwt() -> 'user_metadata' ->> 'role');
  END IF;

  -- Query users based on role hierarchy
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'full_name', COALESCE(p.full_name, split_part(COALESCE(p.email, u.email, 'User'), '@', 1)),
      'email', COALESCE(p.email, u.email, ''),
      'role', COALESCE(p.role, (u.raw_user_meta_data->>'role'), 'BRANCH_STAFF'),
      'brand_id', p.brand_id,
      'brand_name', br.name,
      'branch_id', p.branch_id,
      'branch_name', b.name,
      'is_active', COALESCE(p.is_active, true),
      'created_at', p.created_at
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  INTO v_users
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN brands br ON br.id = p.brand_id
  LEFT JOIN branches b ON b.id = p.branch_id
  WHERE (
    -- Super Admin can see all users
    v_caller_role = 'SUPER_ADMIN'
    -- Brand Admin can see users in their assigned Brand
    OR (v_caller_role = 'BRAND_ADMIN' AND (p.brand_id = v_caller_brand OR b.brand_id = v_caller_brand))
    -- Branch Admin can see users in their assigned Branch
    OR (v_caller_role IN ('BRANCH_ADMIN', 'BRANCH_MANAGER') AND p.branch_id = v_caller_branch)
    -- Self
    OR p.id = v_caller_id
  );

  RETURN v_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
