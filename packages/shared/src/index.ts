export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  BRAND_ADMIN: "Brand Admin",
  BRANCH_ADMIN: "Branch Admin",
  MANAGER: "Manager",
  BRANCH_STAFF: "Branch Staff",
  BRANCH_MANAGER: "Branch Manager",
  PAYROLL_MANAGER: "Payroll Manager",
  EMPLOYEE: "Employee"
} as const;

export type Role = keyof typeof ROLE_LABELS;

export const ATTENDANCE_STATES = [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "LATE_MARK",
  "OVERTIME",
  "LEAVE_APPROVED",
  "LEAVE_UNAPPROVED"
] as const;

export type AttendanceState = (typeof ATTENDANCE_STATES)[number];

export type EmployeeRole = "STAFF" | "MANAGER" | "KITCHEN" | "CASHIER";

export type Branch = {
  id: string;
  name: string;
  city: string;
  state: string | null;
};

export type BranchCreateInput = {
  name: string;
  city: string;
  state?: string;
};

export type EmployeeCreateInput = {
  fullName: string;
  employeeCode?: string;
  role: EmployeeRole;
  branchId: string;
  dateOfJoining: string;
  dateOfBirth?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  phone: string;
  address?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  upiId?: string;
  aadhaar?: string;
  pan?: string;
  pfUan?: string;
  esiNumber?: string;
};
