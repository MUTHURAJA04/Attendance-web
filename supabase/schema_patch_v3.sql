-- Schema Patch v3: Branch-level skills, multi-shift support
-- Run AFTER schema_patch_v2.sql
-- Branch-level skill definitions (loaded in employee onboarding)
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS skills text [] DEFAULT '{}';
-- Multi-shift support: regular (single block) or break (morning + evening)
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS shift_type text DEFAULT 'regular';
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS shift_2_start time;
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS shift_2_end time;