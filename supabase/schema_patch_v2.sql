-- Schema Patch v2: Employee Skills, Departments, Shift Hours & Attendance Import Logs
-- Run AFTER schema_patch.sql
-- ═══════════════════════════════════════════════════
-- Employee fields for roster planning & attendance
-- ═══════════════════════════════════════════════════
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS skills text [] DEFAULT '{}';
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS shift_start time DEFAULT '10:00';
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS shift_end time DEFAULT '22:00';
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS total_working_hours decimal(4, 2) DEFAULT 12;
-- ═══════════════════════════════════════════════════
-- Attendance import logs
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS attendance_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filename text NOT NULL,
    imported_at timestamptz DEFAULT now(),
    imported_by uuid,
    total_rows int DEFAULT 0,
    success_count int DEFAULT 0,
    error_count int DEFAULT 0,
    late_in_count int DEFAULT 0,
    early_out_count int DEFAULT 0,
    new_employee_count int DEFAULT 0,
    log jsonb DEFAULT '[]'
);
ALTER TABLE attendance_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_imports_all" ON attendance_imports FOR ALL USING (true);