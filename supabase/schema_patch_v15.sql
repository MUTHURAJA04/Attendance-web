-- Schema Patch v15: Enable/Disable Professional Tax (PT) flag on employees
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS enable_pt boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
