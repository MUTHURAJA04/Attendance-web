import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ── IST Helpers ──────────────────────────────────────────────
function istMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+05:30`;
  return { start, end, totalDays: lastDay };
}

function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const cleanStr = dateStr.split("T")[0];
  const parts = cleanStr.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  return new Date(dateStr);
}

interface SalaryStructure {
  employee_id: string;
  basic_pay: number;
  hra: number;
  allowances: number;
  ot_rate: number;
  effective_from: string;
}

interface AttendanceLog {
  employee_id: string;
  status: string;
  check_in: string;
  check_out: string | null;
}

interface LeaveRequest {
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface LeaveMultipliers {
  informed_approved: number;
  informed_unapproved: number;
  uninformed: number;
}

interface BranchRule {
  id: string;
  branch_id: string | null;
  rule_type: "LATE_COMING" | "LEAVE_POLICY" | "OVERTIME";
  title: string;
  threshold_minutes: number;
  deduction_percentage: number;
  rate_multiplier: number;
  leave_type: string | null;
  eligible_roles: string[];
  eligible_employee_ids?: string[];
  is_active: boolean;
}

interface IncentiveRule {
  id: string;
  name?: string | null;
  branch_id: string | null;
  role_id: string | null;
  target_amount: number | null;
  incentive_amount: number | null;
  type: string;
}

interface LoanRecord {
  id: string;
  employee_id: string;
  type: string;
  amount: number;
  balance_amount: number;
  monthly_emi?: number | null;
  status: string;
  deduction_month?: number | null;
  deduction_year?: number | null;
  repayment_schedule?: Array<{
    month: number;
    year: number;
    amount: number;
  }> | null;
}

interface GlobalHoliday {
  id: string;
  name: string;
  date: string;
  branch_id: string | null;
  type: string;
}

function computeForEmployee(
  empId: string,
  empName: string,
  empRole: string,
  empBranchId: string | null,
  doj: string,
  paidOffDays: number = 4,
  enablePf: boolean = true,
  enableEsi: boolean = true,
  enableOt: boolean = true,
  enablePt: boolean = true,
  empShiftStart?: string | null,
  empShiftEnd?: string | null,
  empTotalWorkingHours?: number | null,
  structures: SalaryStructure[] = [],
  logs: AttendanceLog[] = [],
  leaves: LeaveRequest[] = [],
  loans: LoanRecord[] = [],
  totalDaysInMonth: number = 30,
  periodMonth: number = 1,
  periodYear: number = 2026,
  multipliers: LeaveMultipliers = { informed_approved: 1, informed_unapproved: 1.5, uninformed: 2 },
  branchRules: BranchRule[] = [],
  incentiveRules: IncentiveRule[] = [],
  branchSalesMap: Record<string, number> = {},
  holidays: GlobalHoliday[] = []
) {
  // Latest salary structure
  const structure = structures
    .filter((s) => s.employee_id === empId)
    .sort(
      (a, b) =>
        new Date(b.effective_from).getTime() -
        new Date(a.effective_from).getTime()
    )[0];

  // Active branch rules
  const activeRules = branchRules.filter((r) => {
    if (!r.is_active) return false;
    if (r.branch_id && empBranchId && r.branch_id !== empBranchId) return false;
    if (r.eligible_employee_ids && r.eligible_employee_ids.length > 0) {
      return r.eligible_employee_ids.includes(empId);
    }
    if (r.eligible_roles && r.eligible_roles.length > 0 && !r.eligible_roles.includes("ALL")) {
      return r.eligible_roles.includes(empRole);
    }
    return true;
  });

  // Proration
  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0);

  const parsedDoj = parseLocalDate(doj);
  const effectiveStart = (parsedDoj && parsedDoj > periodStart) ? parsedDoj : periodStart;

  const now = new Date();
  const istStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const todayLocal = parseLocalDate(istStr) || periodEnd;

  const isCurrentMonth = todayLocal.getFullYear() === periodYear && (todayLocal.getMonth() + 1) === periodMonth;
  const effectiveEnd = isCurrentMonth ? (todayLocal < periodEnd ? todayLocal : periodEnd) : periodEnd;

  const expectedWorkingDays = Math.max(0, Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1);

  // Scheduled week-off allocation for the month
  const totalAllocatedWeekOffs = Math.round(paidOffDays * (expectedWorkingDays / totalDaysInMonth));

  const empHolidays = holidays.filter((h) => {
    if (h.branch_id && empBranchId && h.branch_id !== empBranchId) return false;
    const hDate = new Date(h.date + "T12:00:00");
    return hDate >= effectiveStart && hDate <= effectiveEnd;
  });
  const paidHolidayDays = empHolidays.filter((h) => h.type === "PAID" || h.type === "COMP_OFF").length;

  const basicPay = Number(structure?.basic_pay ?? 15000);
  const hra = Number(structure?.hra ?? 6000);
  const allowances = Number(structure?.allowances ?? 4000);
  const fullMonthlyGross = basicPay + hra + allowances;
  const dailySalary = fullMonthlyGross / totalDaysInMonth;

  // ── Dynamic Shift & Attendance Calculation ──
  const shiftStart = empShiftStart || "09:00";
  const shiftEnd = empShiftEnd || "18:00";
  const parseMins = (t: string) => {
    const parts = t.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };
  const shiftStartMins = parseMins(shiftStart);
  const shiftEndMins = parseMins(shiftEnd);
  const rawShiftDurationMins = shiftEndMins > shiftStartMins ? shiftEndMins - shiftStartMins : 0;
  const expectedShiftMins = rawShiftDurationMins > 0
    ? rawShiftDurationMins
    : (empTotalWorkingHours ? Math.round(empTotalWorkingHours * 60) : 480);

  const empLogs = logs.filter((l) => l.employee_id === empId);

  // Group empLogs by check-in date
  const logsByDateMap = new Map<string, AttendanceLog[]>();
  empLogs.forEach((l) => {
    if (l.check_in) {
      const dStr = l.check_in.split("T")[0];
      if (!logsByDateMap.has(dStr)) {
        logsByDateMap.set(dStr, []);
      }
      logsByDateMap.get(dStr)!.push(l);
    }
  });

  let presentDays = 0;
  let halfDays = 0;
  let lateDays = 0;
  let otHours = 0;
  let latePenaltyDeduction = 0;

  const lateRules = activeRules
    .filter((r) => r.rule_type === "LATE_COMING")
    .sort((a, b) => b.threshold_minutes - a.threshold_minutes);

  const otRule = activeRules.find((r) => r.rule_type === "OVERTIME");
  const minOtMins = otRule ? Number(otRule.threshold_minutes || 0) : 0;
  const otMultiplier = otRule ? Number(otRule.rate_multiplier || 1.0) : 1.0;

  logsByDateMap.forEach((dayLogs) => {
    const firstLog = dayLogs[0];
    const lastLog = dayLogs[dayLogs.length - 1];

    // If day is explicitly marked as ABSENT or LEAVE, do NOT process as Present/OT/Half Day
    if (
      firstLog.status === "ABSENT" ||
      firstLog.status === "LEAVE_APPROVED" ||
      firstLog.status === "LEAVE_UNAPPROVED"
    ) {
      return;
    }

    const inDate = new Date(firstLog.check_in);
    const inMins = inDate.getHours() * 60 + inDate.getMinutes();
    const lateInMinutes = Math.max(0, inMins - shiftStartMins);

    let totalWorkMinutes = 0;
    dayLogs.forEach((l) => {
      if (l.check_in && l.check_out && l.status !== "ABSENT") {
        const diffMs = new Date(l.check_out).getTime() - new Date(l.check_in).getTime();
        if (diffMs > 0) totalWorkMinutes += Math.floor(diffMs / (1000 * 60));
      }
    });

    // If no work done and no check-out, skip counting as present
    if (totalWorkMinutes === 0 && !lastLog?.check_out) {
      return;
    }

    let overtimeMinutes = 0;
    if (totalWorkMinutes > expectedShiftMins) {
      overtimeMinutes = totalWorkMinutes - expectedShiftMins;
    }

    let dayStatus = "PRESENT";
    if (lastLog?.check_out && totalWorkMinutes > 0 && totalWorkMinutes < expectedShiftMins * 0.55) {
      dayStatus = "HALF_DAY";
    } else if (overtimeMinutes >= 60) {
      dayStatus = "OT";
    } else if (lateInMinutes > 15) {
      dayStatus = "LATE";
    } else if (firstLog.status) {
      dayStatus = firstLog.status;
    }

    if (dayStatus === "HALF_DAY") {
      halfDays++;
    } else if (dayStatus === "OT") {
      presentDays++;
      if (overtimeMinutes >= minOtMins) {
        otHours += overtimeMinutes / 60;
      }
    } else if (dayStatus === "LATE") {
      presentDays++;
      lateDays++;
    } else if (dayStatus === "PRESENT") {
      presentDays++;
    }

    if (lateRules.length > 0 && lateInMinutes > 0) {
      const matchedRule = lateRules.find((r) => lateInMinutes >= Number(r.threshold_minutes));
      if (matchedRule) {
        const deductionPercent = Number(matchedRule.deduction_percentage || 0);
        latePenaltyDeduction += (deductionPercent / 100) * dailySalary;
      }
    }
  });

  const shiftHours = expectedShiftMins > 0 ? expectedShiftMins / 60 : 8;
  const computedHourlyRate = dailySalary / shiftHours;
  const baseOtRate = (structure?.ot_rate && Number(structure.ot_rate) > 0)
    ? Number(structure.ot_rate)
    : computedHourlyRate;
  const effectiveOtRate = Math.round(baseOtRate * otMultiplier);
  const overtimePay = enableOt ? Math.round(otHours * effectiveOtRate) : 0;

  // Leaves
  // ── Week-off Leave Validation Policy ──
  // 1. Mandatory Leave Application: Scheduled WEEK_OFF is NOT automatically exempt.
  // 2. Penalty Exemption: Exempt (0 deduction) ONLY if backed by an APPROVED leave request (APPROVED_LEAVE).
  // 3. Absence & Penalty: No leave request, or PENDING/REJECTED -> Status: ABSENT, Penalty: Apply LEAVE RULES.

  const empLeaves = leaves.filter((l) => l.employee_id === empId);
  const approvedLeaves = empLeaves.filter((l) => l.status === "APPROVED");
  const pendingLeaves = empLeaves.filter((l) => l.status === "PENDING");
  const rejectedLeaves = empLeaves.filter((l) => l.status === "REJECTED");

  const countDays = (reqs: LeaveRequest[]) =>
    reqs.reduce((sum, l) => {
      const s = new Date(l.start_date + "T12:00:00");
      const e = new Date(l.end_date + "T12:00:00");
      const effS = new Date(effectiveStart.getTime()); effS.setHours(12, 0, 0, 0);
      const effE = new Date(effectiveEnd.getTime()); effE.setHours(12, 0, 0, 0);

      const boundedStart = s > effS ? s : effS;
      const boundedEnd = e < effE ? e : effE;

      if (boundedStart > boundedEnd) return sum;
      return sum + Math.round((boundedEnd.getTime() - boundedStart.getTime()) / 86400000) + 1;
    }, 0);

  const informedApprovedDays = countDays(approvedLeaves);
  const informedUnapprovedDays = countDays(pendingLeaves);
  const informedRejectedDays = countDays(rejectedLeaves);

  // Scheduled week-offs backed by APPROVED leave requests are penalty-exempt (APPROVED_LEAVE)
  const exemptWeekOffDays = Math.min(totalAllocatedWeekOffs, informedApprovedDays);
  const unapprovedWeekOffDays = Math.max(0, totalAllocatedWeekOffs - exemptWeekOffDays);

  const proratedOffs = exemptWeekOffDays;
  const requiredWorkingDays = Math.max(0, expectedWorkingDays - exemptWeekOffDays - paidHolidayDays);

  const effectiveDaysWorked = presentDays + halfDays * 0.5;
  const uninformedAbsentDays = Math.max(
    0,
    requiredWorkingDays -
      effectiveDaysWorked -
      informedApprovedDays -
      informedUnapprovedDays
  );

  // Leave Multipliers
  const approvedLeaveRule = activeRules.find((r) => r.rule_type === "LEAVE_POLICY" && (r.leave_type === "APPROVED" || r.leave_type === "INFORMED_APPROVED" || r.leave_type === "ALL"));
  const unapprovedLeaveRule = activeRules.find((r) => r.rule_type === "LEAVE_POLICY" && (r.leave_type === "UNAPPROVED" || r.leave_type === "INFORMED_UNAPPROVED"));
  const absentLeaveRule = activeRules.find((r) => r.rule_type === "LEAVE_POLICY" && (r.leave_type === "UNINFORMED_ABSENT" || r.leave_type === "ABSENT" || r.leave_type === "UNINFORMED"));

  const multApproved = approvedLeaveRule ? Number(approvedLeaveRule.deduction_percentage) / 100 : multipliers.informed_approved;
  const multUnapproved = unapprovedLeaveRule ? Number(unapprovedLeaveRule.deduction_percentage) / 100 : multipliers.informed_unapproved;
  const multAbsent = absentLeaveRule ? Number(absentLeaveRule.deduction_percentage) / 100 : multipliers.uninformed;

  const absenceDeduction =
    informedApprovedDays * dailySalary * multApproved +
    informedUnapprovedDays * dailySalary * multUnapproved +
    uninformedAbsentDays * dailySalary * multAbsent;

  const totalAbsenceAndLateDeduction = Math.round(absenceDeduction + latePenaltyDeduction);

  // Earned Salary Components
  const earnedBasic = Math.round((basicPay / totalDaysInMonth) * expectedWorkingDays);
  const earnedHra = Math.round((hra / totalDaysInMonth) * expectedWorkingDays);
  const earnedAllowances = Math.round((allowances / totalDaysInMonth) * expectedWorkingDays);
  const expectedGross = earnedBasic + earnedHra + earnedAllowances;

  // ── Calculate Incentives ──
  let incentivePay = 0;
  const branchSales = empBranchId ? (branchSalesMap[empBranchId] || 0) : 0;
  for (const rule of incentiveRules) {
    if (rule.branch_id && empBranchId && rule.branch_id !== empBranchId) continue;
    const roles = rule.role_id ? rule.role_id.split(",").map((r) => r.trim()) : ["ALL"];
    if (!roles.includes("ALL") && !roles.includes(empRole)) continue;
    const target = Number(rule.target_amount || 0);
    if (branchSales >= target && target > 0) {
      if (rule.type === "PERCENTAGE") {
        incentivePay += Math.round(earnedBasic * (Number(rule.incentive_amount || 0) / 100));
      } else {
        incentivePay += Math.round(Number(rule.incentive_amount || 0));
      }
    }
  }

  const grossPay = Math.max(0, expectedGross - totalAbsenceAndLateDeduction + overtimePay + incentivePay);

  // Statutory Deductions (Honors enablePf, enableEsi, and enablePt flags)
  const pfBase = Math.min(earnedBasic, 15000);
  const pfDeduction = enablePf ? Math.round(pfBase * 0.12) : 0;
  const esiDeduction = (enableEsi && grossPay < 21000) ? Math.round(grossPay * 0.0075) : 0;

  let ptDeduction = 0;
  if (enablePt) {
    if (grossPay > 15000) ptDeduction = 200;
    else if (grossPay > 10000) ptDeduction = 150;
  }

  // Loans
  const empLoans = loans.filter((l) => l.employee_id === empId);
  let loanDeduction = 0;
  const loanUpdates: Array<{ id: string; deduction: number }> = [];

  for (const loan of empLoans) {
    let deductionThisMonth = 0;
    if (loan.type === "ADVANCE") {
      if (
        Number(loan.deduction_month) === periodMonth &&
        Number(loan.deduction_year) === periodYear
      ) {
        deductionThisMonth = Number(loan.amount || 0);
      }
    } else {
      const schedule = loan.repayment_schedule || [];
      const entry = schedule.find(
        (s) =>
          Number(s.month) === periodMonth && Number(s.year) === periodYear
      );
      if (entry) {
        deductionThisMonth = Number(entry.amount || 0);
      } else if (loan.monthly_emi && Number(loan.monthly_emi) > 0) {
        deductionThisMonth = Number(loan.monthly_emi);
      }
    }
    deductionThisMonth = Math.min(deductionThisMonth, Number(loan.balance_amount || 0));
    if (deductionThisMonth > 0) {
      loanDeduction += deductionThisMonth;
      loanUpdates.push({ id: loan.id, deduction: deductionThisMonth });
    }
  }

  const totalDeductions = pfDeduction + esiDeduction + ptDeduction + loanDeduction;
  const netPay = Math.max(0, grossPay - totalDeductions);

  const trace = {
    empId,
    empName,
    empRole,
    periodMonth,
    periodYear,
    attendanceTable: [
      { Metric: "Present Days (Full Days)", Count: presentDays },
      { Metric: "Half Days", Count: halfDays },
      { Metric: "Late Shift Days", Count: lateDays },
      { Metric: "Overtime Hours (OT)", Count: `${otHours} hrs` },
      { Metric: "Approved Paid Leaves", Count: informedApprovedDays },
      { Metric: "Pending / Unapproved Leaves", Count: informedUnapprovedDays },
      { Metric: "Calculated Uninformed Absent Days (LOP)", Count: uninformedAbsentDays },
      { Metric: "Effective Worked Days", Count: effectiveDaysWorked },
      { Metric: "Required Working Days", Count: requiredWorkingDays },
      { Metric: "Prorated Weekly Off Days", Count: proratedOffs },
      { Metric: "Declared Paid Holidays", Count: paidHolidayDays },
      { Metric: "Total Days in Month (T)", Count: totalDaysInMonth },
    ],
    onboardTable: [
      { Property: "Employee ID", Value: empId },
      { Property: "Full Name", Value: empName },
      { Property: "Designation / Role", Value: empRole },
      { Property: "Branch Scoping", Value: empBranchId || "GLOBAL / ALL BRANCHES" },
      { Property: "Date of Joining (DOJ)", Value: doj || "N/A" },
      { Property: "Weekly Off Allocation", Value: `${paidOffDays} days/month` },
      { Property: "PF Status", Value: enablePf ? "ENABLED (12%)" : "DISABLED (No PF)" },
      { Property: "ESI Status", Value: enableEsi ? "ENABLED (0.75%)" : "DISABLED (No ESI)" },
      { Property: "PT Status", Value: enablePt ? "ENABLED (TN Slab)" : "DISABLED (No PT)" },
      { Property: "Overtime Status", Value: enableOt ? "ENABLED" : "DISABLED" },
    ],
    salaryTable: [
      { Component: "Basic Pay", MonthlyAmount: `₹${basicPay.toLocaleString("en-IN")}` },
      { Component: "HRA", MonthlyAmount: `₹${hra.toLocaleString("en-IN")}` },
      { Component: "Allowances", MonthlyAmount: `₹${allowances.toLocaleString("en-IN")}` },
      { Component: "Full Monthly Contract Gross", MonthlyAmount: `₹${fullMonthlyGross.toLocaleString("en-IN")}` },
      { Component: "Computed Daily Salary Rate", MonthlyAmount: `₹${dailySalary.toFixed(2)} / day` },
    ],
    inputsTable: [
      { Metric: "Total Days in Month (T)", Count: totalDaysInMonth },
      { Metric: "Expected Active Days", Count: expectedWorkingDays },
      { Metric: "Prorated Weekly Off Days", Count: proratedOffs },
      { Metric: "Declared Paid Holidays", Count: paidHolidayDays },
      { Metric: "REQUIRED WORKING DAYS", Count: requiredWorkingDays },
      { Metric: "Days Present", Count: presentDays },
      { Metric: "Half Days", Count: halfDays },
      { Metric: "Late Shift Days", Count: lateDays },
      { Metric: "Effective Worked Days", Count: effectiveDaysWorked },
      { Metric: "Approved Paid Leaves", Count: informedApprovedDays },
      { Metric: "Pending Leaves", Count: informedUnapprovedDays },
      { Metric: "Calculated Uninformed Absent Days (LOP)", Count: uninformedAbsentDays },
    ],
    grossTable: [
      { LineItem: "Prorated Earned Basic", Amount: `₹${earnedBasic.toLocaleString("en-IN")}` },
      { LineItem: "Prorated Earned HRA", Amount: `₹${earnedHra.toLocaleString("en-IN")}` },
      { LineItem: "Prorated Earned Allowances", Amount: `₹${earnedAllowances.toLocaleString("en-IN")}` },
      { LineItem: "Expected Base Gross", Amount: `₹${expectedGross.toLocaleString("en-IN")}` },
      { LineItem: `Absence Penalty Cut (${multAbsent}x LOP multiplier${absentLeaveRule ? ` [Custom Rule: ${absentLeaveRule.title}]` : ''})`, Amount: `-₹${Math.round(absenceDeduction).toLocaleString("en-IN")}` },
      { LineItem: "Late Arrival Penalty Cut", Amount: `-₹${Math.round(latePenaltyDeduction).toLocaleString("en-IN")}` },
      { LineItem: enableOt ? `Overtime Pay (${otHours} OT hrs @ ₹${effectiveOtRate}/hr${otRule ? ` [Custom Rule: ${otRule.title} (${otMultiplier}x)]` : ''})` : "Overtime Pay (DISABLED)", Amount: `+₹${overtimePay.toLocaleString("en-IN")}` },
      { LineItem: `Sales Incentive Bonus (Branch Sales: ₹${branchSales.toLocaleString("en-IN")})`, Amount: `+₹${incentivePay.toLocaleString("en-IN")}` },
      { LineItem: "TOTAL CALCULATED GROSS PAY", Amount: `₹${grossPay.toLocaleString("en-IN")}` },
    ],
    deductionsTable: [
      { DeductionType: "Provident Fund (PF - 12%)", BaseAmount: enablePf ? `₹${pfBase.toLocaleString("en-IN")}` : "DISABLED", DeductionAmount: `₹${pfDeduction.toLocaleString("en-IN")}` },
      { DeductionType: "State Insurance (ESI - 0.75%)", BaseAmount: !enableEsi ? "DISABLED" : (grossPay < 21000 ? `₹${grossPay.toLocaleString("en-IN")}` : "Exempt (≥₹21k)"), DeductionAmount: `₹${esiDeduction.toLocaleString("en-IN")}` },
      { DeductionType: "Professional Tax (PT - TN Slab)", BaseAmount: enablePt ? `₹${grossPay.toLocaleString("en-IN")}` : "DISABLED", DeductionAmount: `₹${ptDeduction.toLocaleString("en-IN")}` },
      { DeductionType: `Active Loan Recovery (${empLoans.length} active)`, BaseAmount: "Loan Balance", DeductionAmount: `₹${loanDeduction.toLocaleString("en-IN")}` },
      { DeductionType: "TOTAL STATUTORY & LOAN DEDUCTIONS", BaseAmount: "-", DeductionAmount: `₹${totalDeductions.toLocaleString("en-IN")}` },
    ],
    netTable: [
      { Component: "Calculated Gross Earnings", Amount: `₹${grossPay.toLocaleString("en-IN")}` },
      { Component: "Total Statutory & Loan Deductions", Amount: `-₹${totalDeductions.toLocaleString("en-IN")}` },
      { Component: "NET TAKE-HOME PAYABLE", Amount: `₹${netPay.toLocaleString("en-IN")}` },
    ],
    payout: {
      employee_id: empId,
      period_month: periodMonth,
      period_year: periodYear,
      gross_pay: Math.round(grossPay),
      total_deductions: totalDeductions,
      net_pay: Math.round(netPay),
      loan_updates: loanUpdates,
    },
  };

  return {
    payslip: {
      employee_id: empId,
      basic_pay: earnedBasic,
      hra: earnedHra,
      allowances: earnedAllowances,
      incentives: incentivePay,
      overtime_pay: Math.round(overtimePay),
      gross_pay: Math.round(grossPay),
      pf_deduction: pfDeduction,
      esi_deduction: esiDeduction,
      pt_deduction: ptDeduction,
      tds_deduction: 0,
      loan_deduction: loanDeduction,
      net_pay: Math.round(netPay),
      present_days: presentDays,
      absent_days: uninformedAbsentDays,
      late_days: lateDays,
      half_days: halfDays,
      leave_days: informedApprovedDays,
      late_deduction: totalAbsenceAndLateDeduction,
      informed_approved_days: informedApprovedDays,
      informed_unapproved_days: informedUnapprovedDays,
      uninformed_absent_days: uninformedAbsentDays,
    },
    loanUpdates,
    trace,
  };
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : null;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    });

    const body = await req.json();
    if (!body.periodId) {
      return NextResponse.json({ error: "Missing periodId" }, { status: 400 });
    }

    // 1. Fetch Period
    const { data: period, error: periodError } = await supabase
      .from("payroll_periods")
      .select("*")
      .eq("id", body.periodId)
      .single();

    if (periodError || !period) {
      return NextResponse.json({ error: "Payroll period not found" }, { status: 404 });
    }

    // 2. Fetch Active Employees
    let empQuery = supabase
      .from("employees")
      .select("id, full_name, role, branch_id, date_of_joining, paid_off_days, enable_pf, enable_esi, enable_ot, enable_pt, shift_start, shift_end, total_working_hours")
      .eq("status", "ACTIVE");

    if (body.branchId) {
      empQuery = empQuery.eq("branch_id", body.branchId);
    }

    const { data: employees } = await empQuery;
    if (!employees || employees.length === 0) {
      return NextResponse.json({ error: "No active employees found for this branch" }, { status: 400 });
    }

    // 3. Fetch Supporting Data
    const periodYear = Number(period.year) || 2026;
    const periodMonth = Number(period.month) || 9;
    const { start, end, totalDays } = istMonthRange(periodYear, periodMonth);

    const [structuresRes, attendanceRes, loansRes, leavesRes, settingsRes, rulesRes, incentiveRulesRes, salesRes, holidaysRes] =
      await Promise.all([
        supabase.from("salary_structures").select("*"),
        supabase.from("attendance_logs").select("*").gte("check_in", start).lte("check_in", end),
        supabase.from("loans").select("*").eq("status", "ACTIVE"),
        supabase.from("leave_requests").select("*").in("status", ["APPROVED", "PENDING"]).gte("start_date", start.split("T")[0]).lte("end_date", end.split("T")[0]),
        supabase.from("organization_settings").select("key, value").in("key", [
          "leave_deduction_informed_approved",
          "leave_deduction_informed_unapproved",
          "leave_deduction_uninformed",
        ]),
        supabase.from("branch_rules").select("*").eq("is_active", true),
        supabase.from("incentive_rules").select("*"),
        supabase.from("branch_daily_sales").select("branch_id, sales_amount").gte("date", start.split("T")[0]).lte("date", end.split("T")[0]),
        supabase.from("global_holidays").select("*").gte("date", start.split("T")[0]).lte("date", end.split("T")[0]),
      ]);

    const structures = (structuresRes.data || []) as SalaryStructure[];
    const attendanceLogs = (attendanceRes.data || []) as AttendanceLog[];
    const activeLoans = (loansRes.data || []) as LoanRecord[];
    const allLeaves = (leavesRes.data || []) as LeaveRequest[];
    const branchRules = (rulesRes.data || []) as BranchRule[];
    const incentiveRules = (incentiveRulesRes.data || []) as IncentiveRule[];
    const globalHolidays = (holidaysRes.data || []) as GlobalHoliday[];

    // Calculate monthly sales per branch
    const branchSalesMap: Record<string, number> = {};
    for (const sale of (salesRes.data || []) as Array<{ branch_id: string; sales_amount: number }>) {
      if (sale.branch_id) {
        branchSalesMap[sale.branch_id] =
          (branchSalesMap[sale.branch_id] || 0) + Number(sale.sales_amount || 0);
      }
    }

    console.log(`[Payroll Calculate] Period: ${periodMonth}/${periodYear}, Branch Sales:`, branchSalesMap);
    console.log(`[Payroll Calculate] Incentive Rules loaded (${incentiveRules.length}):`, incentiveRules.map(r => ({ id: r.id, name: r.name, target: r.target_amount, type: r.type, amount: r.incentive_amount })));

    const settingsMap: Record<string, string> = {};
    for (const row of settingsRes.data || []) {
      settingsMap[row.key] = row.value;
    }
    const multipliers: LeaveMultipliers = {
      informed_approved: Number(JSON.parse(settingsMap.leave_deduction_informed_approved || '"1"')),
      informed_unapproved: Number(JSON.parse(settingsMap.leave_deduction_informed_unapproved || '"1.5"')),
      uninformed: Number(JSON.parse(settingsMap.leave_deduction_uninformed || '"2"')),
    };

    // 4. Compute Payslips
    const allPayslips: Array<Record<string, unknown>> = [];
    const allLoanUpdates: Array<{ id: string; deduction: number }> = [];
    const allTraces: Array<any> = [];

    for (const emp of employees) {
      const { payslip, loanUpdates, trace } = computeForEmployee(
        emp.id,
        emp.full_name || "Unknown Employee",
        emp.role,
        emp.branch_id,
        emp.date_of_joining,
        emp.paid_off_days ?? 4,
        emp.enable_pf ?? true,
        emp.enable_esi ?? true,
        emp.enable_ot ?? true,
        emp.enable_pt ?? true,
        emp.shift_start,
        emp.shift_end,
        emp.total_working_hours,
        structures,
        attendanceLogs,
        allLeaves,
        activeLoans,
        totalDays,
        period.month,
        period.year,
        multipliers,
        branchRules,
        incentiveRules,
        branchSalesMap,
        globalHolidays
      );

      allPayslips.push({ ...payslip, period_id: period.id });
      allLoanUpdates.push(...loanUpdates);
      allTraces.push(trace);
    }

    // 5. Delete and Insert Payslips
    if (body.branchId) {
      const empIds = employees.map((e) => e.id);
      await supabase.from("payslips").delete().eq("period_id", period.id).in("employee_id", empIds);
    } else {
      await supabase.from("payslips").delete().eq("period_id", period.id);
    }

    const { error: insertError } = await supabase.from("payslips").insert(allPayslips);
    if (insertError) {
      return NextResponse.json({ error: "Failed to save payslips: " + insertError.message }, { status: 500 });
    }

    // 6. Update Loan Balances (only if period is LOCKED)
    if (period.status === "LOCKED") {
      for (const update of allLoanUpdates) {
        const loan = activeLoans.find((l) => l.id === update.id);
        if (!loan) continue;
        const newBalance = Math.max(0, Number(loan.balance_amount) - update.deduction);
        await supabase
          .from("loans")
          .update({
            balance_amount: newBalance,
            status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
          })
          .eq("id", update.id);
      }
    }

    const totalGross = allPayslips.reduce((sum, p) => sum + Number(p.gross_pay || 0), 0);
    const totalDeductions = allPayslips.reduce(
      (sum, p) =>
        sum +
        Number(p.pf_deduction || 0) +
        Number(p.esi_deduction || 0) +
        Number(p.pt_deduction || 0) +
        Number(p.tds_deduction || 0) +
        Number(p.loan_deduction || 0),
      0
    );
    const totalNet = allPayslips.reduce((sum, p) => sum + Number(p.net_pay || 0), 0);

    return NextResponse.json({
      success: true,
      summary: {
        employeeCount: employees.length,
        totalGross: Math.round(totalGross),
        totalDeductions: Math.round(totalDeductions),
        totalNet: Math.round(totalNet),
        periodId: period.id,
        month: period.month,
        year: period.year,
      },
      traces: allTraces,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
