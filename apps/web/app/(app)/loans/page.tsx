"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import { useAuth } from "../../../components/AuthGate";
import type { Loan, Employee, RepaymentEntry, LoanType, LoanStatus } from "../../../lib/types";

export default function LoansPage() {
    const { role } = useAuth();
    const [employees, setEmployees] = useState<Pick<Employee, "id" | "full_name">[]>([]);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewLoan, setViewLoan] = useState<Loan | null>(null);
    const [statusFilter, setStatusFilter] = useState<LoanStatus | "ALL">("ACTIVE");
    const [payslips, setPayslips] = useState<{ period_id: string; employee_id: string; loan_deduction: number }[]>([]);
    const [periods, setPeriods] = useState<{ id: string; month: number; year: number }[]>([]);

    const [formData, setFormData] = useState({
        employee_id: "",
        type: "LOAN" as LoanType,
        amount: "",
        monthly_emi: "",
        tenure_months: "6",
        disbursement_date: new Date().toISOString().split("T")[0],
        start_month: new Date().getMonth() + 1,
        start_year: new Date().getFullYear(),
        deduction_month: new Date().getMonth() + 1,
        deduction_year: new Date().getFullYear(),
        repayment_type: "EMI" as "EMI" | "SCHEDULE",
    });

    const [schedule, setSchedule] = useState<RepaymentEntry[]>([]);

    const { selectedBranch: globalBranch, isLoading: tenantLoading } = useTenant();

    if (role && ["MANAGER", "BRANCH_STAFF", "EMPLOYEE"].includes(role)) {
        return (
            <div className="card max-w-lg mx-auto my-12 p-8 text-center space-y-3">
                <span className="text-4xl block">🔒</span>
                <h2 className="text-base font-bold text-foreground">Access Restricted</h2>
                <p className="text-xs text-muted-foreground">
                    Your role (<strong>{role}</strong>) does not have permission to view Loans & Advances.
                </p>
                <div className="pt-2">
                    <Link href="/attendance" className="button button-primary text-xs">
                        ← Back to Attendance
                    </Link>
                </div>
            </div>
        );
    }

    async function loadData() {
        if (tenantLoading) return;
        setLoading(true);

        let empQuery = supabaseBrowser.from("employees").select("id, full_name, branch_id").eq("status", "ACTIVE");
        let loanQuery = supabaseBrowser.from("loans").select("*, employees!inner(full_name, branch_id)").order("created_at", { ascending: false });

        if (globalBranch) {
            empQuery = empQuery.eq("branch_id", globalBranch.id);
            loanQuery = loanQuery.eq("employees.branch_id", globalBranch.id);
        }

        const [emps, loansData, periodsData, payslipsData] = await Promise.all([
            empQuery,
            loanQuery,
            supabaseBrowser.from("payroll_periods").select("id, month, year").eq("status", "LOCKED"),
            supabaseBrowser.from("payslips").select("employee_id, loan_deduction, payroll_periods!inner(month, year, status)").eq("payroll_periods.status", "LOCKED"),
        ]);
        setEmployees((emps.data as Pick<Employee, "id" | "full_name">[]) || []);
        setLoans((loansData.data as Loan[]) || []);
        setPeriods((periodsData.data || []) as { id: string; month: number; year: number }[]);
        setPayslips((payslipsData.data || []) as any[]);
        setLoading(false);
    }

    useEffect(() => { loadData(); }, [globalBranch, tenantLoading]);

    // Generate default schedule when inputs change (only if in EMI/Auto mode)
    useEffect(() => {
        if (formData.type === "LOAN" && formData.repayment_type === "EMI" && formData.amount && formData.monthly_emi) {
            const amount = Number(formData.amount);
            const emi = Number(formData.monthly_emi);
            if (emi <= 0 || emi >= amount) return;
            const calculatedTenure = Math.ceil(amount / emi);
            let startM = Number(formData.start_month);
            let startY = Number(formData.start_year);
            const newSchedule: RepaymentEntry[] = [];
            let remaining = amount;
            for (let i = 0; i < calculatedTenure; i++) {
                const deduction = Math.min(remaining, emi);
                newSchedule.push({ month: startM, year: startY, amount: deduction });
                remaining -= deduction;
                if (remaining <= 0) break;
                startM++;
                if (startM > 12) { startM = 1; startY++; }
            }
            setSchedule(newSchedule);
            setFormData(prev => ({ ...prev, tenure_months: String(newSchedule.length) }));
        } else if (formData.type === "ADVANCE" && formData.amount) {
            setSchedule([{ month: Number(formData.deduction_month), year: Number(formData.deduction_year), amount: Number(formData.amount) }]);
        }
    }, [formData.type, formData.repayment_type, formData.amount, formData.monthly_emi, formData.start_month, formData.start_year, formData.deduction_month, formData.deduction_year]);

    const handleScheduleChange = (index: number, field: keyof RepaymentEntry, value: number) => {
        const newSchedule = [...schedule];
        newSchedule[index] = { ...newSchedule[index], [field]: value };
        setSchedule(newSchedule);
    };

    const addScheduleRow = () => {
        const last = schedule[schedule.length - 1] || { month: new Date().getMonth(), year: new Date().getFullYear(), amount: 0 };
        let nextM = last.month + 1;
        let nextY = last.year;
        if (nextM > 12) { nextM = 1; nextY++; }
        setSchedule([...schedule, { month: nextM, year: nextY, amount: 0 }]);
    };

    const removeScheduleRow = (index: number) => {
        setSchedule(schedule.filter((_, i) => i !== index));
    };

    const totalScheduled = schedule.reduce((sum, s) => sum + s.amount, 0);
    const amountNum = Number(formData.amount) || 0;
    const difference = amountNum - totalScheduled;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.employee_id || !formData.amount) { alert("Please fill required fields."); return; }
        if (formData.type === "LOAN") {
            if (formData.repayment_type === "EMI" && Number(formData.monthly_emi) >= Number(formData.amount)) { alert("Monthly EMI must be less than Total Amount."); return; }
            if (Math.abs(difference) > 0.01) { alert(`Schedule total (₹${totalScheduled.toLocaleString("en-IN")}) must equal total amount (₹${amountNum.toLocaleString("en-IN")}).`); return; }
        }
        const payload: Record<string, unknown> = {
            employee_id: formData.employee_id, type: formData.type, amount: Number(formData.amount),
            disbursement_date: formData.disbursement_date, balance_amount: Number(formData.amount),
            status: "ACTIVE", repayment_schedule: schedule,
        };
        if (formData.type === "LOAN") {
            payload.tenure_months = schedule.length;
            payload.monthly_emi = formData.repayment_type === "EMI" ? Number(formData.monthly_emi) : Math.round(Number(formData.amount) / schedule.length);
            payload.start_month = schedule[0]?.month; payload.start_year = schedule[0]?.year;
        } else {
            payload.deduction_month = Number(formData.deduction_month); payload.deduction_year = Number(formData.deduction_year);
            payload.tenure_months = 1; payload.monthly_emi = Number(formData.amount);
        }
        const { error } = await supabaseBrowser.from("loans").insert([payload]);
        if (!error) { setIsModalOpen(false); resetForm(); loadData(); } else { alert("Insert failed: " + error.message); }
    };

    const resetForm = () => {
        setFormData({
            employee_id: "", type: "LOAN", amount: "", monthly_emi: "", tenure_months: "6",
            disbursement_date: new Date().toISOString().split("T")[0],
            start_month: new Date().getMonth() + 1, start_year: new Date().getFullYear(),
            deduction_month: new Date().getMonth() + 1, deduction_year: new Date().getFullYear(),
            repayment_type: "EMI",
        });
        setSchedule([]);
    };

    const getEffectiveBalance = (loan: Loan): number => {
        if (loan.status === "CLOSED" || loan.status === "WRITTEN_OFF") return 0;
        const totalDeducted = payslips
            .filter((p: any) => p.employee_id === loan.employee_id)
            .reduce((sum: number, p: any) => sum + Number(p.loan_deduction || 0), 0);
        return Math.max(0, Number(loan.amount) - totalDeducted);
    };

    const activeLoans = loans.filter((l) => l.status === "ACTIVE");
    const filteredLoans = statusFilter === "ALL" ? loans : loans.filter(l => (l.status || "ACTIVE") === statusFilter);

    const counts = {
        ALL: loans.length,
        ACTIVE: loans.filter(l => (l.status || "ACTIVE") === "ACTIVE").length,
        CLOSED: loans.filter(l => l.status === "CLOSED").length,
        WRITTEN_OFF: loans.filter(l => l.status === "WRITTEN_OFF").length,
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const years = [currentYear, currentYear + 1, currentYear + 2];

    // Determine installment status accurately per employee payslip record
    const getInstallmentStatus = (loan: Loan | null, entry: RepaymentEntry): "DEDUCTED" | "UPCOMING" | "OVERDUE" => {
        if (loan?.status === "CLOSED") return "DEDUCTED";
        if (loan?.employee_id) {
            const hasDeduction = payslips.some((p: any) =>
                p.employee_id === loan.employee_id &&
                p.payroll_periods?.month === entry.month &&
                p.payroll_periods?.year === entry.year &&
                Number(p.loan_deduction) > 0
            );
            if (hasDeduction) return "DEDUCTED";
        }
        const entryDate = entry.year * 12 + entry.month;
        const currentDate = currentYear * 12 + currentMonth;
        if (entryDate < currentDate) return "OVERDUE";
        return "UPCOMING";
    };

    const statusIcon = (status: string) => {
        if (status === "DEDUCTED") return "✅";
        if (status === "OVERDUE") return "⚠️";
        return "⏳";
    };

    const statusLabel = (status: string) => {
        if (status === "DEDUCTED") return "Deducted";
        if (status === "OVERDUE") return "Overdue";
        return "Upcoming";
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Loans & Advances</h1>
                    <p className="text-muted-foreground">Track employee loans, salary advances, and recovery schedules.</p>
                </div>
                <button className="button button-primary" onClick={() => setIsModalOpen(true)}>+ New Disbursal</button>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6 w-fit">
                {(["ACTIVE", "CLOSED", "WRITTEN_OFF", "ALL"] as const).map((s) => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-4 py-1.5 text-sm rounded-md transition-all ${statusFilter === s ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        {s === "ALL" ? "All" : s === "WRITTEN_OFF" ? "Written Off" : s.charAt(0) + s.slice(1).toLowerCase()}
                        <span className="ml-1.5 text-xs text-muted-foreground">({counts[s]})</span>
                    </button>
                ))}
            </div>

            <div className="stats-grid mb-8">
                <div className="card stat-card">
                    <span className="stat-label">Total Disbursed</span>
                    <span className="stat-value">₹{loans.reduce((a, l) => a + Number(l.amount), 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Outstanding Balance</span>
                    <span className="stat-value">₹{activeLoans.reduce((a, l) => a + getEffectiveBalance(l), 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Total Ledgers</span>
                    <span className="stat-value">{loans.length}</span>
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <table className="role-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Type</th>
                            <th>Principal</th>
                            <th>Disbursed On</th>
                            <th>Target Info</th>
                            <th>Remaining</th>
                            <th>Status</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="text-center align-middle h-32 text-muted-foreground">
                                    Loading ledgers...
                                </td>
                            </tr>
                        ) : filteredLoans.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center align-middle h-32 text-muted-foreground">
                                    No {statusFilter === "ALL" ? "" : statusFilter.toLowerCase()} records found.
                                </td>
                            </tr>
                        ) : (
                            filteredLoans.map((loan) => (
                                <tr key={loan.id} className={loan.status === "WRITTEN_OFF" ? "opacity-50" : ""}>
                                    <td><strong>{loan.employees?.full_name}</strong></td>
                                    <td><span className={`pill ${loan.type === "ADVANCE" ? "pill-warning" : "pill-secondary"}`}>{loan.type || "LOAN"}</span></td>
                                    <td>₹{Number(loan.amount).toLocaleString("en-IN")}</td>
                                    <td>{loan.disbursement_date ? new Date(loan.disbursement_date).toLocaleDateString("en-IN") : "—"}</td>
                                    <td>
                                        {loan.type === "ADVANCE" ? (
                                            <span className="text-xs">Deduct: {months[(loan.deduction_month || 1) - 1]} &apos;{String(loan.deduction_year || currentYear).slice(-2)}</span>
                                        ) : (
                                            <span className="text-xs">
                                                EMI: ₹{Number(loan.monthly_emi || 0).toLocaleString("en-IN")}
                                                <br />Starts: {months[(loan.start_month || 1) - 1]} &apos;{String(loan.start_year || currentYear).slice(-2)}
                                            </span>
                                        )}
                                    </td>
                                    <td>₹{getEffectiveBalance(loan).toLocaleString("en-IN")}</td>
                                    <td>
                                        <span className={`pill ${loan.status === "ACTIVE" ? "pill-warning" : loan.status === "WRITTEN_OFF" ? "pill-destructive" : "pill-success"}`}>
                                            {loan.status}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <button className="button button-secondary h-7 text-xs" onClick={() => setViewLoan(loan)}>View</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* ─── New Disbursal Modal ─── */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 overflow-y-auto py-10">
                    <div className="card w-full max-w-[700px] my-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">New Disbursal</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
                        </div>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="label">Employee</label>
                                    <select className="input" required value={formData.employee_id} onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}>
                                        <option value="">Select Employee</option>
                                        {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="label">Disbursal Type</label>
                                    <div className="flex p-1 bg-muted rounded-md gap-1">
                                        <button type="button" className={`flex-1 text-sm py-1.5 rounded-sm transition-all ${formData.type === 'LOAN' ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`} onClick={() => setFormData({ ...formData, type: 'LOAN' })}>Loan</button>
                                        <button type="button" className={`flex-1 text-sm py-1.5 rounded-sm transition-all ${formData.type === 'ADVANCE' ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`} onClick={() => setFormData({ ...formData, type: 'ADVANCE' })}>Advance</button>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label className="label">Total Amount (₹)</label>
                                    <input className="input" type="number" min="1" required value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="label">Disbursement Date</label>
                                    <input className="input" type="date" required value={formData.disbursement_date} onChange={(e) => setFormData({ ...formData, disbursement_date: e.target.value })} />
                                </div>
                            </div>

                            {formData.type === "LOAN" ? (
                                <>
                                    <div className="border-t border-border pt-4">
                                        <div className="flex justify-between items-end mb-4">
                                            <div className="form-group flex-1 max-w-[200px]">
                                                <label className="label">Repayment Mode</label>
                                                <div className="flex p-1 bg-muted rounded-md gap-1">
                                                    <button type="button" className={`flex-1 text-xs py-1 rounded-sm transition-all ${formData.repayment_type === 'EMI' ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`} onClick={() => setFormData({ ...formData, repayment_type: 'EMI' })}>Auto Split</button>
                                                    <button type="button" className={`flex-1 text-xs py-1 rounded-sm transition-all ${formData.repayment_type === 'SCHEDULE' ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`} onClick={() => setFormData({ ...formData, repayment_type: 'SCHEDULE' })}>Manual</button>
                                                </div>
                                            </div>
                                            {formData.repayment_type === 'EMI' && (
                                                <div className="form-group flex-1 ml-4">
                                                    <label className="label">Monthly EMI (₹)</label>
                                                    <input className="input" type="number" min="1" required value={formData.monthly_emi} onChange={(e) => setFormData({ ...formData, monthly_emi: e.target.value })} />
                                                    {formData.monthly_emi && Number(formData.monthly_emi) >= amountNum && amountNum > 0 && (
                                                        <span className="text-xs text-destructive mt-1">EMI must be less than total amount</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div className="form-group"><label className="label text-xs">First Installment Month</label>
                                                <select className="input" value={formData.start_month} onChange={(e) => setFormData({ ...formData, start_month: Number(e.target.value) })}>{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                                            </div>
                                            <div className="form-group"><label className="label text-xs">First Installment Year</label>
                                                <select className="input" value={formData.start_year} onChange={(e) => setFormData({ ...formData, start_year: Number(e.target.value) })}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-muted/50 p-4 rounded-lg border border-border">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="text-sm font-bold">Repayment Schedule</h4>
                                            {formData.repayment_type === 'SCHEDULE' ? (
                                                <button type="button" onClick={addScheduleRow} className="text-xs text-primary font-semibold hover:underline">+ Add Installment</button>
                                            ) : (
                                                <span className="text-[0.7rem] text-muted-foreground uppercase tracking-wider font-bold">Auto-Generated</span>
                                            )}
                                        </div>
                                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2">
                                            {schedule.map((s, idx) => (
                                                <div key={idx} className="flex gap-2 items-center bg-background p-2 rounded border border-border/50">
                                                    <span className="text-xs font-mono text-muted-foreground w-6">#{idx + 1}</span>
                                                    <select className="input h-8 text-xs py-0 flex-1" value={s.month} onChange={(e) => handleScheduleChange(idx, 'month', Number(e.target.value))} disabled={formData.repayment_type === 'EMI'}>{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                                                    <select className="input h-8 text-xs py-0 w-20" value={s.year} onChange={(e) => handleScheduleChange(idx, 'year', Number(e.target.value))} disabled={formData.repayment_type === 'EMI'}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                                                    <input className="input h-8 text-xs py-0 w-28 text-right font-bold" type="number" value={s.amount} onChange={(e) => handleScheduleChange(idx, 'amount', Number(e.target.value))} />
                                                    {formData.repayment_type === 'SCHEDULE' && (
                                                        <button type="button" onClick={() => removeScheduleRow(idx)} className="text-red-500 p-1 hover:bg-red-50 rounded">✕</button>
                                                    )}
                                                </div>
                                            ))}
                                            {schedule.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{formData.repayment_type === 'EMI' ? 'Enter amount and EMI to generate schedule' : 'Click "+ Add Installment" to build your schedule'}</p>}
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-border flex justify-between items-center font-bold">
                                            <span className="text-sm">Total Scheduled:</span>
                                            <div className="text-right">
                                                <div className={`text-lg ${Math.abs(difference) < 0.01 ? 'text-green-600' : 'text-red-500'}`}>₹{totalScheduled.toLocaleString("en-IN")}</div>
                                                {Math.abs(difference) > 0.01 && amountNum > 0 && (
                                                    <div className="text-[0.7rem] font-normal text-red-400">{difference > 0 ? `Remaining: ₹${difference.toLocaleString("en-IN")}` : `Over by: ₹${Math.abs(difference).toLocaleString("en-IN")}`}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="border-t border-border pt-4">
                                    <h4 className="text-sm font-bold mb-4">Recovery Target</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="form-group"><label className="label">Deduction Month</label>
                                            <select className="input" value={formData.deduction_month} onChange={(e) => setFormData({ ...formData, deduction_month: Number(e.target.value) })}>{months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                                        </div>
                                        <div className="form-group"><label className="label">Deduction Year</label>
                                            <select className="input" value={formData.deduction_year} onChange={(e) => setFormData({ ...formData, deduction_year: Number(e.target.value) })}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                                        </div>
                                    </div>
                                    <div className="mt-6 p-4 bg-primary/5 rounded border border-primary/20 text-center">
                                        <span className="text-sm text-primary font-semibold">₹{amountNum.toLocaleString("en-IN")} will be deducted from {months[Number(formData.deduction_month) - 1]} {formData.deduction_year} salary.</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 border-t border-border pt-6 mt-2">
                                <button type="button" className="button button-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="button button-primary px-8" disabled={formData.type === 'LOAN' && Math.abs(difference) > 0.01}>Confirm Disbursal</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── View Loan Detail Modal (Read-Only with Deduction Status) ─── */}
            {viewLoan && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 overflow-y-auto py-10">
                    <div className="card w-full max-w-[600px] my-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">{viewLoan.type === "ADVANCE" ? "Advance" : "Loan"} Details</h2>
                            <button onClick={() => setViewLoan(null)} className="text-muted-foreground hover:text-foreground text-xl">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Employee</span>
                                    <p className="font-semibold">{viewLoan.employees?.full_name}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Type</span>
                                    <p><span className={`pill ${viewLoan.type === "ADVANCE" ? "pill-warning" : "pill-secondary"}`}>{viewLoan.type || "LOAN"}</span></p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Principal</span>
                                    <p className="font-semibold text-lg">₹{Number(viewLoan.amount).toLocaleString("en-IN")}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Balance</span>
                                    <p className="font-semibold text-lg">₹{getEffectiveBalance(viewLoan).toLocaleString("en-IN")}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                                    <p><span className={`pill ${viewLoan.status === "ACTIVE" ? "pill-warning" : viewLoan.status === "WRITTEN_OFF" ? "pill-destructive" : "pill-success"}`}>{viewLoan.status}</span></p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Disbursement Date</span>
                                    <p>{viewLoan.disbursement_date ? new Date(viewLoan.disbursement_date).toLocaleDateString("en-IN") : "—"}</p>
                                </div>
                                {viewLoan.type === "LOAN" && (
                                    <div>
                                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Monthly EMI</span>
                                        <p className="font-semibold">₹{Number(viewLoan.monthly_emi || 0).toLocaleString("en-IN")}</p>
                                    </div>
                                )}
                            </div>

                            {viewLoan.type === "ADVANCE" ? (
                                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                                    <h4 className="text-sm font-bold mb-3">Deduction Schedule</h4>
                                    <div className="flex justify-between items-center bg-background p-3 rounded border border-border/50">
                                        <div className="flex items-center gap-2">
                                            <span>{statusIcon(getInstallmentStatus(viewLoan, { month: viewLoan.deduction_month || 1, year: viewLoan.deduction_year || currentYear, amount: Number(viewLoan.amount) }))}</span>
                                            <span className="font-medium">{months[(viewLoan.deduction_month || 1) - 1]} {viewLoan.deduction_year}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold">₹{Number(viewLoan.amount).toLocaleString("en-IN")}</span>
                                            <span className={`ml-2 text-xs ${getInstallmentStatus(viewLoan, { month: viewLoan.deduction_month || 1, year: viewLoan.deduction_year || currentYear, amount: Number(viewLoan.amount) }) === "DEDUCTED" ? "text-green-600" : "text-amber-600"}`}>
                                                {statusLabel(getInstallmentStatus(viewLoan, { month: viewLoan.deduction_month || 1, year: viewLoan.deduction_year || currentYear, amount: Number(viewLoan.amount) }))}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : viewLoan.repayment_schedule && (viewLoan.repayment_schedule as RepaymentEntry[]).length > 0 ? (
                                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                                    <h4 className="text-sm font-bold mb-3">Deduction Schedule</h4>
                                    <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                                        {(viewLoan.repayment_schedule as RepaymentEntry[]).map((s, idx) => {
                                            const st = getInstallmentStatus(viewLoan, s);
                                            return (
                                                <div key={idx} className={`flex justify-between items-center p-2.5 rounded border text-sm ${st === "DEDUCTED" ? "bg-green-50 border-green-200" : st === "OVERDUE" ? "bg-amber-50 border-amber-200" : "bg-background border-border/50"}`}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{statusIcon(st)}</span>
                                                        <span className="text-muted-foreground font-mono text-xs">#{idx + 1}</span>
                                                        <span className="font-medium">{months[s.month - 1]} {s.year}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-bold">₹{s.amount.toLocaleString("en-IN")}</span>
                                                        <span className={`text-xs w-16 text-right ${st === "DEDUCTED" ? "text-green-600" : st === "OVERDUE" ? "text-amber-600" : "text-muted-foreground"}`}>
                                                            {statusLabel(st)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-border grid grid-cols-3 gap-2 text-center text-xs">
                                        <div><span className="font-bold text-green-600">{(viewLoan.repayment_schedule as RepaymentEntry[]).filter(s => getInstallmentStatus(viewLoan, s) === "DEDUCTED").length}</span> <span className="text-muted-foreground">Deducted</span></div>
                                        <div><span className="font-bold text-amber-600">{(viewLoan.repayment_schedule as RepaymentEntry[]).filter(s => getInstallmentStatus(viewLoan, s) === "OVERDUE").length}</span> <span className="text-muted-foreground">Overdue</span></div>
                                        <div><span className="font-bold text-muted-foreground">{(viewLoan.repayment_schedule as RepaymentEntry[]).filter(s => getInstallmentStatus(viewLoan, s) === "UPCOMING").length}</span> <span className="text-muted-foreground">Upcoming</span></div>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="flex justify-end pt-4 mt-6 border-t border-border">
                            <button className="button button-primary" onClick={() => setViewLoan(null)}>Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
