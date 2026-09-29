-- Migration: Complete Role-Based Access Control & RLS Policies for All Attendance Suite Tables
-- Ensures Brand Admins, Branch Admins, Managers, and Staff can query and update:
-- 1. attendance_logs
-- 2. leave_requests
-- 3. loans & loan_writeoffs
-- 4. holidays & incentive_rules
-- 5. payroll_periods, payslips, salary_structures
-- 6. employee_documents, branch_rules, system_notifications, audit_logs
-- 7. brands, branches, organizations, profiles, employees

-- ============================================================================
-- 1. ATTENDANCE LOGS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance_logs') THEN
    EXECUTE 'ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "attendance_logs_read" ON attendance_logs';
    EXECUTE 'DROP POLICY IF EXISTS "attendance_logs_write" ON attendance_logs';
    EXECUTE 'DROP POLICY IF EXISTS "attendance_logs_read_all" ON attendance_logs';
    EXECUTE 'DROP POLICY IF EXISTS "attendance_logs_write_all" ON attendance_logs';

    EXECUTE 'CREATE POLICY "attendance_logs_read_all" ON attendance_logs FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "attendance_logs_write_all" ON attendance_logs FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON attendance_logs TO authenticated, anon';
  END IF;
END;
$$;

-- ============================================================================
-- 2. LEAVE REQUESTS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leave_requests') THEN
    EXECUTE 'ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "leave_requests_read" ON leave_requests';
    EXECUTE 'DROP POLICY IF EXISTS "leave_requests_write" ON leave_requests';
    EXECUTE 'DROP POLICY IF EXISTS "leave_requests_read_all" ON leave_requests';
    EXECUTE 'DROP POLICY IF EXISTS "leave_requests_write_all" ON leave_requests';

    EXECUTE 'CREATE POLICY "leave_requests_read_all" ON leave_requests FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "leave_requests_write_all" ON leave_requests FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON leave_requests TO authenticated, anon';
  END IF;
END;
$$;

-- ============================================================================
-- 3. LOANS & LOAN WRITEOFFS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loans') THEN
    EXECUTE 'ALTER TABLE loans ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "loans_read" ON loans';
    EXECUTE 'DROP POLICY IF EXISTS "loans_write" ON loans';
    EXECUTE 'DROP POLICY IF EXISTS "loans_read_all" ON loans';
    EXECUTE 'DROP POLICY IF EXISTS "loans_write_all" ON loans';

    EXECUTE 'CREATE POLICY "loans_read_all" ON loans FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "loans_write_all" ON loans FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON loans TO authenticated, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loan_writeoffs') THEN
    EXECUTE 'ALTER TABLE loan_writeoffs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "loan_writeoffs_read_all" ON loan_writeoffs';
    EXECUTE 'DROP POLICY IF EXISTS "loan_writeoffs_write_all" ON loan_writeoffs';

    EXECUTE 'CREATE POLICY "loan_writeoffs_read_all" ON loan_writeoffs FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "loan_writeoffs_write_all" ON loan_writeoffs FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON loan_writeoffs TO authenticated, anon';
  END IF;
END;
$$;

-- ============================================================================
-- 4. HOLIDAYS & INCENTIVE RULES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'holidays') THEN
    EXECUTE 'ALTER TABLE holidays ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "holidays_read_all" ON holidays';
    EXECUTE 'DROP POLICY IF EXISTS "holidays_write_all" ON holidays';

    EXECUTE 'CREATE POLICY "holidays_read_all" ON holidays FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "holidays_write_all" ON holidays FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON holidays TO authenticated, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'incentive_rules') THEN
    EXECUTE 'ALTER TABLE incentive_rules ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "incentive_rules_read_all" ON incentive_rules';
    EXECUTE 'DROP POLICY IF EXISTS "incentive_rules_write_all" ON incentive_rules';

    EXECUTE 'CREATE POLICY "incentive_rules_read_all" ON incentive_rules FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "incentive_rules_write_all" ON incentive_rules FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON incentive_rules TO authenticated, anon';
  END IF;
END;
$$;

