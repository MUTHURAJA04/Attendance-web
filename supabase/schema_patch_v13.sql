-- Schema Patch V13: Add DELETE policies for employee records

-- Attendance Logs
drop policy if exists "attendance_logs delete" on attendance_logs;
create policy "attendance_logs delete" on attendance_logs
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Loans
drop policy if exists "loans delete" on loans;
create policy "loans delete" on loans
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Loan Writeoffs
drop policy if exists "loan_writeoffs delete" on loan_writeoffs;
create policy "loan_writeoffs delete" on loan_writeoffs
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Leave Requests
drop policy if exists "leave_requests delete" on leave_requests;
create policy "leave_requests delete" on leave_requests
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Payslips
drop policy if exists "payslips delete" on payslips;
create policy "payslips delete" on payslips
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Salary Structures
drop policy if exists "salary_structures delete" on salary_structures;
create policy "salary_structures delete" on salary_structures
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Employee Documents
drop policy if exists "employee_documents delete" on employee_documents;
create policy "employee_documents delete" on employee_documents
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Employees
drop policy if exists "employees delete" on employees;
create policy "employees delete" on employees
  for delete using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));
