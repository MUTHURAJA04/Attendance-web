-- RLS Policies for Expansion Tables
-- Run AFTER schema_expansion.sql
-- ═══════════════════════════════════════════════
-- attendance_logs
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "attendance_logs_read" ON attendance_logs;
CREATE POLICY "attendance_logs_read" ON attendance_logs FOR
SELECT USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
        OR (
            is_role('BRANCH_MANAGER')
            AND branch_id = (
                SELECT branch_id
                FROM profiles
                WHERE id = auth.uid()
            )
        )
    );
DROP POLICY IF EXISTS "attendance_logs_insert" ON attendance_logs;
CREATE POLICY "attendance_logs_insert" ON attendance_logs FOR
INSERT WITH CHECK (
        is_any_role(
            ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "attendance_logs_update" ON attendance_logs;
CREATE POLICY "attendance_logs_update" ON attendance_logs FOR
UPDATE USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "attendance_logs_delete" ON attendance_logs;
CREATE POLICY "attendance_logs_delete" ON attendance_logs FOR DELETE USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- ═══════════════════════════════════════════════
-- global_holidays
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "global_holidays_read" ON global_holidays;
CREATE POLICY "global_holidays_read" ON global_holidays FOR
SELECT USING (
        is_any_role(
            ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "global_holidays_write" ON global_holidays;
CREATE POLICY "global_holidays_write" ON global_holidays FOR ALL USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- ═══════════════════════════════════════════════
-- branch_daily_sales
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "branch_daily_sales_read" ON branch_daily_sales;
CREATE POLICY "branch_daily_sales_read" ON branch_daily_sales FOR
SELECT USING (
        is_any_role(
            ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "branch_daily_sales_write" ON branch_daily_sales;
CREATE POLICY "branch_daily_sales_write" ON branch_daily_sales FOR ALL USING (
    is_any_role(
        ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
    )
);
-- ═══════════════════════════════════════════════
-- incentive_rules
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "incentive_rules_read" ON incentive_rules;
CREATE POLICY "incentive_rules_read" ON incentive_rules FOR
SELECT USING (
        is_any_role(
            ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "incentive_rules_write" ON incentive_rules;
CREATE POLICY "incentive_rules_write" ON incentive_rules FOR ALL USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- ═══════════════════════════════════════════════
-- loans
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "loans_read" ON loans;
CREATE POLICY "loans_read" ON loans FOR
SELECT USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "loans_insert" ON loans;
CREATE POLICY "loans_insert" ON loans FOR
INSERT WITH CHECK (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "loans_update" ON loans;
CREATE POLICY "loans_update" ON loans FOR
UPDATE USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
-- ═══════════════════════════════════════════════
-- leave_requests
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "leave_requests_read" ON leave_requests;
CREATE POLICY "leave_requests_read" ON leave_requests FOR
SELECT USING (
        is_any_role(
            ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "leave_requests_insert" ON leave_requests;
CREATE POLICY "leave_requests_insert" ON leave_requests FOR
INSERT WITH CHECK (
        is_any_role(
            ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
DROP POLICY IF EXISTS "leave_requests_update" ON leave_requests;
CREATE POLICY "leave_requests_update" ON leave_requests FOR
UPDATE USING (
        is_any_role(
            ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']
        )
    );
-- ═══════════════════════════════════════════════
-- payroll_periods
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "payroll_periods_read" ON payroll_periods;
CREATE POLICY "payroll_periods_read" ON payroll_periods FOR
SELECT USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "payroll_periods_write" ON payroll_periods;
CREATE POLICY "payroll_periods_write" ON payroll_periods FOR ALL USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- ═══════════════════════════════════════════════
-- payslips
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "payslips_read" ON payslips;
CREATE POLICY "payslips_read" ON payslips FOR
SELECT USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "payslips_insert" ON payslips;
CREATE POLICY "payslips_insert" ON payslips FOR
INSERT WITH CHECK (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "payslips_update" ON payslips;
CREATE POLICY "payslips_update" ON payslips FOR
UPDATE USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "payslips_delete" ON payslips;
CREATE POLICY "payslips_delete" ON payslips FOR DELETE USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- ═══════════════════════════════════════════════
-- salary_structures (from schema_patch)
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "salary_structures_read" ON salary_structures;
CREATE POLICY "salary_structures_read" ON salary_structures FOR
SELECT USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "salary_structures_write" ON salary_structures;
CREATE POLICY "salary_structures_write" ON salary_structures FOR ALL USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- ═══════════════════════════════════════════════
-- organization_settings (from schema_patch)
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "org_settings_read" ON organization_settings;
CREATE POLICY "org_settings_read" ON organization_settings FOR
SELECT USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "org_settings_write" ON organization_settings;
CREATE POLICY "org_settings_write" ON organization_settings FOR ALL USING (
    is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
);
-- ═══════════════════════════════════════════════
-- audit_logs (from schema_patch)
-- ═══════════════════════════════════════════════
DROP POLICY IF EXISTS "audit_logs_read" ON audit_logs;
CREATE POLICY "audit_logs_read" ON audit_logs FOR
SELECT USING (
        is_any_role(ARRAY ['SUPER_ADMIN','PAYROLL_MANAGER'])
    );
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs FOR
INSERT WITH CHECK (true);
-- Any authenticated user can create audit entries