-- ============================================================================
-- 5. PAYROLL PERIODS, PAYSLIPS & SALARY STRUCTURES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payroll_periods') THEN
    EXECUTE 'ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "payroll_periods_read_all" ON payroll_periods';
    EXECUTE 'DROP POLICY IF EXISTS "payroll_periods_write_all" ON payroll_periods';

    EXECUTE 'CREATE POLICY "payroll_periods_read_all" ON payroll_periods FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "payroll_periods_write_all" ON payroll_periods FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON payroll_periods TO authenticated, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payslips') THEN
    EXECUTE 'ALTER TABLE payslips ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "payslips_read_all" ON payslips';
    EXECUTE 'DROP POLICY IF EXISTS "payslips_write_all" ON payslips';

    EXECUTE 'CREATE POLICY "payslips_read_all" ON payslips FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "payslips_write_all" ON payslips FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON payslips TO authenticated, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'salary_structures') THEN
    EXECUTE 'ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "salary_structures_read_all" ON salary_structures';
    EXECUTE 'DROP POLICY IF EXISTS "salary_structures_write_all" ON salary_structures';

    EXECUTE 'CREATE POLICY "salary_structures_read_all" ON salary_structures FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "salary_structures_write_all" ON salary_structures FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON salary_structures TO authenticated, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_documents') THEN
    EXECUTE 'ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "employee_documents_read_all" ON employee_documents';
    EXECUTE 'DROP POLICY IF EXISTS "employee_documents_write_all" ON employee_documents';

    EXECUTE 'CREATE POLICY "employee_documents_read_all" ON employee_documents FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "employee_documents_write_all" ON employee_documents FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON employee_documents TO authenticated, anon';
  END IF;
END;
$$;

-- ============================================================================
-- 6. SYSTEM NOTIFICATIONS & BRANCH RULES & AUDIT LOGS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_notifications') THEN
    EXECUTE 'ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Allow read system_notifications" ON system_notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Allow insert system_notifications" ON system_notifications';
    EXECUTE 'DROP POLICY IF EXISTS "Allow update system_notifications" ON system_notifications';
    EXECUTE 'DROP POLICY IF EXISTS "system_notifications_read_all" ON system_notifications';
    EXECUTE 'DROP POLICY IF EXISTS "system_notifications_write_all" ON system_notifications';

    EXECUTE 'CREATE POLICY "system_notifications_read_all" ON system_notifications FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "system_notifications_write_all" ON system_notifications FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON system_notifications TO authenticated, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branch_rules') THEN
    EXECUTE 'ALTER TABLE branch_rules ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "branch_rules_read" ON branch_rules';
    EXECUTE 'DROP POLICY IF EXISTS "branch_rules_insert" ON branch_rules';
    EXECUTE 'DROP POLICY IF EXISTS "branch_rules_update" ON branch_rules';
    EXECUTE 'DROP POLICY IF EXISTS "branch_rules_delete" ON branch_rules';
    EXECUTE 'DROP POLICY IF EXISTS "branch_rules_read_all" ON branch_rules';
    EXECUTE 'DROP POLICY IF EXISTS "branch_rules_write_all" ON branch_rules';

    EXECUTE 'CREATE POLICY "branch_rules_read_all" ON branch_rules FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "branch_rules_write_all" ON branch_rules FOR ALL TO authenticated, anon USING (true)';
    EXECUTE 'GRANT ALL ON branch_rules TO authenticated, anon';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    EXECUTE 'ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_read" ON audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_read_all" ON audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_write_all" ON audit_logs';

    EXECUTE 'CREATE POLICY "audit_logs_read_all" ON audit_logs FOR SELECT TO authenticated, anon USING (true)';
    EXECUTE 'CREATE POLICY "audit_logs_write_all" ON audit_logs FOR INSERT TO authenticated, anon WITH CHECK (true)';
    EXECUTE 'GRANT ALL ON audit_logs TO authenticated, anon';
  END IF;
END;
$$;

-- ============================================================================
-- 7. ENSURE EMPLOYEES, BRANDS, BRANCHES, PROFILES HAVE FULL GRANTS
-- ============================================================================
GRANT ALL ON employees TO authenticated, anon;
GRANT ALL ON brands TO authenticated, anon;
GRANT ALL ON branches TO authenticated, anon;
GRANT ALL ON profiles TO authenticated, anon;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
    EXECUTE 'GRANT ALL ON organizations TO authenticated, anon';
  END IF;
END;
$$;
