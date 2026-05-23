-- Schema Patch v5: Loans & Advances columns + Employee status
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════════
-- 1. Add missing columns to loans table
-- ═══════════════════════════════════════════════════
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'LOAN';
-- LOAN or ADVANCE
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS disbursement_date date DEFAULT CURRENT_DATE;
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS start_month int;
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS start_year int;
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS deduction_month int;
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS deduction_year int;
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS repayment_schedule jsonb DEFAULT '[]'::jsonb;
-- Make tenure_months and monthly_emi nullable (advances don't need them)
ALTER TABLE loans
ALTER COLUMN tenure_months DROP NOT NULL;
ALTER TABLE loans
ALTER COLUMN monthly_emi DROP NOT NULL;
-- ═══════════════════════════════════════════════════
-- 2. Add employee status column (Active / Left / Disabled)
-- ═══════════════════════════════════════════════════
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
-- ACTIVE, LEFT, DISABLED
-- Migrate existing is_active data to new status column
UPDATE employees
SET status = 'DISABLED'
WHERE is_active = false
    AND status = 'ACTIVE';