-- Schema Patch V14: Leave deduction multipliers & payslip breakdown columns

-- 1. Add breakdown columns to payslips
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS informed_approved_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS informed_unapproved_days integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uninformed_absent_days integer DEFAULT 0;
