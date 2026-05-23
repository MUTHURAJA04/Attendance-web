-- Schema Patch: Missing columns and tables for PRD compliance
-- Run this AFTER schema.sql and schema_expansion.sql
-- 1. Employee fields needed by the UI
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS email text;
-- 2. Branch fields needed by the UI
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS address text;
-- 3. Salary Structure per employee (PRD §5 and §8)
CREATE TABLE IF NOT EXISTS salary_structures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    basic_pay decimal(12, 2) NOT NULL DEFAULT 0,
    hra decimal(12, 2) NOT NULL DEFAULT 0,
    allowances decimal(12, 2) NOT NULL DEFAULT 0,
    ot_rate decimal(12, 2) NOT NULL DEFAULT 0,
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(employee_id, effective_from)
);
-- 4. Organization settings table (for persisting Settings page)
CREATE TABLE IF NOT EXISTS organization_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- 5. Audit log table (PRD §15)
CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    details jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Enable RLS on new tables
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;