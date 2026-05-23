-- Schema Patch v7: Multi-Tenant Hierarchy (Organization -> Brand -> Branch)
-- 1. Create Organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Note: We intentionally DO NOT add RLS to organizations right now to keep the migration simple,
-- but we should add it if multi-org isolation at the DB level is strictly required later.
-- For now, the App UI context will handle isolation.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organizations read" ON organizations;
CREATE POLICY "organizations read" ON organizations FOR
SELECT USING (
        is_any_role(
            array ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "organizations write" ON organizations;
CREATE POLICY "organizations write" ON organizations FOR ALL USING (is_any_role(array ['SUPER_ADMIN']));
-- 2. Link Brands to Organizations
ALTER TABLE brands
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
-- 3. Scope Organization Settings to Brands
-- Since the table name is "organization_settings", but PRD requires settings per brand,
-- we'll add brand_id to this table.
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE CASCADE;
-- Drop the old unique constraint on (key) if it exists, because keys are now unique per brand
ALTER TABLE organization_settings DROP CONSTRAINT IF EXISTS organization_settings_key_key;
-- Add new unique constraint (brand_id, key)
-- Note: If there are existing rows without brand_id, this might fail or act weirdly.
-- Since we just provided a data cleanup script, we assume the table is empty or we can safely add it.
ALTER TABLE organization_settings DROP CONSTRAINT IF EXISTS organization_settings_brand_id_key_key;
ALTER TABLE organization_settings
ADD CONSTRAINT organization_settings_brand_id_key_key UNIQUE (brand_id, key);
-- Update RLS for Organization Settings if needed, for now standard access
DROP POLICY IF EXISTS "settings admin read" ON organization_settings;
CREATE POLICY "settings admin read" ON organization_settings FOR
SELECT USING (
        is_any_role(
            array ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "settings admin write" ON organization_settings;
CREATE POLICY "settings admin write" ON organization_settings FOR ALL USING (
    is_any_role(array ['SUPER_ADMIN','PAYROLL_MANAGER'])
);