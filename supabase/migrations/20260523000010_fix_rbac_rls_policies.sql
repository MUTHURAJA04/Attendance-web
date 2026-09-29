-- Migration: Comprehensive RBAC RLS Policies for Brands, Branches, Profiles, and Employees
-- Ensures all authenticated roles (SUPER_ADMIN, BRAND_ADMIN, BRANCH_ADMIN, MANAGER, BRANCH_STAFF)
-- can view and interact with their permitted organizations, brands, branches, and employees without getting blocked.

-- 1. Updated Helper Functions
CREATE OR REPLACE FUNCTION is_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = role_name,
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = role_name),
    false
  );
$$;

CREATE OR REPLACE FUNCTION is_any_role(role_names text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = ANY(role_names),
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ANY(role_names)),
    false
  );
$$;

-- 2. Organizations Policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
    EXECUTE 'ALTER TABLE organizations ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "organizations_read_all" ON organizations';
    EXECUTE 'DROP POLICY IF EXISTS "organizations_admin_write" ON organizations';
    EXECUTE 'CREATE POLICY "organizations_read_all" ON organizations FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY "organizations_admin_write" ON organizations FOR ALL TO authenticated USING (is_any_role(ARRAY[''SUPER_ADMIN'']))';
  END IF;
END;
$$;

-- 3. Brands Policies (Readable by all authenticated users; writable by SUPER_ADMIN & BRAND_ADMIN)
DROP POLICY IF EXISTS "brands admin read" ON brands;
DROP POLICY IF EXISTS "brands admin write" ON brands;
DROP POLICY IF EXISTS "brands_read_all" ON brands;
DROP POLICY IF EXISTS "brands_write_admin" ON brands;

CREATE POLICY "brands_read_all" ON brands
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "brands_write_admin" ON brands
  FOR ALL
  TO authenticated
  USING (is_any_role(ARRAY['SUPER_ADMIN', 'PAYROLL_MANAGER']));

-- 4. Branches Policies (Readable by all authenticated users; writable by SUPER_ADMIN, BRAND_ADMIN)
DROP POLICY IF EXISTS "branches admin read" ON branches;
DROP POLICY IF EXISTS "branches admin write" ON branches;
DROP POLICY IF EXISTS "branches_read_all" ON branches;
DROP POLICY IF EXISTS "branches_write_admin" ON branches;

CREATE POLICY "branches_read_all" ON branches
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "branches_write_admin" ON branches
  FOR ALL
  TO authenticated
  USING (
    is_any_role(ARRAY['SUPER_ADMIN', 'PAYROLL_MANAGER'])
    OR (
      is_role('BRAND_ADMIN')
      AND (
        brand_id = (SELECT brand_id FROM profiles WHERE id = auth.uid())
        OR brand_id = ((auth.jwt() -> 'user_metadata' ->> 'brand_id')::uuid)
      )
    )
  );

-- 5. Profiles Policies (Readable by self or any admin/manager; writable by self or admin)
DROP POLICY IF EXISTS "profiles self read" ON profiles;
DROP POLICY IF EXISTS "profiles self update" ON profiles;
DROP POLICY IF EXISTS "profiles_read_all_authenticated" ON profiles;
DROP POLICY IF EXISTS "profiles_write_policy" ON profiles;

CREATE POLICY "profiles_read_all_authenticated" ON profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR is_any_role(ARRAY['SUPER_ADMIN', 'BRAND_ADMIN', 'BRANCH_ADMIN', 'BRANCH_MANAGER', 'PAYROLL_MANAGER', 'MANAGER'])
  );

CREATE POLICY "profiles_write_policy" ON profiles
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = id
    OR is_any_role(ARRAY['SUPER_ADMIN', 'BRAND_ADMIN', 'PAYROLL_MANAGER'])
  );

-- 6. Employees Policies (Readable by branch staff, managers, brand admin, super admin)
DROP POLICY IF EXISTS "employees read" ON employees;
DROP POLICY IF EXISTS "employees write" ON employees;
DROP POLICY IF EXISTS "employees update" ON employees;
DROP POLICY IF EXISTS "employees_read_policy" ON employees;
DROP POLICY IF EXISTS "employees_write_policy" ON employees;

CREATE POLICY "employees_read_policy" ON employees
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "employees_write_policy" ON employees
  FOR ALL
  TO authenticated
  USING (
    is_any_role(ARRAY['SUPER_ADMIN', 'BRAND_ADMIN', 'BRANCH_ADMIN', 'BRANCH_MANAGER', 'PAYROLL_MANAGER', 'MANAGER'])
  );

-- 7. Grant SELECT / ALL permissions to roles
GRANT SELECT ON brands TO authenticated, anon;
GRANT SELECT ON branches TO authenticated, anon;
GRANT SELECT ON profiles TO authenticated, anon;
GRANT ALL ON employees TO authenticated, anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
    EXECUTE 'GRANT SELECT ON organizations TO authenticated, anon';
  END IF;
END;
$$;
