-- Schema Patch V15: Employee Date of Birth & Gender

ALTER TABLE employees 
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text;
