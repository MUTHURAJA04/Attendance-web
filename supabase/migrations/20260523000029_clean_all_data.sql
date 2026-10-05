-- Migration / Utility: Reset & Clean All Operational Data Preserving Super Admin (kingsail108@gmail.com)

DO $$
DECLARE
  v_super_admin_id uuid;
BEGIN
  -- 1. Find Super Admin ID
  SELECT id INTO v_super_admin_id 
  FROM auth.users 
  WHERE lower(email) = 'kingsail108@gmail.com' 
  LIMIT 1;

  IF v_super_admin_id IS NULL THEN
    SELECT id INTO v_super_admin_id FROM profiles WHERE role = 'SUPER_ADMIN' LIMIT 1;
  END IF;

  -- 2. Clear all transactional & operational tables
  DELETE FROM payslips;
  DELETE FROM payroll_periods;
  DELETE FROM attendance_logs;
  DELETE FROM leave_requests;
  DELETE FROM loan_writeoffs;
  DELETE FROM loans;
  DELETE FROM branch_daily_sales;
  DELETE FROM incentive_rules;
  DELETE FROM branch_rules;
  DELETE FROM global_holidays;
  DELETE FROM system_notifications;
  DELETE FROM audit_logs;
  DELETE FROM salary_structures;
  DELETE FROM employee_documents;
  DELETE FROM wage_master;

  -- 3. Clear Employees
  DELETE FROM employees;

  -- 4. Clear Profiles and Auth Users except Super Admin
  IF v_super_admin_id IS NOT NULL THEN
    DELETE FROM profiles WHERE id != v_super_admin_id;
    DELETE FROM auth.users WHERE id != v_super_admin_id;
  END IF;

  -- 5. Log reset event
  INSERT INTO audit_logs (action, entity_type, details)
  VALUES ('system_reset', 'SYSTEM', jsonb_build_object('message', 'All operational data cleared. Super Admin preserved.'));

END;
$$;
