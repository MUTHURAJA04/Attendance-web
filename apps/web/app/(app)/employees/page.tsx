"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import type { Employee, EmployeeStatus, Loan, WriteOff } from "../../../lib/types";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "ALL">("ACTIVE");
  const [confirmAction, setConfirmAction] = useState<{ emp: Employee; action: "LEFT" | "DISABLE" | "ENABLE" | "DELETE" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Write-off state
  const [writeOffData, setWriteOffData] = useState<{ emp: Employee; loans: Loan[] } | null>(null);
  // Write-back state
  const [writeBackData, setWriteBackData] = useState<{ emp: Employee; writeoffs: WriteOff[] } | null>(null);

  const { selectedBranch, isLoading: tenantLoading } = useTenant();

  useEffect(() => { loadEmployees(); }, [selectedBranch, tenantLoading]);

  async function loadEmployees() {
    if (tenantLoading) return;
    setLoading(true);
    let query = supabaseBrowser
      .from("employees")
      .select("*, branches(name)")
      .order("created_at", { ascending: false });

    if (selectedBranch) {
      query = query.eq("branch_id", selectedBranch.id);
    }

    const { data } = await query;
    if (data) setEmployees(data as Employee[]);
    setLoading(false);
  }

  // ── Mark Left Flow ──
  const initiateMarkLeft = async (emp: Employee) => {
    // Check for active loans/advances
    const { data: activeLoans } = await supabaseBrowser
      .from("loans")
      .select("*")
      .eq("employee_id", emp.id)
      .eq("status", "ACTIVE");

    if (activeLoans && activeLoans.length > 0) {
      // Has outstanding loans - show write-off dialog
      setWriteOffData({ emp, loans: activeLoans as Loan[] });
    } else {
      // No outstanding loans - show simple confirm
      setConfirmAction({ emp, action: "LEFT" });
    }
  };

  const executeWriteOff = async () => {
    if (!writeOffData) return;
    setActionLoading(true);
    const { emp } = writeOffData;

    // Simply mark employee as LEFT — the DB trigger
    // (trg_employee_left_writeoff) automatically handles:
    // 1. Creating loan_writeoffs records for each ACTIVE loan
    // 2. Marking all ACTIVE loans as WRITTEN_OFF
    const { error: empError } = await supabaseBrowser
      .from("employees")
      .update({ status: "LEFT", is_active: false })
      .eq("id", emp.id);

    if (!empError) {
      setEmployees(employees.map(e => e.id === emp.id ? { ...e, status: "LEFT" as EmployeeStatus, is_active: false } : e));
      setWriteOffData(null);
    } else {
      alert("Failed: " + empError.message);
    }
    setActionLoading(false);
  };

  // ── Re-activate Flow ──
  const initiateReactivate = async (emp: Employee) => {
    // Check for unrestored write-offs
    const { data: writeoffs } = await supabaseBrowser
      .from("loan_writeoffs")
      .select("*, loans(type, amount)")
      .eq("employee_id", emp.id)
      .eq("restored", false);

    if (writeoffs && writeoffs.length > 0) {
      setWriteBackData({ emp, writeoffs: writeoffs as WriteOff[] });
    } else {
      setConfirmAction({ emp, action: "ENABLE" });
    }
  };

  const executeWriteBack = async () => {
    if (!writeBackData) return;
    setActionLoading(true);
    const { emp, writeoffs } = writeBackData;

    const now = new Date();
    let nextMonth = now.getMonth() + 2;
    let nextYear = now.getFullYear();
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // Create new loans for each write-off
    for (const wo of writeoffs) {
      const newLoan: Record<string, unknown> = {
        employee_id: emp.id,
        type: wo.loans?.type || "LOAN",
        amount: wo.amount,
        balance_amount: wo.amount,
        disbursement_date: new Date().toISOString().split("T")[0],
        status: "ACTIVE",
        tenure_months: 1,
        monthly_emi: wo.amount,
        repayment_schedule: [],
        deduction_month: nextMonth,
        deduction_year: nextYear,
      };

      const { data: insertedLoan, error: loanErr } = await supabaseBrowser
        .from("loans")
        .insert([newLoan])
        .select("id")
        .single();

      if (loanErr) { alert("Restore failed: " + loanErr.message); setActionLoading(false); return; }

      // Mark writeoff as restored
      await supabaseBrowser
        .from("loan_writeoffs")
        .update({ restored: true, restored_loan_id: insertedLoan.id })
        .eq("id", wo.id);
    }

    // Re-activate employee
    const { error } = await supabaseBrowser
      .from("employees")
      .update({ status: "ACTIVE", is_active: true })
      .eq("id", emp.id);

    if (!error) {
      setEmployees(employees.map(e => e.id === emp.id ? { ...e, status: "ACTIVE" as EmployeeStatus, is_active: true } : e));
      setWriteBackData(null);
    } else {
      alert("Failed: " + error.message);
    }
    setActionLoading(false);
  };

  const skipWriteBackAndActivate = async () => {
    if (!writeBackData) return;
    setActionLoading(true);
    const { emp } = writeBackData;

    const { error } = await supabaseBrowser
      .from("employees")
      .update({ status: "ACTIVE", is_active: true })
      .eq("id", emp.id);

    if (!error) {
      setEmployees(employees.map(e => e.id === emp.id ? { ...e, status: "ACTIVE" as EmployeeStatus, is_active: true } : e));
      setWriteBackData(null);
    } else {
      alert("Failed: " + error.message);
    }
    setActionLoading(false);
  };

  // ── Simple actions (Disable/Enable with no loan logic) ──
  const executeAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    const { emp, action } = confirmAction;

    if (action === "DELETE") {
      try {
        await Promise.all([
          supabaseBrowser.from("attendance_logs").delete().eq("employee_id", emp.id),
          supabaseBrowser.from("loans").delete().eq("employee_id", emp.id),
          supabaseBrowser.from("loan_writeoffs").delete().eq("employee_id", emp.id),
          supabaseBrowser.from("leave_requests").delete().eq("employee_id", emp.id),
          supabaseBrowser.from("payslips").delete().eq("employee_id", emp.id),
          supabaseBrowser.from("salary_structures").delete().eq("employee_id", emp.id),
          supabaseBrowser.from("employee_documents").delete().eq("employee_id", emp.id)
        ]);
        const { error } = await supabaseBrowser.from("employees").delete().eq("id", emp.id);
        if (error) throw error;
        setEmployees(employees.filter(e => e.id !== emp.id));
        setConfirmAction(null);
      } catch (error: any) {
        alert("Failed to delete employee: " + error.message);
      } finally {
        setActionLoading(false);
      }
      return;
    }

    let updatePayload: { status: string; is_active: boolean };
    if (action === "LEFT") {
      updatePayload = { status: "LEFT", is_active: false };
    } else if (action === "DISABLE") {
      updatePayload = { status: "DISABLED", is_active: false };
    } else {
      updatePayload = { status: "ACTIVE", is_active: true };
    }

    const { error } = await supabaseBrowser.from("employees").update(updatePayload).eq("id", emp.id);
    if (!error) {
      setEmployees(employees.map(e => e.id === emp.id ? { ...e, ...updatePayload, status: updatePayload.status as EmployeeStatus } : e));
      setConfirmAction(null);
    } else {
      alert("Failed: " + error.message);
    }
    setActionLoading(false);
  };

  const filtered = statusFilter === "ALL" ? employees : employees.filter((e) => (e.status || (e.is_active ? "ACTIVE" : "DISABLED")) === statusFilter);
  const counts = {
    ALL: employees.length,
    ACTIVE: employees.filter(e => (e.status || (e.is_active ? "ACTIVE" : "DISABLED")) === "ACTIVE").length,
    LEFT: employees.filter(e => e.status === "LEFT").length,
    DISABLED: employees.filter(e => (e.status || (e.is_active ? "ACTIVE" : "DISABLED")) === "DISABLED").length,
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1>Employees</h1>
          <p>Manage your workforce, roles, and branch assignments.</p>
        </div>
        <Link href="/employees/new" className="button button-primary">+ Onboard Employee</Link>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6 w-fit">
        {(["ACTIVE", "LEFT", "DISABLED", "ALL"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 text-sm rounded-md transition-all ${statusFilter === s ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
            {s === "ALL" ? "All" : s === "LEFT" ? "Left" : s === "DISABLED" ? "Disabled" : "Active"}
            <span className="ml-1.5 text-xs text-muted-foreground">({counts[s]})</span>
          </button>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Employee</th>
              <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Contact</th>
              <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Branch</th>
              <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Dept</th>
              <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Role</th>
              <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Status</th>
              <th className="py-3 px-6 text-right font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Loading employees...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No employees found for this filter.</td></tr>
            ) : (
              filtered.map((emp) => {
                const empStatus = emp.status || (emp.is_active ? "ACTIVE" : "DISABLED");
                return (
                  <tr key={emp.id} className={`transition-colors hover:bg-muted/30 ${empStatus !== "ACTIVE" ? "opacity-60" : ""}`}>
                    <td className="py-3 px-6"><div className="flex flex-col"><strong className="font-medium text-foreground">{emp.full_name}</strong><span className="text-muted-foreground text-[0.65rem] uppercase tracking-wider">{emp.employee_code || "—"}</span></div></td>
                    <td className="py-3 px-6"><div className="flex flex-col text-xs"><span className="text-foreground">{emp.phone}</span></div></td>
                    <td className="py-3 px-6 text-foreground">{emp.branches?.name || "Unassigned"}</td>
                    <td className="py-3 px-6"><span className="text-muted-foreground">{emp.department || "—"}</span></td>
                    <td className="py-3 px-6"><span className="pill text-xs !bg-secondary !text-secondary-foreground">{emp.role}</span></td>
                    <td className="py-3 px-6"><span className={`pill text-xs ${empStatus === "ACTIVE" ? "pill-success" : empStatus === "LEFT" ? "pill-secondary" : "pill-destructive"}`}>{empStatus}</span></td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/employees/${emp.id}`} className="button button-secondary h-8 text-xs bg-background">View</Link>
                        {empStatus === "ACTIVE" && (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmAction({ emp, action: "DISABLE" }); }} className="button button-secondary h-8 text-xs text-warning bg-background">Disable</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); initiateMarkLeft(emp); }} className="button button-secondary h-8 text-xs text-destructive bg-background">Mark Left</button>
                          </>
                        )}
                        {empStatus === "DISABLED" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmAction({ emp, action: "ENABLE" }); }} className="button button-secondary h-8 text-xs text-accent-2 bg-background">Enable</button>
                        )}
                        {empStatus === "LEFT" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); initiateReactivate(emp); }} className="button button-secondary h-8 text-xs text-accent-2 bg-background">Re-activate</button>
                        )}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmAction({ emp, action: "DELETE" }); }} className="button button-secondary h-8 text-xs text-destructive hover:bg-destructive/10 bg-background">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Simple Confirmation Dialog (Disable/Enable/Left without loans) ─── */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
          <div className="card w-full max-w-[420px]">
            <h2 className="text-lg font-bold mb-2">
              {confirmAction.action === "LEFT" ? "Mark Employee as Left?" : confirmAction.action === "DISABLE" ? "Disable Employee?" : confirmAction.action === "ENABLE" ? "Re-activate Employee?" : "Delete Permanently?"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {confirmAction.action === "LEFT"
                ? `"${confirmAction.emp.full_name}" will be marked as Left. No outstanding loans or advances found.`
                : confirmAction.action === "DISABLE"
                  ? `"${confirmAction.emp.full_name}" will be temporarily disabled and hidden from attendance and payroll.`
                  : confirmAction.action === "DELETE"
                  ? `"${confirmAction.emp.full_name}" and ALL their records (attendance, payroll, loans, documents) will be permanently deleted. This action is irreversible.`
                  : `"${confirmAction.emp.full_name}" will be re-activated and visible across all pages again.`}
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" className="button button-secondary" onClick={() => setConfirmAction(null)} disabled={actionLoading}>Cancel</button>
              <button type="button" className={`button ${confirmAction.action === "ENABLE" ? "button-primary" : confirmAction.action === "DELETE" ? "button-primary bg-red-600 border-red-600 hover:bg-red-700" : "button-primary bg-red-600 border-red-600 hover:bg-red-700"}`} onClick={executeAction} disabled={actionLoading}>
                {actionLoading ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Write-Off Dialog (Mark Left with outstanding loans) ─── */}
      {writeOffData && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 overflow-y-auto py-10">
          <div className="card w-full max-w-[520px] my-auto">
            <h2 className="text-lg font-bold mb-2">Outstanding Loans & Advances</h2>
            <p className="text-sm text-muted-foreground mb-4">
              <strong>{writeOffData.emp.full_name}</strong> has the following active loans/advances that must be written off before marking them as Left.
            </p>

            <div className="space-y-2 mb-4">
              {writeOffData.loans.map((loan) => (
                <div key={loan.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border border-border">
                  <div>
                    <span className={`pill ${loan.type === "ADVANCE" ? "pill-warning" : "pill-secondary"} text-xs`}>{loan.type || "LOAN"}</span>
                    <span className="ml-2 text-sm">Principal: ₹{Number(loan.amount).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-red-600">₹{Number(loan.balance_amount).toLocaleString("en-IN")}</span>
                    <span className="text-xs text-muted-foreground ml-1">remaining</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-amber-900">Total Write-off Amount:</span>
                <span className="text-lg font-bold text-amber-900">₹{writeOffData.loans.reduce((sum, l) => sum + Number(l.balance_amount), 0).toLocaleString("en-IN")}</span>
              </div>
              <p className="text-xs text-amber-700 mt-1">This amount will be recorded as a write-off and can be recovered if the employee re-joins.</p>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" className="button button-secondary" onClick={() => setWriteOffData(null)} disabled={actionLoading}>Cancel</button>
              <button type="button" className="button button-primary bg-red-600 border-red-600 hover:bg-red-700" onClick={executeWriteOff} disabled={actionLoading}>
                {actionLoading ? "Processing..." : "Write Off & Mark Left"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Write-Back Dialog (Re-activate with previous write-offs) ─── */}
      {writeBackData && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 overflow-y-auto py-10">
          <div className="card w-full max-w-[520px] my-auto">
            <h2 className="text-lg font-bold mb-2">Previous Write-offs Found</h2>
            <p className="text-sm text-muted-foreground mb-4">
              <strong>{writeBackData.emp.full_name}</strong> had loans/advances written off when they left. Would you like to restore these as new active loans?
            </p>

            <div className="space-y-2 mb-4">
              {writeBackData.writeoffs.map((wo) => (
                <div key={wo.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg border border-border">
                  <div>
                    <span className={`pill ${wo.loans?.type === "ADVANCE" ? "pill-warning" : "pill-secondary"} text-xs`}>{wo.loans?.type || "LOAN"}</span>
                    <span className="ml-2 text-sm text-muted-foreground">Written off {new Date(wo.created_at).toLocaleDateString("en-IN")}</span>
                  </div>
                  <span className="font-bold">₹{Number(wo.amount).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-6">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-blue-900">Total to Restore:</span>
                <span className="text-lg font-bold text-blue-900">₹{writeBackData.writeoffs.reduce((sum, w) => sum + Number(w.amount), 0).toLocaleString("en-IN")}</span>
              </div>
              <p className="text-xs text-blue-700 mt-1">New active loans will be created for these amounts.</p>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" className="button button-secondary" onClick={() => setWriteBackData(null)} disabled={actionLoading}>Cancel</button>
              <button type="button" className="button button-secondary" onClick={skipWriteBackAndActivate} disabled={actionLoading}>
                {actionLoading ? "Processing..." : "Skip & Activate"}
              </button>
              <button type="button" className="button button-primary" onClick={executeWriteBack} disabled={actionLoading}>
                {actionLoading ? "Processing..." : "Restore & Activate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
