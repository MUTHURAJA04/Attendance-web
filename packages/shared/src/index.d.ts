export declare const ROLE_LABELS: {
    readonly SUPER_ADMIN: "Super Admin";
    readonly BRANCH_MANAGER: "Branch Manager";
    readonly EMPLOYEE: "Employee";
    readonly PAYROLL_MANAGER: "Payroll Manager";
};
export type Role = keyof typeof ROLE_LABELS;
export declare const ATTENDANCE_STATES: readonly ["PRESENT", "ABSENT", "HALF_DAY", "LATE_MARK", "OVERTIME", "LEAVE_APPROVED", "LEAVE_UNAPPROVED"];
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
