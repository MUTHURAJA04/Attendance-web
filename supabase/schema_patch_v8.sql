-- schema_patch_v8.sql
-- Add emergency_contacts JSONB column to employees
ALTER TABLE public.employees
ADD COLUMN emergency_contacts JSONB DEFAULT '[]'::jsonb;
-- Comment on column
COMMENT ON COLUMN public.employees.emergency_contacts IS 'Stores an array of emergency contacts. Each object should have {name, phone, relation}';