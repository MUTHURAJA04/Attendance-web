"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { callEdgeFunction } from "../../../lib/supabase/edge";
import { useTenant } from "../../../components/TenantContext";
import { logAudit } from "../../../lib/audit";
import { PayslipModal } from "../../../components/PayslipModal";

import type { Payslip, PayrollPeriod } from "../../../lib/types";

export default function PayrollPage() {
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

    const toggleLock = async () => {
        if (!period) return;
        if (!confirm(period.status === "LOCKED" ? "Unlock this period? This allows edits." : "Lock this period? This freezes all payslips.")) return;
        const newStatus = period.status === "LOCKED" ? "OPEN" : "LOCKED";
        await supabaseBrowser
            .from("payroll_periods")
            .update({ status: newStatus, locked_at: newStatus === "LOCKED" ? new Date().toISOString() : null })
            .eq("id", period.id);
        logAudit(`payroll_period_${newStatus.toLowerCase()}`, { period_id: period.id, month: period.month, year: period.year });
        loadPayrollData();
    };

    const computePayroll = async () => {
        if (!period) return;
        setIsProcessing(true);

        const result = await callEdgeFunction<{ summary: { employeeCount: number; totalGross: number; totalDeductions: number; totalNet: number } }>(
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

        if (result.error) {
            alert("Payroll computation failed: " + result.error);
        }

        setIsProcessing(false);
        loadPayrollData();
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
                                    <td colSpan={8} className="text-center p-8 text-muted-foreground">
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
        </div>
    );
}
