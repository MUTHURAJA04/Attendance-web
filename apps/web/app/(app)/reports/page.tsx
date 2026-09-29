"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useAuth } from "../../../components/AuthGate";

interface ReportStats {
    totalEmployees: number;
    activeBranches: number;
    totalMonthlyGross: number;
    totalDeductions: number;
    totalNetPay: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    pendingLeaves: number;
    activeLoans: number;
}

export default function ReportsPage() {
    const { role } = useAuth();
    const [stats, setStats] = useState<ReportStats | null>(null);
    const [loading, setLoading] = useState(true);

    if (role && ["MANAGER", "BRANCH_STAFF", "EMPLOYEE"].includes(role)) {
        return (
            <div className="card max-w-lg mx-auto my-12 p-8 text-center space-y-3">
                <span className="text-4xl block">🔒</span>
                <h2 className="text-base font-bold text-foreground">Access Restricted</h2>
                <p className="text-xs text-muted-foreground">
                    Your role (<strong>{role}</strong>) does not have permission to view Financial & Payroll Reports.
                </p>
                <div className="pt-2">
                    <Link href="/attendance" className="button button-primary text-xs">
                        ← Back to Attendance
                    </Link>
                </div>
            </div>
        );
    }

    useEffect(() => {
        async function loadStats() {
            const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
            const monthStart = new Date(nowIST.getFullYear(), nowIST.getMonth(), 1).toISOString().split("T")[0] + "T00:00:00+05:30";
            const monthEnd = new Date(nowIST.getFullYear(), nowIST.getMonth() + 1, 0, 23, 59, 59).toISOString().split("T")[0] + "T23:59:59+05:30";

            const [empRes, branchRes, payslipRes, attRes, leaveRes, loanRes] = await Promise.all([
                supabaseBrowser.from("employees").select("*", { count: "exact", head: true }).eq("status", "ACTIVE"),
                supabaseBrowser.from("branches").select("*", { count: "exact", head: true }),
                supabaseBrowser.from("payslips").select("gross_pay, net_pay, pf_deduction, esi_deduction, pt_deduction, tds_deduction, loan_deduction"),
                supabaseBrowser.from("attendance_logs").select("status").gte("check_in", monthStart).lte("check_in", monthEnd),
                supabaseBrowser.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
                supabaseBrowser.from("loans").select("*", { count: "exact", head: true }).eq("status", "ACTIVE"),
            ]);

            const payslips = (payslipRes.data || []) as Array<Record<string, number>>;
            const attLogs = (attRes.data || []) as Array<{ status: string }>;

            setStats({
                totalEmployees: empRes.count || 0,
                activeBranches: branchRes.count || 0,
                totalMonthlyGross: payslips.reduce((s, p) => s + Number(p.gross_pay || 0), 0),
                totalDeductions: payslips.reduce((s, p) => s + Number(p.pf_deduction || 0) + Number(p.esi_deduction || 0) + Number(p.pt_deduction || 0) + Number(p.tds_deduction || 0) + Number(p.loan_deduction || 0), 0),
                totalNetPay: payslips.reduce((s, p) => s + Number(p.net_pay || 0), 0),
                presentCount: attLogs.filter((l) => l.status === "PRESENT" || l.status === "LATE").length,
                absentCount: attLogs.filter((l) => l.status === "ABSENT").length,
                lateCount: attLogs.filter((l) => l.status === "LATE").length,
                pendingLeaves: leaveRes.count || 0,
                activeLoans: loanRes.count || 0,
            });
            setLoading(false);
        }
        loadStats();
    }, []);

    if (loading) return <div className="centered">Loading reports...</div>;
    if (!stats) return <div className="centered">Failed to load data.</div>;

    const attendanceRate = stats.presentCount + stats.absentCount > 0
        ? Math.round((stats.presentCount / (stats.presentCount + stats.absentCount)) * 100)
        : 0;

    return (
        <div>
            <div className="mb-8">
                <h1>Reporting & Analytics</h1>
                <p>Operational health overview and compliance summaries for the current month.</p>
            </div>

            <div className="stats-grid">
                <div className="card stat-card">
                    <span className="stat-label">Total Gross Liability</span>
                    <span className="stat-value">₹{stats.totalMonthlyGross.toLocaleString("en-IN")}</span>
                    <span className="stat-description">Sum of all gross pay</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Total Net Payout</span>
                    <span className="stat-value">₹{stats.totalNetPay.toLocaleString("en-IN")}</span>
                    <span className="stat-description">After all deductions</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Headcount</span>
                    <span className="stat-value">{stats.totalEmployees}</span>
                    <span className="stat-description">Across {stats.activeBranches} branches</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Attendance Rate</span>
                    <span className={`stat-value ${attendanceRate >= 90 ? "text-accent-2" : "text-destructive"}`}>
                        {attendanceRate}%
                    </span>
                    <span className="stat-description">This month&apos;s punctuality</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="card">
                    <h2 className="mb-4">Attendance Breakdown</h2>
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <span>Present / On-Time</span>
                            <strong className="text-accent-2">{stats.presentCount}</strong>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden">
                            <div className="h-full bg-accent-2 rounded transition-all duration-300" style={{ width: `${attendanceRate}%` }} />
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Absent</span>
                            <strong className="text-destructive">{stats.absentCount}</strong>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>Late Arrivals</span>
                            <strong className="text-amber-500">{stats.lateCount}</strong>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h2 className="mb-4">Payroll Deduction Breakdown</h2>
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <span>Total Deductions</span>
                            <strong>₹{stats.totalDeductions.toLocaleString("en-IN")}</strong>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Pending Leave Requests</span>
                            <span className={`pill ${stats.pendingLeaves > 0 ? "pill-warning" : "pill-success"}`}>
                                {stats.pendingLeaves}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Active Loans</span>
                            <span className="pill">{stats.activeLoans}</span>
                        </div>
                        <Link href="/reports/write-offs" className="button button-secondary w-full text-xs mt-2">View Write-off Ledger</Link>
                    </div>
                </div>
            </div>

            <div className="card mt-8">
                <h2 className="mb-4">Statutory Due Dates</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-muted rounded border-l-4 border-l-destructive">
                        <div className="font-semibold text-sm">PF Deposit</div>
                        <div className="text-muted-foreground text-xs">Due by 15th of every month</div>
                    </div>
                    <div className="p-4 bg-muted rounded border-l-4 border-l-amber-500">
                        <div className="font-semibold text-sm">ESI Contribution</div>
                        <div className="text-muted-foreground text-xs">Due by 15th of every month</div>
                    </div>
                    <div className="p-4 bg-muted rounded border-l-4 border-l-primary">
                        <div className="font-semibold text-sm">Professional Tax</div>
                        <div className="text-muted-foreground text-xs">Varies by state</div>
                    </div>
                </div>
            </div>
        </div >
    );
}
