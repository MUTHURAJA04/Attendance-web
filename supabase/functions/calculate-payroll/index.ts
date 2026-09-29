import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = ["SUPER_ADMIN", "PAYROLL_MANAGER"] as const;

// ── IST Helpers ──────────────────────────────────────────────
function istMonthRange(year: number, month: number) {
  // Returns ISO strings for the first and last instant of the given month in IST
  const start = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59+05:30`;
  return { start, end, totalDays: lastDay };
}

// ── Payroll Computation Core ─────────────────────────────────
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
  status: string; // APPROVED or PENDING
}

interface LeaveMultipliers {
  informed_approved: number;   // default 1
  informed_unapproved: number; // default 1.5
  uninformed: number;          // default 2
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

function computeForEmployee(
  empId: string,
  empRole: string,
  empBranchId: string | null,
  doj: string,
  structures: SalaryStructure[],
  logs: AttendanceLog[],
  leaves: LeaveRequest[],
  loans: LoanRecord[],
  totalDaysInMonth: number,
  periodMonth: number,
  periodYear: number,
  multipliers: LeaveMultipliers,
  branchRules: BranchRule[] = [],
  incentiveRules: IncentiveRule[] = [],
  branchSalesMap: Record<string, number> = {}
) {
  // Find latest salary structure for this employee
  const structure = structures
    .filter((s) => s.employee_id === empId)
    .sort(
      (a, b) =>
        new Date(b.effective_from).getTime() -
        new Date(a.effective_from).getTime()
    )[0];

  // Filter active rules for this employee (matching branch & role/employee eligibility)
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

  // ── Proration Logic ──
  const periodStart = new Date(periodYear, periodMonth - 1, 1);
  const periodEnd = new Date(periodYear, periodMonth, 0);

  const empDoj = new Date(doj);
  const effectiveStart = empDoj > periodStart ? empDoj : periodStart;

  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const isCurrentMonth = today.getFullYear() === periodYear && (today.getMonth() + 1) === periodMonth;
  const effectiveEnd = isCurrentMonth ? today : periodEnd;

  const expectedWorkingDays = Math.max(0, Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000) + 1);

  const basicPay = Number(structure?.basic_pay || 15000);
  const hra = Number(structure?.hra || 6000);
  const allowances = Number(structure?.allowances || 4000);
  const fullMonthlyGross = basicPay + hra + allowances;
  const dailySalary = fullMonthlyGross / totalDaysInMonth;

  // Count attendance
  const empLogs = logs.filter((l) => l.employee_id === empId);
  const presentDays = empLogs.filter(
    (l) => l.status === "PRESENT" || l.status === "LATE"
  ).length;
  const halfDays = empLogs.filter((l) => l.status === "HALF_DAY").length;
  const lateDays = empLogs.filter((l) => l.status === "LATE").length;

  // ── Dynamic Overtime calculation with Branch Rules ──
  const otRule = activeRules.find((r) => r.rule_type === "OVERTIME");
  const minOtMins = otRule ? Number(otRule.threshold_minutes || 0) : 0;
  const otMultiplier = otRule ? Number(otRule.rate_multiplier || 1.0) : 1.0;

  const otHours = empLogs.reduce((sum, l) => {
    if (l.status === "OT" && l.check_in && l.check_out) {
      const durationMins =
        (new Date(l.check_out).getTime() - new Date(l.check_in).getTime()) /
        60000;
      if (durationMins >= minOtMins) {
        return sum + durationMins / 60;
      }
    }
    return sum;
  }, 0);

  const baseOtRate = Number(structure?.ot_rate || 100);
  const effectiveOtRate = baseOtRate * otMultiplier;
  const overtimePay = Math.round(otHours * effectiveOtRate);

  // ── Dynamic Late Coming deduction with Branch Rules ──
  const lateRules = activeRules
    .filter((r) => r.rule_type === "LATE_COMING")
    .sort((a, b) => b.threshold_minutes - a.threshold_minutes); // Highest threshold first

  let latePenaltyDeduction = 0;
  if (lateRules.length > 0) {
    empLogs.forEach((l) => {
      if (l.status === "LATE" && l.check_in) {
        const inDate = new Date(l.check_in);
        const inMinutes = inDate.getHours() * 60 + inDate.getMinutes();
        const shiftStartMinutes = 9 * 60; // 09:00 default
        const minutesLate = Math.max(0, inMinutes - shiftStartMinutes);

        const matchedRule = lateRules.find((r) => minutesLate >= Number(r.threshold_minutes));
        if (matchedRule) {
          const deductionPercent = Number(matchedRule.deduction_percentage || 0);
          latePenaltyDeduction += (deductionPercent / 100) * dailySalary;
        }
      }
    });
  }

  // Count leaves by tier
  const empLeaves = leaves.filter((l) => l.employee_id === empId);
  const approvedLeaves = empLeaves.filter((l) => l.status === "APPROVED");
  const pendingLeaves = empLeaves.filter((l) => l.status === "PENDING");

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

  const effectiveDaysWorked = presentDays + halfDays * 0.5;
  const uninformedAbsentDays = Math.max(
    0,
    expectedWorkingDays -
      effectiveDaysWorked -
      informedApprovedDays -
      informedUnapprovedDays
  );

  // ── Dynamic Leave Multipliers from Branch Rules or Org Settings ──
  const approvedLeaveRule = activeRules.find((r) => r.rule_type === "LEAVE_POLICY" && (r.leave_type === "APPROVED" || r.leave_type === "ALL"));
  const unapprovedLeaveRule = activeRules.find((r) => r.rule_type === "LEAVE_POLICY" && r.leave_type === "UNAPPROVED");
  const absentLeaveRule = activeRules.find((r) => r.rule_type === "LEAVE_POLICY" && (r.leave_type === "UNINFORMED_ABSENT" || r.leave_type === "ABSENT"));

  const multApproved = approvedLeaveRule ? Number(approvedLeaveRule.deduction_percentage) / 100 : multipliers.informed_approved;
  const multUnapproved = unapprovedLeaveRule ? Number(unapprovedLeaveRule.deduction_percentage) / 100 : multipliers.informed_unapproved;
  const multAbsent = absentLeaveRule ? Number(absentLeaveRule.deduction_percentage) / 100 : multipliers.uninformed;

  // Three-tier absence deduction
  const absenceDeduction =
    informedApprovedDays * dailySalary * multApproved +
    informedUnapprovedDays * dailySalary * multUnapproved +
    uninformedAbsentDays * dailySalary * multAbsent;

  const totalAbsenceAndLateDeduction = Math.round(absenceDeduction + latePenaltyDeduction);

  // ── Earned Salary Components ──
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

  // ── Statutory Deductions ──
  const pfBase = Math.min(earnedBasic, 15000);
  const pfDeduction = Math.round(pfBase * 0.12);

  const esiDeduction = grossPay < 21000 ? Math.round(grossPay * 0.0075) : 0;

  let ptDeduction = 0;
  if (grossPay > 15000) ptDeduction = 200;
  else if (grossPay > 10000) ptDeduction = 150;

  // ── Loan / Advance Deductions ──
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
      }
    }
    if (deductionThisMonth > 0) {
      loanDeduction += deductionThisMonth;
      loanUpdates.push({ id: loan.id, deduction: deductionThisMonth });
    }
  }

  const totalDeductions =
    pfDeduction + esiDeduction + ptDeduction + loanDeduction;
  const netPay = Math.max(0, grossPay - totalDeductions);

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
  };
}

// ── Edge Function Handler ────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── Auth Check ──
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = authHeader
    ? authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : authHeader
    : null;

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing authorization token" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(
    token
  );
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const role = userData.user.user_metadata?.role as string | undefined;
  if (!role || !ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return new Response(
      JSON.stringify({ error: "Insufficient permissions" }),
      {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── Parse Request ──
  const body = (await req.json()) as {
    periodId?: string;
    branchId?: string | null;
  };

  if (!body.periodId) {
    return new Response(JSON.stringify({ error: "Missing periodId" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Fetch Period ──
  const { data: period, error: periodError } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", body.periodId)
    .single();

  if (periodError || !period) {
    return new Response(
      JSON.stringify({ error: "Payroll period not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── Fetch Employees ──
  let empQuery = supabase
    .from("employees")
    .select("id, full_name, role, branch_id, date_of_joining")
    .eq("status", "ACTIVE");

  if (body.branchId) {
    empQuery = empQuery.eq("branch_id", body.branchId);
  }

  const { data: employees } = await empQuery;

  if (!employees || employees.length === 0) {
    return new Response(
      JSON.stringify({ error: "No active employees found for this branch" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── Fetch Supporting Data ──
  const { start, end, totalDays } = istMonthRange(period.year, period.month);

  const [structuresRes, attendanceRes, loansRes, leavesRes, settingsRes, rulesRes, incentiveRulesRes, salesRes] =
    await Promise.all([
      supabase.from("salary_structures").select("*"),
      supabase
        .from("attendance_logs")
        .select("*")
        .gte("check_in", start)
        .lte("check_in", end),
      supabase.from("loans").select("*").eq("status", "ACTIVE"),
      supabase
        .from("leave_requests")
        .select("*")
        .in("status", ["APPROVED", "PENDING"])
        .gte("start_date", start.split("T")[0])
        .lte("end_date", end.split("T")[0]),
      supabase
        .from("organization_settings")
        .select("key, value")
        .in("key", [
          "leave_deduction_informed_approved",
          "leave_deduction_informed_unapproved",
          "leave_deduction_uninformed",
        ]),
      supabase.from("branch_rules").select("*").eq("is_active", true),
      supabase.from("incentive_rules").select("*"),
      supabase
        .from("branch_daily_sales")
        .select("branch_id, sales_amount")
        .gte("date", start.split("T")[0])
        .lte("date", end.split("T")[0]),
    ]);

  const structures = (structuresRes.data || []) as SalaryStructure[];
  const attendanceLogs = (attendanceRes.data || []) as AttendanceLog[];
  const activeLoans = (loansRes.data || []) as LoanRecord[];
  const allLeaves = (leavesRes.data || []) as LeaveRequest[];
  const branchRules = (rulesRes.data || []) as BranchRule[];
  const incentiveRules = (incentiveRulesRes.data || []) as IncentiveRule[];

  // Calculate monthly sales per branch
  const branchSalesMap: Record<string, number> = {};
  for (const sale of (salesRes.data || []) as Array<{ branch_id: string; sales_amount: number }>) {
    if (sale.branch_id) {
      branchSalesMap[sale.branch_id] =
        (branchSalesMap[sale.branch_id] || 0) + Number(sale.sales_amount || 0);
    }
  }

  // Parse leave deduction multipliers from settings
  const settingsMap: Record<string, string> = {};
  for (const row of settingsRes.data || []) {
    settingsMap[row.key] = row.value;
  }
  const multipliers: LeaveMultipliers = {
    informed_approved: Number(
      JSON.parse(settingsMap.leave_deduction_informed_approved || '"1"')
    ),
    informed_unapproved: Number(
      JSON.parse(
        settingsMap.leave_deduction_informed_unapproved || '"1.5"'
      )
    ),
    uninformed: Number(
      JSON.parse(settingsMap.leave_deduction_uninformed || '"2"')
    ),
  };

  // ── Compute Payslips ──
  const allPayslips: Array<Record<string, unknown>> = [];
  const allLoanUpdates: Array<{ id: string; deduction: number }> = [];

  for (const emp of employees) {
    const { payslip, loanUpdates } = computeForEmployee(
      emp.id,
      emp.role,
      emp.branch_id,
      emp.date_of_joining,
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
      branchSalesMap
    );

    allPayslips.push({ ...payslip, period_id: period.id });
    allLoanUpdates.push(...loanUpdates);
  }

  // ── Persist Results ──
  // Delete existing payslips for this period
  await supabase.from("payslips").delete().eq("period_id", period.id);

  // Insert new payslips
  const { error: insertError } = await supabase
    .from("payslips")
    .insert(allPayslips);

  if (insertError) {
    return new Response(
      JSON.stringify({ error: "Failed to save payslips: " + insertError.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // ── Update Loan Balances ──
  for (const update of allLoanUpdates) {
    const loan = activeLoans.find((l) => l.id === update.id);
    if (!loan) continue;
    const newBalance = Math.max(
      0,
      Number(loan.balance_amount) - update.deduction
    );
    await supabase
      .from("loans")
      .update({
        balance_amount: newBalance,
        status: newBalance <= 0 ? "CLOSED" : "ACTIVE",
      })
      .eq("id", update.id);
  }

  // ── Return Summary ──
  const totalGross = allPayslips.reduce(
    (sum, p) => sum + Number(p.gross_pay || 0),
    0
  );
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
  const totalNet = allPayslips.reduce(
    (sum, p) => sum + Number(p.net_pay || 0),
    0
  );

  return new Response(
    JSON.stringify({
      summary: {
        employeeCount: employees.length,
        totalGross: Math.round(totalGross),
        totalDeductions: Math.round(totalDeductions),
        totalNet: Math.round(totalNet),
        periodId: period.id,
        month: period.month,
        year: period.year,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
