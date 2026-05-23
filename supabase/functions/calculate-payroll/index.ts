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
}

interface LoanRecord {
  id: string;
  employee_id: string;
  type: "LOAN" | "ADVANCE";
  amount: number;
  balance_amount: number;
  deduction_month?: number;
  deduction_year?: number;
  repayment_schedule?: Array<{ month: number; year: number; amount: number }>;
}

function computeForEmployee(
  empId: string,
  structures: SalaryStructure[],
  logs: AttendanceLog[],
  leaves: LeaveRequest[],
  loans: LoanRecord[],
  totalWorkingDays: number,
  periodMonth: number,
  periodYear: number
) {
  // Find latest salary structure for this employee
  const structure = structures
    .filter((s) => s.employee_id === empId)
    .sort(
      (a, b) =>
        new Date(b.effective_from).getTime() -
        new Date(a.effective_from).getTime()
    )[0];

  const basicPay = Number(structure?.basic_pay || 15000);
  const hra = Number(structure?.hra || 6000);
  const allowances = Number(structure?.allowances || 4000);
  const monthlyGross = basicPay + hra + allowances;
  const dailySalary = monthlyGross / totalWorkingDays;

  // Count attendance
  const empLogs = logs.filter((l) => l.employee_id === empId);
  const presentDays = empLogs.filter(
    (l) => l.status === "PRESENT" || l.status === "LATE"
  ).length;
  const halfDays = empLogs.filter((l) => l.status === "HALF_DAY").length;
  const lateDays = empLogs.filter((l) => l.status === "LATE").length;
  const otHours = empLogs.reduce((sum, l) => {
    if (l.status === "OT" && l.check_in && l.check_out) {
      const hrs =
        (new Date(l.check_out).getTime() - new Date(l.check_in).getTime()) /
        3600000;
      return sum + hrs;
    }
    return sum;
  }, 0);

  // Count approved leaves
  const empLeaves = leaves.filter((l) => l.employee_id === empId);
  const leaveDays = empLeaves.reduce((sum, l) => {
    const s = new Date(l.start_date);
    const e = new Date(l.end_date);
    return sum + Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1;
  }, 0);

  const effectiveDaysWorked = presentDays + halfDays * 0.5;
  const unapprovedAbsent = Math.max(
    0,
    totalWorkingDays - effectiveDaysWorked - leaveDays
  );

  // Double penalty for unapproved absence
  const absenceDeduction =
    unapprovedAbsent * dailySalary * 2 + leaveDays * dailySalary;
  const otRate = Number(structure?.ot_rate || 100);
  const overtimePay = otHours * otRate;

  const grossPay = Math.max(0, monthlyGross - absenceDeduction + overtimePay);

  // ── Statutory Deductions ──
  // PF: 12% of min(basic, ₹15,000)
  const pfBase = Math.min(basicPay, 15000);
  const pfDeduction = Math.round(pfBase * 0.12);

  // ESI: 0.75% if gross < ₹21,000
  const esiDeduction = grossPay < 21000 ? Math.round(grossPay * 0.0075) : 0;

  // PT (Tamil Nadu): ₹200 if gross > ₹15,000; ₹150 if > ₹10,000
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
      basic_pay: basicPay,
      hra,
      allowances,
      incentives: 0,
      overtime_pay: Math.round(overtimePay),
      gross_pay: Math.round(grossPay),
      pf_deduction: pfDeduction,
      esi_deduction: esiDeduction,
      pt_deduction: ptDeduction,
      tds_deduction: 0,
      loan_deduction: loanDeduction,
      net_pay: Math.round(netPay),
      present_days: presentDays,
      absent_days: unapprovedAbsent,
      late_days: lateDays,
      half_days: halfDays,
      leave_days: leaveDays,
      late_deduction: absenceDeduction,
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
    .select("id, full_name, role, branch_id")
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

  const [structuresRes, attendanceRes, loansRes, leavesRes] = await Promise.all(
    [
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
        .eq("status", "APPROVED")
        .gte("start_date", start.split("T")[0])
        .lte("end_date", end.split("T")[0]),
    ]
  );

  const structures = (structuresRes.data || []) as SalaryStructure[];
  const attendanceLogs = (attendanceRes.data || []) as AttendanceLog[];
  const activeLoans = (loansRes.data || []) as LoanRecord[];
  const approvedLeaves = (leavesRes.data || []) as LeaveRequest[];

  // ── Compute Payslips ──
  const allPayslips: Array<Record<string, unknown>> = [];
  const allLoanUpdates: Array<{ id: string; deduction: number }> = [];

  for (const emp of employees) {
    const { payslip, loanUpdates } = computeForEmployee(
      emp.id,
      structures,
      attendanceLogs,
      approvedLeaves,
      activeLoans,
      totalDays,
      period.month,
      period.year
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
