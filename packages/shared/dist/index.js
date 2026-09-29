"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ATTENDANCE_STATES = exports.ROLE_LABELS = void 0;
exports.ROLE_LABELS = {
    SUPER_ADMIN: "Super Admin",
    BRAND_ADMIN: "Brand Admin",
    BRANCH_ADMIN: "Branch Admin",
    MANAGER: "Manager",
    BRANCH_STAFF: "Branch Staff",
    BRANCH_MANAGER: "Branch Manager",
    PAYROLL_MANAGER: "Payroll Manager",
    EMPLOYEE: "Employee"
};
exports.ATTENDANCE_STATES = [
    "PRESENT",
    "ABSENT",
    "HALF_DAY",
    "LATE_MARK",
    "OVERTIME",
    "LEAVE_APPROVED",
    "LEAVE_UNAPPROVED"
];
