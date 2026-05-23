-- Schema Patch v11: Wage Master
CREATE TABLE IF NOT EXISTS wage_master (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    role_name text NOT NULL,
    basic_salary numeric(12, 2) NOT NULL DEFAULT 0,
    da numeric(12, 2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(branch_id, role_name)
);

ALTER TABLE wage_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wage_master_read" ON wage_master;
CREATE POLICY "wage_master_read" ON wage_master FOR
SELECT USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER'])
);

DROP POLICY IF EXISTS "wage_master_write" ON wage_master;
CREATE POLICY "wage_master_write" ON wage_master FOR ALL USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
