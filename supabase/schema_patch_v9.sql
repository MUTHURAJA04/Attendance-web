-- Migration for Payslip detailed metrics (schema_patch_v9.sql)
ALTER TABLE public.payslips
ADD COLUMN present_days NUMERIC(4, 1) DEFAULT 0,
    ADD COLUMN absent_days NUMERIC(4, 1) DEFAULT 0,
    ADD COLUMN half_days NUMERIC(4, 1) DEFAULT 0,
    ADD COLUMN late_days NUMERIC(4, 1) DEFAULT 0,
    ADD COLUMN leave_days NUMERIC(4, 1) DEFAULT 0,
    ADD COLUMN late_deduction NUMERIC(10, 2) DEFAULT 0;