"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";

interface RecentLog {
  id: string;
  check_in: string;
  status: string;
  source: string;
  employees?: { full_name: string; branches?: { name: string } | null } | null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState({
    employeeCount: 0,
    activeBranches: 0,
    attendanceToday: 0,
    payrollStatus: "—",
    pendingLeaves: 0,
  });
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedBranch, isLoading: tenantLoading } = useTenant();

  useEffect(() => {
    async function loadDashboardData() {
      if (tenantLoading) return;
      setLoading(true);

      // Use IST for "today" to avoid UTC timezone mismatch
      const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const today = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, "0")}-${String(nowIST.getDate()).padStart(2, "0")}`;
      const branchId = selectedBranch?.id;

      let empQuery = supabaseBrowser.from("employees").select("*", { count: "exact", head: true }).eq("status", "ACTIVE");
      let attQuery = supabaseBrowser.from("attendance_logs").select("*", { count: "exact", head: true }).gte("check_in", today + "T00:00:00+05:30");
      let leaveQuery = supabaseBrowser.from("leave_requests").select("*, employees!inner(branch_id)", { count: "exact", head: true }).eq("status", "PENDING");
      let logsQuery = supabaseBrowser
        .from("attendance_logs")
        .select("id, check_in, status, source, employees!inner(full_name, branches(name), branch_id)")
        .order("check_in", { ascending: false })
        .limit(10);

      if (branchId) {
        empQuery = empQuery.eq("branch_id", branchId);
        attQuery = attQuery.eq("branch_id", branchId);
        leaveQuery = leaveQuery.eq("employees.branch_id", branchId);
        logsQuery = logsQuery.eq("employees.branch_id", branchId);
      }

      const [empRes, branchRes, attRes, periodRes, leaveRes, logsRes] = await Promise.all([
        empQuery,
        supabaseBrowser.from("branches").select("*", { count: "exact", head: true }),
        attQuery,
        supabaseBrowser.from("payroll_periods").select("status").order("year", { ascending: false }).order("month", { ascending: false }).limit(1),
        leaveQuery,
        logsQuery,
      ]);

      setStats({
        employeeCount: empRes.count || 0,
        activeBranches: branchRes.count || 0,
        attendanceToday: attRes.count || 0,
        payrollStatus: (periodRes.data as { status: string }[])?.[0]?.status || "No Period",
        pendingLeaves: leaveRes.count || 0,
      });
      setRecentLogs((logsRes.data || []) as unknown as RecentLog[]);
      setLoading(false);
    }
    loadDashboardData();
  }, [selectedBranch, tenantLoading]);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1>Operational Dashboard</h1>
          <p>Real-time overview of attendance and payroll metrics.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/employees/new" className="button button-primary">+ New Employee</Link>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <span className="stat-label">Total Employees</span>
          <span className="stat-value">{loading ? "..." : stats.employeeCount}</span>
          <span className="stat-description">Onboarded across all branches</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Active Branches</span>
          <span className="stat-value">{loading ? "..." : stats.activeBranches}</span>
          <span className="stat-description">Active locations</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Today&apos;s Attendance</span>
          <span className="stat-value">{loading ? "..." : stats.attendanceToday}</span>
          <span className="stat-description">Check-ins recorded today</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Payroll Status</span>
          <span className={`stat-value ${stats.payrollStatus === "LOCKED" ? "text-accent-2" : "text-primary"}`}>
            {loading ? "..." : stats.payrollStatus}
          </span>
          <span className="stat-description">Financial period state</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2>Recent Activity</h2>
            <Link href="/attendance" className="button button-secondary h-8">View All</Link>
          </div>
          {recentLogs.length === 0 ? (
            <div className="centered border border-dashed border-border rounded">
              <p className="text-muted-foreground">No recent attendance activity found.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex justify-between items-center py-2 border-b border-border">
                  <div>
                    <strong className="text-sm">{log.employees?.full_name}</strong>
                    <div className="text-muted-foreground text-xs">
                      {log.employees?.branches?.name} • {new Date(log.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill text-[0.65rem]">{log.source}</span>
                    <span className={`pill text-[0.65rem] ${log.status === "PRESENT" ? "pill-success" : log.status === "ABSENT" ? "pill-destructive" : "pill-warning"}`}>
                      {log.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {stats.pendingLeaves > 0 && (
            <div className="card bg-amber-50 border-amber-400">
              <h3 className="text-amber-900">⚠️ Pending Leaves</h3>
              <p className="text-amber-900 text-sm mt-2">
                {stats.pendingLeaves} leave request{stats.pendingLeaves > 1 ? "s" : ""} awaiting approval.
              </p>
              <Link href="/leaves" className="button button-primary mt-4 w-full bg-amber-500 border-amber-500 hover:bg-amber-600">
                Review Now
              </Link>
            </div>
          )}
          <div className="card">
            <h2>Quick Links</h2>
            <div className="flex flex-col gap-2 mt-4">
              <Link href="/branches" className="sidebar-link">🏢 Branch Directory</Link>
              <Link href="/holidays" className="sidebar-link">📅 Holiday Calendar</Link>
              <Link href="/leaves" className="sidebar-link">📄 Leave Requests</Link>
              <Link href="/loans" className="sidebar-link">💳 Loan Ledgers</Link>
              <Link href="/incentives" className="sidebar-link">🚀 Incentive Rules</Link>
              <Link href="/settings" className="sidebar-link">⚙️ System Configuration</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
