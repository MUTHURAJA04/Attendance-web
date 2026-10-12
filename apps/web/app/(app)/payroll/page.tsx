"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { callEdgeFunction } from "../../../lib/supabase/edge";
import { useTenant } from "../../../components/TenantContext";
import { useAuth } from "../../../components/AuthGate";
import { logAudit } from "../../../lib/audit";
import { PayslipModal } from "../../../components/PayslipModal";

import type { Payslip, PayrollPeriod } from "../../../lib/types";

export default function PayrollPage() {
    const { role } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);
    const [period, setPeriod] = useState<PayrollPeriod | null>(null);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const currentDate = new Date();
    const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

    // Modal State
    const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);

    const { selectedBranch: globalBranch, isLoading: tenantLoading } = useTenant();

    // Restricted Access for Manager and Branch Staff
    if (role && ["MANAGER", "BRANCH_STAFF", "EMPLOYEE"].includes(role)) {
        return (
            <div className="card max-w-lg mx-auto my-12 p-8 text-center space-y-3">
                <span className="text-4xl block">🔒</span>
                <h2 className="text-base font-bold text-foreground">Access Restricted</h2>
                <p className="text-xs text-muted-foreground">
                    Your role (<strong>{role}</strong>) is strictly restricted from viewing or managing Payroll and Salary data.
                </p>
                <div className="pt-2">
                    <Link href="/attendance" className="button button-primary text-xs">
                        ← Back to Attendance
                    </Link>
                </div>
            </div>
        );
    }

    async function loadPayrollData() {
        if (tenantLoading) return;
        setLoading(true);

        const { data: periodData } = await supabaseBrowser
            .from("payroll_periods")
            .select("*")
            .eq("month", selectedMonth)
            .eq("year", selectedYear)
            .single();

        setPeriod(periodData || null);

        if (periodData) {
            let slipsQuery = supabaseBrowser
                .from("payslips")
                .select("*, employees!inner(full_name, role, branch_id, branches(name))")
                .eq("period_id", periodData.id)
                .order("created_at", { ascending: false });

            if (globalBranch) {
                slipsQuery = slipsQuery.eq("employees.branch_id", globalBranch.id);
            }

            const { data: slipData } = await slipsQuery;
            setPayslips(slipData || []);
        } else {
            setPayslips([]);
        }

        setLoading(false);
    }

    useEffect(() => {
        loadPayrollData();
    }, [globalBranch, tenantLoading, selectedMonth, selectedYear]);

    const handleCreatePeriod = async () => {
        const { error } = await supabaseBrowser.from("payroll_periods").insert([
            { month: selectedMonth, year: selectedYear, status: "OPEN" },
        ]);
        if (error) {
            alert(error.message);
            return;
        }
        loadPayrollData();
    };

    interface PendingLeaveItem {
        id: string;
        empName: string;
        type: string;
        dateRange: string;
    }

    interface UnclosedCheckoutItem {
        id: string;
        empName: string;
        checkInFormatted: string;
        dateStr: string;
    }

    const [pendingActionBanner, setPendingActionBanner] = useState<{
        open: boolean;
        inlineText: string;
        hasLeaves: boolean;
        hasUnclosed: boolean;
    }>({ open: false, inlineText: "", hasLeaves: false, hasUnclosed: false });

    const [pendingActionModal, setPendingActionModal] = useState<{
        open: boolean;
        leaves: PendingLeaveItem[];
        unclosedCheckouts: UnclosedCheckoutItem[];
    }>({ open: false, leaves: [], unclosedCheckouts: [] });

    const toggleLock = async () => {
        if (!period) return;

        // If unlocking, allow simple confirmation
        if (period.status === "LOCKED") {
            if (!confirm("Unlock this period? This allows edits.")) return;
            const newStatus = "OPEN";
            await supabaseBrowser
                .from("payroll_periods")
                .update({ status: newStatus, locked_at: null })
                .eq("id", period.id);
            logAudit(`payroll_period_open`, { period_id: period.id, month: period.month, year: period.year });
            loadPayrollData();
            return;
        }

        // Lock Flow: Check for pending actions (pending leaves & unclosed checkouts) in this pay period
        const startStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const endStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        const startIso = `${startStr}T00:00:00+05:30`;
        const endIso = `${endStr}T23:59:59+05:30`;

        // 1. Query pending leave requests
        let leaveQuery = supabaseBrowser
            .from("leave_requests")
            .select("id, type, start_date, end_date, employees!inner(full_name, branch_id)")
            .eq("status", "PENDING")
            .lte("start_date", endStr)
            .gte("end_date", startStr);

        if (globalBranch) {
            leaveQuery = leaveQuery.eq("employees.branch_id", globalBranch.id);
        }

        // 2. Query un-closed checkouts (check_out IS NULL) in pay period
        let unclosedQuery = supabaseBrowser
            .from("attendance_logs")
            .select("id, check_in, check_out, employees!inner(full_name, branch_id)")
            .is("check_out", null)
            .gte("check_in", startIso)
            .lte("check_in", endIso);

        if (globalBranch) {
            unclosedQuery = unclosedQuery.eq("employees.branch_id", globalBranch.id);
        }

        const [leaveRes, unclosedRes] = await Promise.all([leaveQuery, unclosedQuery]);

        const pendingLeaves = leaveRes.data || [];
        const unclosedLogs = unclosedRes.data || [];

        if (pendingLeaves.length > 0 || unclosedLogs.length > 0) {
            // STOP EXECUTION — Automatically open notifications panel
            window.dispatchEvent(new CustomEvent("open-notifications"));

            const summaryParts: string[] = [];
            if (unclosedLogs.length > 0) summaryParts.push(`${unclosedLogs.length} un-closed checkout(s)`);
            if (pendingLeaves.length > 0) summaryParts.push(`${pendingLeaves.length} pending leave request(s)`);
            
            const inlineText = `${summaryParts.join(" and ")} awaiting approval in Notifications. Please review and resolve them before locking payroll.`;

            setPendingActionBanner({
                open: true,
                inlineText,
                hasLeaves: pendingLeaves.length > 0,
                hasUnclosed: unclosedLogs.length > 0,
            });

            return; // STOP LOCKING PROCESS
        }

        // PROCEED: No pending actions
        if (!confirm("Lock this period? This freezes all payslips.")) return;
        const newStatus = "LOCKED";
        await supabaseBrowser
            .from("payroll_periods")
            .update({ status: newStatus, locked_at: new Date().toISOString() })
            .eq("id", period.id);
        logAudit(`payroll_period_locked`, { period_id: period.id, month: period.month, year: period.year });
        loadPayrollData();
    };

    function formatCheckInTime(checkInIso: string) {
        if (!checkInIso) return "In: -- • Not Checked Out";
        try {
            const d = new Date(checkInIso);
            const timeFormatter = new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Kolkata",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
            });
            const dateFormatter = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Kolkata",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            });
            const timeStr = timeFormatter.format(d);
            const dateStr = dateFormatter.format(d);
            return `In: ${timeStr} (${dateStr}) • Not Checked Out`;
        } catch {
            return `In: ${checkInIso} • Not Checked Out`;
        }
    }

    function formatLeaveDates(startStr: string, endStr: string) {
        const s = new Date(startStr + "T00:00:00");
        const e = new Date(endStr + "T00:00:00");
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        const sDay = s.getDate();
        const sMonth = months[s.getMonth()];
        const sYear = s.getFullYear();
        
        const eDay = e.getDate();
        const eMonth = months[e.getMonth()];
        const eYear = e.getFullYear();

        if (startStr === endStr) {
            return `${sDay} ${sMonth} ${sYear}`;
        }
        if (sMonth === eMonth && sYear === eYear) {
            return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`;
        }
        if (sYear === eYear) {
            return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${sYear}`;
        }
        return `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`;
    }

    function printBrowserTraces(traces: any[]) {
        if (!traces || !Array.isArray(traces)) return;
        traces.forEach((trace: any) => {
            console.group(`=== 📅 PAYROLL EXECUTION: ${trace.empName} (${trace.empId}) ===`);
            console.log(`📋 [ATTENDANCE SUMMARY TABLE] Days Present, Half Days, Absent & Leave Breakdown for ${trace.empName}:`);
            console.table(trace.attendanceTable || trace.inputsTable);
            console.log(`👤 [ONBOARD] Employee Profile & Setup:`);
            console.table(trace.onboardTable);
            console.log(`💵 [ONBOARD] Salary Contract Structure:`);
            console.table(trace.salaryTable);
            console.log(`📈 [CALC:GROSS] Gross Pay & Earnings Breakdown:`);
            console.table(trace.grossTable);
            console.log(`📉 [CALC:DEDUCTIONS] Statutory Deductions & Loan Recoveries:`);
            console.table(trace.deductionsTable);
            console.log(`💰 [CALC:NET] Take-Home Salary Summary:`);
            console.table(trace.netTable);
            console.log(`🏦 [PAYOUT] Final Payslip Output Created:`, trace.payout);
            console.groupEnd();
        });
    }

    const computePayroll = async () => {
        if (!period) return;
        setIsProcessing(true);

        console.group("=== ⚙️ [PAYROLL COMPUTATION TRIGGERED] ===");
        console.log("[INPUTS] Selected Pay Period:", { month: selectedMonth, year: selectedYear, periodId: period.id });
        console.log("[INPUTS] Branch Scope:", globalBranch ? `${globalBranch.name} (${globalBranch.id})` : "ALL BRANCHES");
        console.groupEnd();

        try {
            const { data: sessionData } = await supabaseBrowser.auth.getSession();
            const token = sessionData.session?.access_token;

            const res = await fetch("/api/payroll/calculate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { "Authorization": `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    periodId: period.id,
                    branchId: globalBranch?.id || null,
                }),
            });

            const data = await res.json();
            if (data?.traces) {
                printBrowserTraces(data.traces);
            }

            if (!res.ok || data.error) {
                // Fallback to Edge function if API route encounters error
                const edgeResult = await callEdgeFunction<{ summary: { employeeCount: number; totalGross: number; totalDeductions: number; totalNet: number }; traces?: any[] }>(
                    supabaseBrowser,
                    "calculate-payroll",
                    {
                        method: "POST",
                        body: {
                            periodId: period.id,
                            branchId: globalBranch?.id || null,
                        },
                    }
                );
                if (edgeResult.data?.traces) {
                    printBrowserTraces(edgeResult.data.traces);
                }
                if (edgeResult.error) {
                    alert("Payroll computation failed: " + (data.error || edgeResult.error));
                }
            }
        } catch (err: any) {
            console.error("Payroll calculation error:", err);
            // Fallback to Edge Function
            const edgeResult = await callEdgeFunction<{ summary: { employeeCount: number; totalGross: number; totalDeductions: number; totalNet: number }; traces?: any[] }>(
                supabaseBrowser,
                "calculate-payroll",
                {
                    method: "POST",
                    body: {
                        periodId: period.id,
                        branchId: globalBranch?.id || null,
                    },
                }
            );
            if (edgeResult.data?.traces) {
                printBrowserTraces(edgeResult.data.traces);
            }
            if (edgeResult.error) {
                alert("Payroll computation error: " + (err?.message || edgeResult.error));
            }
        } finally {
            setIsProcessing(false);
            await loadPayrollData();
        }
    };

    const totals = payslips.reduce(
        (acc, slip) => ({
            gross: acc.gross + Number(slip.gross_pay),
            deductions:
                acc.deductions +
                Number(slip.pf_deduction) +
                Number(slip.esi_deduction) +
                Number(slip.pt_deduction) +
                Number(slip.tds_deduction) +
                Number(slip.loan_deduction),
            net: acc.net + Number(slip.net_pay),
        }),
        { gross: 0, deductions: 0, net: 0 }
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1>Payroll Management</h1>
                    <p>
                        Monthly salary computation and statutory compliance.
                    </p>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-border/50 shadow-sm">
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</label>
                        <select
                            className="input h-9 py-1 px-3 text-sm min-w-[120px]"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>
                                    {new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="w-px h-6 bg-border mx-1"></div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Year</label>
                        <select
                            className="input h-9 py-1 px-3 text-sm min-w-[100px]"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                        >
                            {[currentDate.getFullYear(), currentDate.getFullYear() - 1, currentDate.getFullYear() - 2].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Minimal Single-Line Horizontal Layout Banner for Pending Actions */}
            {pendingActionBanner.open && (
                <div className="mb-6 bg-destructive/10 border border-destructive/30 text-destructive text-xs py-2.5 px-4 rounded-xl flex items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        <span className="font-bold text-destructive shrink-0 flex items-center gap-1">
                            🛑 Action Needed — Payroll Cannot Be Locked:
                        </span>
                        <span className="text-foreground font-medium truncate">
                            {pendingActionBanner.inlineText}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent("open-notifications"))}
                            className="button button-primary text-[0.7rem] h-7 py-0 px-2.5 bg-destructive hover:bg-destructive/90 text-white font-semibold shrink-0 cursor-pointer"
                        >
                            🔔 Open Notifications →
                        </button>
                        <button
                            onClick={() => setPendingActionBanner({ open: false, inlineText: "", hasLeaves: false, hasUnclosed: false })}
                            className="text-muted-foreground hover:text-foreground text-sm font-bold px-1.5 py-0.5 rounded hover:bg-muted/50 cursor-pointer"
                            title="Dismiss"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-2">
                    {!period ? (
                        <button className="button button-primary" onClick={handleCreatePeriod}>
                            + Initialize {new Date(2000, selectedMonth - 1, 1).toLocaleString('default', { month: 'long' })} Payroll
                        </button>
                    ) : (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${period.status === "LOCKED" ? "bg-accent-2/10 text-accent-2" : "bg-primary/10 text-primary"}`}>
                            ● {period.status}
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    {period && (
                        <>
                            <Link href={`/payroll/print/${period.id}`} className="button button-secondary text-sm h-9 flex items-center gap-2">
                                🖨️ Print Slips (A5)
                            </Link>
                            <button className="button button-secondary text-sm h-9">⬇ Bank Sheet</button>
                            <button
                                className={`button h-9 text-sm ${period.status === "LOCKED" ? "button-secondary" : "button-primary"}`}
                                onClick={toggleLock}
                            >
                                {period.status === "LOCKED" ? "🔓 Unlock Period" : "🔒 Lock & Finalize"}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="stats-grid">
                <div className="card stat-card">
                    <span className="stat-label">Total Monthly Liability</span>
                    <span className="stat-value">₹{totals.gross.toLocaleString("en-IN")}</span>
                    <span className="stat-description">Gross pay for onboarded staff</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Total Deductions</span>
                    <span className="stat-value">₹{totals.deductions.toLocaleString("en-IN")}</span>
                    <span className="stat-description">PF + ESI + PT + TDS + Loans</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Net Payout</span>
                    <span className="stat-value">₹{totals.net.toLocaleString("en-IN")}</span>
                    <span className="stat-description">Bank transfer total</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Period Status</span>
                    <span className={`stat-value ${period?.status === "LOCKED" ? "text-accent-2" : "text-primary"}`}>
                        {loading ? "..." : period?.status || "No Period"}
                    </span>
                    <span className="stat-description">{payslips.length} payslips generated</span>
                </div>
            </div>

            <div className="card">
                <div className="flex justify-between items-center mb-8">
                    <h2>Payroll Register</h2>
                    <button
                        className="button button-primary"
                        disabled={isProcessing || !period || period.status === "LOCKED"}
                        onClick={computePayroll}
                    >
                        {isProcessing ? "Computing Salaries..." : "⚡ Compute Gross/Net Pay"}
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="role-table">
                        <thead>
                            <tr>
                                <th>Employee</th>
                                <th>Basic</th>
                                <th>Incentives</th>
                                <th>Gross Pay</th>
                                <th>PF/ESI</th>
                                <th>PT</th>
                                <th>Loans</th>
                                <th>Net Salary</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payslips.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="text-center p-8 text-muted-foreground">
                                        {period ? 'Click "Compute Gross/Net Pay" to generate payslips.' : "Create a payroll period to begin."}
                                    </td>
                                </tr>
                            ) : (
                                payslips.map((slip) => (
                                    <tr key={slip.id}>
                                        <td>
                                            <strong>{slip.employees?.full_name}</strong>
                                            <div className="text-muted-foreground text-[0.7rem]">
                                                {slip.employees?.role} • {slip.employees?.branches?.name}
                                            </div>
                                        </td>
                                        <td>₹{Number(slip.basic_pay).toLocaleString("en-IN")}</td>
                                        <td>
                                            {Number(slip.incentives || 0) > 0 ? (
                                                <span className="text-primary font-semibold">
                                                    +₹{Number(slip.incentives).toLocaleString("en-IN")}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">₹0</span>
                                            )}
                                        </td>
                                        <td>₹{Number(slip.gross_pay).toLocaleString("en-IN")}</td>
                                        <td>₹{(Number(slip.pf_deduction) + Number(slip.esi_deduction)).toLocaleString("en-IN")}</td>
                                        <td>₹{Number(slip.pt_deduction).toLocaleString("en-IN")}</td>
                                        <td>₹{Number(slip.loan_deduction).toLocaleString("en-IN")}</td>
                                        <td>
                                            <strong>₹{Number(slip.net_pay).toLocaleString("en-IN")}</strong>
                                        </td>
                                        <td>
                                            <button
                                                className="button button-secondary h-7 text-xs"
                                                onClick={() => setSelectedSlip(slip)}
                                            >
                                                📄 View Slip
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card">
                    <h3>Compliance Status</h3>
                    <div className="mt-4 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Provident Fund (PF)</span>
                            <span className="text-accent-2 font-semibold">
                                ₹{payslips.reduce((s, p) => s + Number(p.pf_deduction), 0).toLocaleString("en-IN")}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">ESIC Returns</span>
                            <span className="text-accent-2 font-semibold">
                                ₹{payslips.reduce((s, p) => s + Number(p.esi_deduction), 0).toLocaleString("en-IN")}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Professional Tax</span>
                            <span className="text-accent-2 font-semibold">
                                ₹{payslips.reduce((s, p) => s + Number(p.pt_deduction), 0).toLocaleString("en-IN")}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="card">
                    <h3>Loan Repayments This Cycle</h3>
                    <p className="text-muted-foreground mt-2 text-[0.9rem]">
                        Total loan EMI deducted: ₹{payslips.reduce((s, p) => s + Number(p.loan_deduction), 0).toLocaleString("en-IN")}
                    </p>
                    <Link href="/loans" className="button button-secondary mt-4 w-full">
                        View Loan Ledger
                    </Link>
                </div>
            </div>

            <PayslipModal
                isOpen={!!selectedSlip}
                onClose={() => setSelectedSlip(null)}
                payslip={selectedSlip}
                period={period}
            />

            {/* Pending Action STOP Modal */}
            {pendingActionModal.open && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card border border-destructive/40 rounded-xl p-6 max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center gap-3 text-destructive">
                            <span className="text-3xl">🛑</span>
                            <div>
                                <h2 className="text-base font-bold text-foreground">Action Needed — Payroll Cannot Be Locked</h2>
                                <p className="text-xs text-muted-foreground">Pending actions must be resolved before finalizing payroll.</p>
                            </div>
                        </div>

                        {/* Unclosed Attendance Checkouts Section */}
                        {pendingActionModal.unclosedCheckouts.length > 0 && (
                            <div className="space-y-2">
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-800 font-medium">
                                    <strong className="block font-bold text-amber-900">⚠️ Un-closed Checkouts Found ({pendingActionModal.unclosedCheckouts.length})</strong>
                                    <p className="text-[0.75rem] text-amber-800 mt-0.5">
                                        The following employee(s) have check-in logs without a recorded check-out in this pay period:
                                    </p>
                                </div>
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                                            <tr>
                                                <th className="p-2 text-left font-semibold">Employee</th>
                                                <th className="p-2 text-left font-semibold">Shift In & Status</th>
                                                <th className="p-2 text-center font-semibold">Action Needed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {pendingActionModal.unclosedCheckouts.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-muted/20">
                                                    <td className="p-2 font-semibold text-foreground">{item.empName}</td>
                                                    <td className="p-2 font-mono text-[0.75rem] text-destructive">
                                                        {item.checkInFormatted}
                                                    </td>
                                                    <td className="p-2 text-center">
                                                        <span className="text-amber-800 font-bold text-[0.6875rem] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                            ✓ Approve (11 PM) / ✏️ Modify
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Pending Leave Requests Section */}
                        {pendingActionModal.leaves.length > 0 && (
                            <div className="space-y-2">
                                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive">
                                    <strong className="block font-bold">📋 Pending Leave Requests ({pendingActionModal.leaves.length})</strong>
                                    <p className="text-[0.75rem] text-muted-foreground mt-0.5">
                                        The following leave request(s) are awaiting approval or rejection:
                                    </p>
                                </div>
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                                            <tr>
                                                <th className="p-2 text-left font-semibold">Employee</th>
                                                <th className="p-2 text-left font-semibold">Leave Type</th>
                                                <th className="p-2 text-left font-semibold">Dates</th>
                                                <th className="p-2 text-center font-semibold">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {pendingActionModal.leaves.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-muted/20">
                                                    <td className="p-2 font-semibold text-foreground">{item.empName}</td>
                                                    <td className="p-2">
                                                        <span className="px-1.5 py-0.5 rounded bg-muted text-[0.7rem] font-semibold border border-border">
                                                            {item.type}
                                                        </span>
                                                    </td>
                                                    <td className="p-2 text-muted-foreground whitespace-nowrap">{item.dateRange}</td>
                                                    <td className="p-2 text-center">
                                                        <span className="text-amber-800 font-bold text-[0.7rem] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                            Pending (✓ / ✗)
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-border/50">
                            <button
                                className="button button-secondary text-xs h-9"
                                onClick={() => setPendingActionModal({ open: false, leaves: [], unclosedCheckouts: [] })}
                            >
                                Close
                            </button>
                            <div className="flex gap-2">
                                {pendingActionModal.unclosedCheckouts.length > 0 && (
                                    <Link
                                        href="/attendance"
                                        className="button button-secondary text-xs h-9 flex items-center gap-1 font-semibold"
                                        onClick={() => setPendingActionModal({ open: false, leaves: [], unclosedCheckouts: [] })}
                                    >
                                        ⏰ Go to Attendance Tracking →
                                    </Link>
                                )}
                                {pendingActionModal.leaves.length > 0 && (
                                    <Link
                                        href="/leaves"
                                        className="button button-primary text-xs h-9 flex items-center gap-1 bg-destructive hover:bg-destructive/90 text-white font-semibold"
                                        onClick={() => setPendingActionModal({ open: false, leaves: [], unclosedCheckouts: [] })}
                                    >
                                        📋 Go to Leave Approvals →
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
