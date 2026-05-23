-- Schema Patch V14: Leave deduction multipliers & payslip breakdown columns

-- 1. Insert default leave deduction multipliers into organization_settings
INSERT INTO organization_settings (key, value) VALUES
  ('leave_deduction_informed_approved', '"1"')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO organization_settings (key, value) VALUES
  ('leave_deduction_informed_unapproved', '"1.5"')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO organization_settings (key, value) VALUES
  ('leave_deduction_uninformed', '"2"')
  ON CONFLICT (key) DO NOTHING;

-- 2. Add breakdown columns to payslips
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS informed_approved_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS informed_unapproved_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uninformed_absent_days integer DEFAULT 0;
