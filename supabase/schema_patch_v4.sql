-- schema_patch_v4.sql: Add name column to incentive_rules
-- Run this if your UI expects rules to have names
ALTER TABLE incentive_rules
ADD COLUMN IF NOT EXISTS name text;
-- Update existing rules with a default name if they exist
UPDATE incentive_rules
SET name = 'Sales Performance Rule'
WHERE name IS NULL;