"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "../../../../lib/supabase/client";
import type { Branch, Employee, IncentiveRule } from "../../../../lib/types";

export default function BranchDetailsPage() {
    const { id } = useParams();
    const [branch, setBranch] = useState<Branch | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [todayCount, setTodayCount] = useState(0);
    const [avgSales, setAvgSales] = useState(0);
    const [incentiveRules, setIncentiveRules] = useState<IncentiveRule[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadBranchData() {
            const today = new Date().toISOString().split("T")[0];

            const [branchRes, employeesRes, attRes, salesRes, rulesRes] = await Promise.all([
                supabaseBrowser.from("branches").select("*").eq("id", id).single(),
                supabaseBrowser.from("employees").select("*").eq("branch_id", id).eq("status", "ACTIVE"),
                supabaseBrowser.from("attendance_logs").select("*", { count: "exact", head: true }).eq("branch_id", id).gte("check_in", today),
                supabaseBrowser.from("branch_daily_sales").select("sales_amount").eq("branch_id", id).order("date", { ascending: false }).limit(30),
                supabaseBrowser.from("incentive_rules").select("*").or(`branch_id.eq.${id},branch_id.is.null`),
            ]);

            if (branchRes.data) setBranch(branchRes.data as Branch);
            setEmployees((employeesRes.data as Employee[]) || []);
            setTodayCount(attRes.count || 0);
            const salesData = (salesRes.data || []) as { sales_amount: number }[];
            setAvgSales(salesData.length > 0 ? Math.round(salesData.reduce((s, d) => s + Number(d.sales_amount), 0) / salesData.length) : 0);
            setIncentiveRules((rulesRes.data as IncentiveRule[]) || []);
            setLoading(false);
        }
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
                            Manage Rules
                        </Link>
                    </div>

                    <div className="card">
                        <h3 className="mb-4">Branch Info</h3>
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">City</span>
                                <span>{branch.city}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">State</span>
                                <span>{branch.state || "N/A"}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Address</span>
                                <span>{branch.address || "Not set"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
