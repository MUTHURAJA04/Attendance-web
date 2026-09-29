-- Schema Patch: Branch Leave, Late Coming & Overtime Rules Table and Policies
CREATE TABLE IF NOT EXISTS branch_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('LATE_COMING', 'LEAVE_POLICY', 'OVERTIME')),
  title TEXT NOT NULL,
  threshold_minutes INTEGER DEFAULT 0, -- Late threshold in minutes, or OT minimum extra minutes
  deduction_percentage NUMERIC DEFAULT 0, -- e.g. 10.0 for 10%, 50.0 for 50%, 100.0 for 100% (1 full day rate), 200.0 for 2x
  rate_multiplier NUMERIC DEFAULT 1.0, -- For OT rate multiplier (e.g. 1.5 for 1.5x hourly rate) or flat hourly amount
  leave_type TEXT, -- e.g. 'APPROVED', 'UNAPPROVED', 'UNINFORMED_ABSENT', 'ALL'
  eligible_roles TEXT[] DEFAULT ARRAY['ALL']::TEXT[], -- e.g. ['ALL'], ['STAFF', 'KITCHEN']
  eligible_employee_ids UUID[] DEFAULT ARRAY[]::UUID[], -- Optional specific employee scope
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE branch_rules ENABLE ROW LEVEL SECURITY;

-- Select Policy
DROP POLICY IF EXISTS "branch_rules_read" ON branch_rules;
CREATE POLICY "branch_rules_read" ON branch_rules
  FOR SELECT USING (
    is_any_role(ARRAY['SUPER_ADMIN', 'PAYROLL_MANAGER', 'BRANCH_MANAGER'])
  );

-- Insert Policy
DROP POLICY IF EXISTS "branch_rules_insert" ON branch_rules;
CREATE POLICY "branch_rules_insert" ON branch_rules
  FOR INSERT WITH CHECK (
    is_any_role(ARRAY['SUPER_ADMIN', 'PAYROLL_MANAGER', 'BRANCH_MANAGER'])
  );

-- Update Policy
DROP POLICY IF EXISTS "branch_rules_update" ON branch_rules;
CREATE POLICY "branch_rules_update" ON branch_rules
  FOR UPDATE USING (
    is_any_role(ARRAY['SUPER_ADMIN', 'PAYROLL_MANAGER', 'BRANCH_MANAGER'])
  );

-- Delete Policy
DROP POLICY IF EXISTS "branch_rules_delete" ON branch_rules;
CREATE POLICY "branch_rules_delete" ON branch_rules
  FOR DELETE USING (
    is_any_role(ARRAY['SUPER_ADMIN', 'PAYROLL_MANAGER', 'BRANCH_MANAGER'])
  );

-- Seed standard default rules for existing branches if not present
INSERT INTO branch_rules (branch_id, rule_type, title, threshold_minutes, deduction_percentage, rate_multiplier, leave_type, eligible_roles, is_active)
SELECT 
  b.id,
  'LATE_COMING',
  'Grace Late (30-60 mins)',
  30,
  10.0,
  1.0,
  NULL,
  ARRAY['ALL']::TEXT[],
  TRUE
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM branch_rules r WHERE r.branch_id = b.id AND r.rule_type = 'LATE_COMING'
);

INSERT INTO branch_rules (branch_id, rule_type, title, threshold_minutes, deduction_percentage, rate_multiplier, leave_type, eligible_roles, is_active)
SELECT 
  b.id,
  'LEAVE_POLICY',
  'Unapproved Absence (2x Daily Rate)',
  0,
  200.0,
  1.0,
  'UNAPPROVED',
  ARRAY['ALL']::TEXT[],
  TRUE
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM branch_rules r WHERE r.branch_id = b.id AND r.rule_type = 'LEAVE_POLICY' AND r.leave_type = 'UNAPPROVED'
);

INSERT INTO branch_rules (branch_id, rule_type, title, threshold_minutes, deduction_percentage, rate_multiplier, leave_type, eligible_roles, is_active)
SELECT 
  b.id,
  'OVERTIME',
  'Standard Overtime (1.5x Multiplier)',
  60,
  0.0,
  1.5,
  NULL,
  ARRAY['ALL']::TEXT[],
  TRUE
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM branch_rules r WHERE r.branch_id = b.id AND r.rule_type = 'OVERTIME'
);
