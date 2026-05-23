-- Schema Patch v6: Loan Write-offs Table
-- Run this in the Supabase SQL Editor
CREATE TABLE IF NOT EXISTS loan_writeoffs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(id),
    loan_id uuid NOT NULL REFERENCES loans(id),
    amount decimal(12, 2) NOT NULL,
    reason text NOT NULL DEFAULT 'EMPLOYEE_LEFT',
    restored boolean NOT NULL DEFAULT false,
    restored_loan_id uuid REFERENCES loans(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE loan_writeoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_writeoffs_all" ON loan_writeoffs FOR ALL USING (true);