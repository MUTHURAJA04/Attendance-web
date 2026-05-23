-- Schema Patch v12: Paid Off Days, OT, PF, ESI flags on employees
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS paid_off_days integer NOT NULL DEFAULT 4,
ADD COLUMN IF NOT EXISTS enable_ot boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_pf boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS enable_esi boolean NOT NULL DEFAULT false;
