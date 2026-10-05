-- Migration 20260523000030: Add enable_pt flag to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS enable_pt boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
