"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "../../../../lib/supabase/client";
import type { Branch, Employee, IncentiveRule, BranchRule } from "../../../../lib/types";
import { BranchRuleBuilder } from "../../../../components/BranchRuleBuilder";

export default function BranchDetailsPage() {
    const { id } = useParams();
    const [branch, setBranch] = useState<Branch | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [todayCount, setTodayCount] = useState(0);
    const [avgSales, setAvgSales] = useState(0);
    const [incentiveRules, setIncentiveRules] = useState<IncentiveRule[]>([]);
    const [branchRules, setBranchRules] = useState<BranchRule[]>([]);
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    async function loadBranchData() {
        const today = new Date().toISOString().split("T")[0];

        const [branchRes, employeesRes, attRes, salesRes, rulesRes, branchRulesRes] = await Promise.all([
            supabaseBrowser.from("branches").select("*").eq("id", id).single(),
            supabaseBrowser.from("employees").select("*").eq("branch_id", id).eq("status", "ACTIVE"),
            supabaseBrowser.from("attendance_logs").select("*", { count: "exact", head: true }).eq("branch_id", id).gte("check_in", today),
            supabaseBrowser.from("branch_daily_sales").select("sales_amount").eq("branch_id", id).order("date", { ascending: false }).limit(30),
            supabaseBrowser.from("incentive_rules").select("*").or(`branch_id.eq.${id},branch_id.is.null`),
            supabaseBrowser.from("branch_rules").select("*").or(`branch_id.eq.${id},branch_id.is.null`).order("created_at", { ascending: false }),
        ]);

        if (branchRes.data) setBranch(branchRes.data as Branch);
        setEmployees((employeesRes.data as Employee[]) || []);
        setTodayCount(attRes.count || 0);
        const salesData = (salesRes.data || []) as { sales_amount: number }[];
        setAvgSales(salesData.length > 0 ? Math.round(salesData.reduce((s, d) => s + Number(d.sales_amount), 0) / salesData.length) : 0);
        setIncentiveRules((rulesRes.data as IncentiveRule[]) || []);
        setBranchRules((branchRulesRes.data as BranchRule[]) || []);
        setLoading(false);
    }

    useEffect(() => {
        loadBranchData();
    }, [id]);

    const toggleStatus = async () => {
        if (!branch) return;
        if (!confirm(branch.is_active ? "Mark this branch as inactive?" : "Re-activate this branch?")) return;
        await supabaseBrowser.from("branches").update({ is_active: !branch.is_active }).eq("id", branch.id);
        setBranch({ ...branch, is_active: !branch.is_active });
    };

    if (loading) return <div className="centered">Loading branch configuration...</div>;
    if (!branch) return <div className="centered">Branch not found.</div>;

    const activeRules = branchRules.filter((r) => r.is_active);
    const lateRules = activeRules.filter((r) => r.rule_type === "LATE_COMING");
    const leaveRules = activeRules.filter((r) => r.rule_type === "LEAVE_POLICY");
    const otRules = activeRules.filter((r) => r.rule_type === "OVERTIME");

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Link href="/branches" className="text-muted-foreground text-sm">Branches</Link>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-sm">{branch.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <h1>{branch.name}</h1>
                        <span className={`pill ${branch.is_active !== false ? "pill-success" : "pill-destructive"}`}>
                            {branch.is_active !== false ? "Operational" : "Inactive"}
                        </span>
                    </div>
                    <p>{branch.city}, {branch.state || "N/A"}</p>
                </div>
                <div className="flex gap-2">
                    <Link href={`/branches/${id}/edit`} className="button button-secondary">Edit Branch</Link>
                    <button onClick={toggleStatus} className={`button button-secondary ${branch.is_active !== false ? "text-destructive" : ""}`}>
                        {branch.is_active !== false ? "Deactivate" : "Activate"}
                    </button>
                    <Link href={`/employees/new?branch=${id}`} className="button button-primary">+ Add Staff</Link>
                </div>
            </div>

            <div className="stats-grid">
                <div className="card stat-card">
                    <span className="stat-label">Headcount</span>
                    <span className="stat-value">{employees.length}</span>
                    <span className="stat-description">Staff assigned to this location</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Avg Daily Sales (30d)</span>
                    <span className="stat-value">₹{avgSales.toLocaleString("en-IN")}</span>
                    <span className="stat-description">Based on recent sales records</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Today&apos;s Attendance</span>
                    <span className="stat-value">{todayCount}</span>
                    <span className="stat-description">Check-ins recorded today</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
                <div className="card p-0 overflow-hidden">
                    <div className="px-6 py-5 border-b border-border">
                        <h2>Staff Roster</h2>
                    </div>
                    {employees.length === 0 ? (
                        <div className="centered p-12">
                            <p className="text-muted-foreground">No staff members assigned to this branch.</p>
                        </div>
                    ) : (
                        <table className="role-table">
                            <thead><tr><th>Staff Name</th><th>Role</th><th>Code</th><th>Status</th><th className="text-right">Action</th></tr></thead>
                            <tbody>
                                {employees.map((emp) => (
                                    <tr key={emp.id}>
                                        <td><strong>{emp.full_name}</strong></td>
                                        <td><span className="pill">{emp.role}</span></td>
                                        <td className="text-muted-foreground">{emp.employee_code || "—"}</td>
                                        <td><span className={`pill ${emp.is_active !== false ? "pill-success" : "pill-destructive"}`}>{emp.is_active !== false ? "Active" : "Disabled"}</span></td>
                                        <td className="text-right">
                                            <Link href={`/employees/${emp.id}`} className="button button-secondary h-7 text-[0.7rem]">Profile</Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="flex flex-col gap-6">
                    {/* Leave & Late Rules Summary Card */}
                    <div className="card">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-base">Leave & Late Rules</h3>
                                <p className="text-xs text-muted-foreground">Automated deductions & OT rules</p>
                            </div>
                            <span className={`pill ${activeRules.length > 0 ? "pill-success" : "pill-muted"}`}>
                                {activeRules.length} Active
                            </span>
                        </div>

                        {activeRules.length === 0 ? (
                            <div className="bg-muted/40 p-3 rounded-lg border text-center mb-4">
                                <p className="text-xs text-muted-foreground">No custom rules active for this branch.</p>
                                <p className="text-[0.7rem] text-muted-foreground mt-1">Default TN statutory rates apply.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2.5 mb-4">
                                {/* Late Coming Summary */}
                                <div className="p-2.5 bg-muted/50 rounded-lg border text-xs">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-semibold flex items-center gap-1.5">
                                            <span>⏱️ Late Coming</span>
                                            <span className="text-[0.65rem] text-muted-foreground font-normal">({lateRules.length})</span>
                                        </span>
                                        {lateRules.length > 0 ? (
                                            <span className="pill pill-warning text-[0.65rem]">Active</span>
                                        ) : (
                                            <span className="text-[0.65rem] text-muted-foreground">None</span>
                                        )}
                                    </div>
                                    {lateRules.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {lateRules.slice(0, 2).map((r) => (
                                                <span key={r.id} className="inline-block px-1.5 py-0.5 bg-background border rounded text-[0.7rem]">
                                                    &gt;{r.threshold_minutes}m: -{r.deduction_percentage}%
                                                </span>
                                            ))}
                                            {lateRules.length > 2 && (
                                                <span className="text-[0.7rem] text-muted-foreground self-center">
                                                    +{lateRules.length - 2} more
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[0.7rem] text-muted-foreground">Standard grace period applies</p>
                                    )}
                                </div>

                                {/* Leave Policy Summary */}
                                <div className="p-2.5 bg-muted/50 rounded-lg border text-xs">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-semibold flex items-center gap-1.5">
                                            <span>🏖️ Leave Policy</span>
                                            <span className="text-[0.65rem] text-muted-foreground font-normal">({leaveRules.length})</span>
                                        </span>
                                        {leaveRules.length > 0 ? (
                                            <span className="pill pill-destructive text-[0.65rem]">Active</span>
                                        ) : (
                                            <span className="text-[0.65rem] text-muted-foreground">None</span>
                                        )}
                                    </div>
                                    {leaveRules.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {leaveRules.slice(0, 2).map((r) => (
                                                <span key={r.id} className="inline-block px-1.5 py-0.5 bg-background border rounded text-[0.7rem]">
                                                    {r.leave_type || "Leave"}: {r.deduction_percentage}%
                                                </span>
                                            ))}
                                            {leaveRules.length > 2 && (
                                                <span className="text-[0.7rem] text-muted-foreground self-center">
                                                    +{leaveRules.length - 2} more
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[0.7rem] text-muted-foreground">1.0x / 1.5x standard tiered absence deduction</p>
                                    )}
                                </div>

                                {/* Overtime Summary */}
                                <div className="p-2.5 bg-muted/50 rounded-lg border text-xs">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-semibold flex items-center gap-1.5">
                                            <span>⚡ Overtime (OT)</span>
                                            <span className="text-[0.65rem] text-muted-foreground font-normal">({otRules.length})</span>
                                        </span>
                                        {otRules.length > 0 ? (
                                            <span className="pill pill-success text-[0.65rem]">Active</span>
                                        ) : (
                                            <span className="text-[0.65rem] text-muted-foreground">None</span>
                                        )}
                                    </div>
                                    {otRules.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {otRules.slice(0, 2).map((r) => (
                                                <span key={r.id} className="inline-block px-1.5 py-0.5 bg-background border rounded text-[0.7rem]">
                                                    &gt;{r.threshold_minutes}m: {r.rate_multiplier}x rate
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[0.7rem] text-muted-foreground">Standard 1.0x hourly OT rate</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => setIsRuleModalOpen(true)}
                            className="button button-primary w-full text-xs font-semibold"
                        >
                            ⚙️ Manage Rules
                        </button>
                    </div>

                    {/* Incentive Rules Card */}
                    <div className="card">
                        <h3 className="mb-4">Incentive Rules</h3>
                        {incentiveRules.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No incentive rules defined for this branch.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {incentiveRules.map((rule) => (
                                    <div key={rule.id} className="p-3 bg-muted rounded">
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm font-medium">{rule.type} Rule</span>
                                            <span className="pill pill-success">₹{Number(rule.incentive_amount || 0).toLocaleString("en-IN")}</span>
                                        </div>
                                        <p className="text-muted-foreground text-xs">
                                            Target: ₹{Number(rule.target_amount || 0).toLocaleString("en-IN")} • Role: {rule.role_id || "All"}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                        <Link href="/incentives" className="button button-secondary mt-4 w-full text-[0.8rem]">
                            Manage Incentives
                        </Link>
                    </div>
                </div>
            </div>

            {/* Rule Builder Drawer / Modal */}
            <BranchRuleBuilder
                isOpen={isRuleModalOpen}
                onClose={() => setIsRuleModalOpen(false)}
                branchId={id as string}
                branchName={branch.name}
                employees={employees}
                onRulesUpdated={loadBranchData}
            />
        </div>
    );
}
