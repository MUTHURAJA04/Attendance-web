-- Migration: Stored procedure to seed initial/demo hierarchy, branches, employees, and punches
CREATE OR REPLACE FUNCTION fn_seed_demo_data()
RETURNS jsonb AS $$
DECLARE
  v_org_id uuid;
  v_brand_id uuid;
  v_branch_id uuid;
  v_emp1_id uuid;
  v_emp2_id uuid;
  v_emp3_id uuid;
  v_now_ist timestamptz;
  v_today_date text;
BEGIN
  v_now_ist := NOW() AT TIME ZONE 'Asia/Kolkata';
  v_today_date := (v_now_ist::date)::text;

  -- 1. Create Organization (if none exists)
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name)
    VALUES ('Main Organization')
    RETURNING id INTO v_org_id;
  END IF;

  -- 2. Create Brand (if none exists)
  SELECT id INTO v_brand_id FROM brands WHERE organization_id = v_org_id LIMIT 1;
  IF v_brand_id IS NULL THEN
    INSERT INTO brands (name, organization_id)
    VALUES ('Main Brand', v_org_id)
    RETURNING id INTO v_brand_id;
  END IF;

  -- 3. Create Branch KALR1 (if none exists)
  SELECT id INTO v_branch_id FROM branches WHERE name = 'KALR1' LIMIT 1;
  IF v_branch_id IS NULL THEN
    INSERT INTO branches (name, city, state, brand_id, is_active)
    VALUES ('KALR1', 'Chennai', 'Tamil Nadu', v_brand_id, true)
    RETURNING id INTO v_branch_id;
  END IF;

  -- 4. Create Wage Master entries for KALR1
  IF NOT EXISTS (SELECT 1 FROM wage_master WHERE branch_id = v_branch_id) THEN
    INSERT INTO wage_master (branch_id, role_name, basic_salary, da, hra, allowances)
    VALUES 
      (v_branch_id, 'STAFF', 12000, 2000, 1500, 500),
      (v_branch_id, 'MANAGER', 25000, 4000, 3000, 1000),
      (v_branch_id, 'KITCHEN', 14000, 2000, 1500, 500),
      (v_branch_id, 'CASHIER', 15000, 2500, 2000, 500);
  END IF;

  -- 5. Seed Employees
  -- Employee 1: raja
  SELECT id INTO v_emp1_id FROM employees WHERE full_name = 'raja' AND branch_id = v_branch_id LIMIT 1;
  IF v_emp1_id IS NULL THEN
    INSERT INTO employees (
      full_name, employee_code, role, branch_id, date_of_joining,
      phone, emergency_contact_name, emergency_contact_phone,
      bank_account_number, bank_ifsc, bank_name, status, is_active,
      shift_start, shift_end, total_working_hours
    ) VALUES (
      'raja', 'EMP001', 'STAFF', v_branch_id, '2024-01-01',
      '9876543210', 'Emergency Contact', '9876543211',
      '123456789012', 'HDFC0001234', 'HDFC Bank', 'ACTIVE', true,
      '09:00', '18:00', 9
    ) RETURNING id INTO v_emp1_id;
  END IF;

  -- Employee 2: Demo Staff
  SELECT id INTO v_emp2_id FROM employees WHERE full_name = 'Demo Staff' AND branch_id = v_branch_id LIMIT 1;
  IF v_emp2_id IS NULL THEN
    INSERT INTO employees (
      full_name, employee_code, role, branch_id, date_of_joining,
      phone, emergency_contact_name, emergency_contact_phone,
      bank_account_number, bank_ifsc, bank_name, status, is_active,
      shift_start, shift_end, total_working_hours
    ) VALUES (
      'Demo Staff', 'EMP002', 'STAFF', v_branch_id, '2024-01-01',
      '9876543212', 'Emergency Contact', '9876543213',
      '123456789013', 'HDFC0001234', 'HDFC Bank', 'ACTIVE', true,
      '10:00', '22:00', 12
    ) RETURNING id INTO v_emp2_id;
  END IF;

  -- Employee 3: dummy staff
  SELECT id INTO v_emp3_id FROM employees WHERE full_name = 'dummy staff' AND branch_id = v_branch_id LIMIT 1;
  IF v_emp3_id IS NULL THEN
    INSERT INTO employees (
      full_name, employee_code, role, branch_id, date_of_joining,
      phone, emergency_contact_name, emergency_contact_phone,
      bank_account_number, bank_ifsc, bank_name, status, is_active,
      shift_start, shift_end, total_working_hours
    ) VALUES (
      'dummy staff', 'EMP003', 'STAFF', v_branch_id, '2024-01-01',
      '9876543214', 'Emergency Contact', '9876543215',
      '123456789014', 'HDFC0001234', 'HDFC Bank', 'ACTIVE', true,
      '09:00', '18:00', 9
    ) RETURNING id INTO v_emp3_id;
  END IF;

  -- 6. Seed Salary Structures
  IF NOT EXISTS (SELECT 1 FROM salary_structures WHERE employee_id = v_emp1_id) THEN
    INSERT INTO salary_structures (employee_id, basic_pay, hra, allowances, ot_rate, effective_from)
    VALUES (v_emp1_id, 12000, 2000, 1000, 100, '2024-01-01');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM salary_structures WHERE employee_id = v_emp2_id) THEN
    INSERT INTO salary_structures (employee_id, basic_pay, hra, allowances, ot_rate, effective_from)
    VALUES (v_emp2_id, 14000, 2500, 1000, 120, '2024-01-01');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM salary_structures WHERE employee_id = v_emp3_id) THEN
    INSERT INTO salary_structures (employee_id, basic_pay, hra, allowances, ot_rate, effective_from)
    VALUES (v_emp3_id, 10000, 1500, 800, 90, '2024-01-01');
  END IF;

  -- 7. Seed Attendance Logs for today (Unclosed check-ins for testing!)
  IF NOT EXISTS (
    SELECT 1 FROM attendance_logs 
    WHERE employee_id = v_emp1_id 
      AND (check_in AT TIME ZONE 'Asia/Kolkata')::date = (v_now_ist::date)
  ) THEN
    INSERT INTO attendance_logs (employee_id, branch_id, check_in, check_out, status, source)
    VALUES (v_emp1_id, v_branch_id, (v_today_date || ' 09:30:00+05:30')::timestamptz, NULL, 'PRESENT', 'BIOMETRIC');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM attendance_logs 
    WHERE employee_id = v_emp2_id 
      AND (check_in AT TIME ZONE 'Asia/Kolkata')::date = (v_now_ist::date)
  ) THEN
    INSERT INTO attendance_logs (employee_id, branch_id, check_in, check_out, status, source)
    VALUES (v_emp2_id, v_branch_id, (v_today_date || ' 10:15:00+05:30')::timestamptz, NULL, 'PRESENT', 'BIOMETRIC');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'branch_id', v_branch_id,
    'employees', jsonb_build_array('raja', 'Demo Staff', 'dummy staff')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
