// ── Core Entity Types ─────────────────────────────────────

export interface Brand {
    id: string;
    name: string;
    created_at: string;
}

export interface Branch {
    id: string;
    brand_id: string | null;
    name: string;
    city: string;
    state: string | null;
    address: string | null;
    is_active: boolean;
    created_at: string;
    brands?: Pick<Brand, "name"> | null;
}

export type EmployeeStatus = "ACTIVE" | "LEFT" | "DISABLED";

export interface Employee {
    id: string;
    full_name: string;
    employee_code: string | null;
    email: string | null;
    role: "STAFF" | "MANAGER" | "KITCHEN" | "CASHIER";
    branch_id: string;
    date_of_joining: string;
    gender?: string | null;
    date_of_birth?: string | null;
    phone: string;
    address: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    emergency_contacts: { name: string; phone: string; relation: string }[];
    bank_account_number: string;
    bank_ifsc: string;
    bank_name: string;
    upi_id: string | null;
    aadhaar: string | null;
    pan: string | null;
    pf_uan: string | null;
    esi_number: string | null;
    is_active: boolean;
    status: EmployeeStatus;
    department: string | null;
    skills: string[];
    shift_start: string | null;
    shift_end: string | null;
    shift_type?: "regular" | "break" | null;
    shift_2_start?: string | null;
    shift_2_end?: string | null;
    total_working_hours: number | null;
    created_by: string | null;
    created_at: string;
    branches?: Pick<Branch, "name"> | null;
}

// ── Attendance ───────────────────────────────────────────

export type AttendanceStatus =
    | "PRESENT"
    | "ABSENT"
    | "HALF_DAY"
    | "LATE"
    | "OT"
    | "LEAVE_APPROVED"
    | "LEAVE_UNAPPROVED";

export interface AttendanceLog {
    id: string;
    employee_id: string;
    branch_id: string;
    check_in: string;
    check_out: string | null;
    status: AttendanceStatus;
    source: "BIOMETRIC" | "MANUAL" | "MOBILE";
    metadata: Record<string, unknown> | null;
    created_at: string;
}

// ── Leave ────────────────────────────────────────────────

export type LeaveType = "CASUAL" | "SICK" | "PAID" | "LOP";
export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface LeaveRequest {
    id: string;
    employee_id: string;
    type: LeaveType;
    start_date: string;
    end_date: string;
    reason: string | null;
    status: LeaveStatus;
    approved_by: string | null;
    created_at: string;
    employees?: Pick<Employee, "full_name"> & { branches?: Pick<Branch, "name"> | null } | null;
}

// ── Loans ────────────────────────────────────────────────

export type LoanStatus = "ACTIVE" | "CLOSED" | "WRITTEN_OFF";
export type LoanType = "LOAN" | "ADVANCE";

export interface RepaymentEntry {
    month: number;
    year: number;
    amount: number;
}

export interface Loan {
    id: string;
    employee_id: string;
    type: LoanType;
    amount: number;
    disbursement_date: string;
    // Loan specific
    tenure_months?: number;
    monthly_emi?: number;
    start_month?: number;
    start_year?: number;
    repayment_schedule?: RepaymentEntry[];
    // Advance specific
    deduction_month?: number;
    deduction_year?: number;

    balance_amount: number;
    status: LoanStatus;
    created_at: string;
    employees?: Pick<Employee, "full_name"> | null;
}

export interface WriteOff {
    id: string;
    employee_id: string;
    loan_id: string;
    amount: number;
    reason: string;
    restored: boolean;
    restored_loan_id: string | null;
    created_at: string;
    loans?: Pick<Loan, "type" | "amount"> | null;
}

// ── Payroll ──────────────────────────────────────────────

export type PeriodStatus = "OPEN" | "PROCESSING" | "LOCKED";

export interface PayrollPeriod {
    id: string;
    month: number;
    year: number;
    status: PeriodStatus;
    locked_at: string | null;
    locked_by: string | null;
}

export interface Payslip {
    id: string;
    employee_id: string;
    period_id: string;
    basic_pay: number;
    hra: number;
    allowances: number;
    incentives: number;
    overtime_pay: number;
    gross_pay: number;
    pf_deduction: number;
    esi_deduction: number;
    pt_deduction: number;
    tds_deduction: number;
    loan_deduction: number;
    net_pay: number;
    pdf_url: string | null;

    // Attendance Metrics
    present_days: number;
    absent_days: number;
    late_days: number;
    half_days: number;
    leave_days: number;
    late_deduction: number;

    created_at: string;
    employees?: Pick<Employee, "full_name" | "role"> & { branches?: Pick<Branch, "name"> | null } | null;
}

// ── Incentives & Sales ───────────────────────────────────

export type IncentiveType = "FIXED" | "PERCENTAGE" | "SLAB";

export interface IncentiveRule {
    id: string;
    branch_id: string | null;
    role_id: string | null;
    target_amount: number | null;
    incentive_amount: number | null;
    type: IncentiveType;
    created_at: string;
}

export interface BranchDailySales {
    id: string;
    branch_id: string;
    date: string;
    sales_amount: number;
    created_at: string;
}

// ── Holidays ─────────────────────────────────────────────

export type HolidayType = "PAID" | "UNPAID" | "COMP_OFF";

export interface Holiday {
    id: string;
    name: string;
    date: string;
    branch_id: string | null;
    type: HolidayType;
    created_at: string;
    branches?: Pick<Branch, "name"> | null;
}

// ── Salary Structure ─────────────────────────────────────

export interface SalaryStructure {
    id: string;
    employee_id: string;
    basic_pay: number;
    hra: number;
    allowances: number;
    ot_rate: number;
    effective_from: string;
    created_at: string;
}

// ── Organization Settings ────────────────────────────────

export interface OrgSetting {
    id: string;
    key: string;
    value: unknown;
    updated_at: string;
}

// ── Employee Documents ───────────────────────────────────

export type DocumentCategory = "Aadhaar" | "PAN" | "Bank Passbook" | "Address Proof" | "Photo" | "Offer Letter" | "Other";

export interface EmployeeDocument {
    id: string;
    employee_id: string;
    category: DocumentCategory;
    file_name: string;
    file_url: string;
    file_type: string;
    uploaded_at: string;
}

// ── Branch Rules (Late, Leave, OT) ───────────────────────

export type BranchRuleType = "LATE_COMING" | "LEAVE_POLICY" | "OVERTIME";

export interface BranchRule {
    id: string;
    branch_id: string | null;
    rule_type: BranchRuleType;
    title: string;
    threshold_minutes: number;
    deduction_percentage: number;
    rate_multiplier: number;
    leave_type: string | null;
    eligible_roles: string[];
    eligible_employee_ids?: string[];
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

