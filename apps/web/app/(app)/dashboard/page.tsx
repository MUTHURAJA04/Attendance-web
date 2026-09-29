"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";

interface RecentLog {
  id: string;
  check_in: string;
  check_out?: string | null;
  status: string;
  source: string;
  created_at?: string;
  employees?: { id?: string; full_name: string; branches?: { name: string } | null } | null;
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
  const [refreshing, setRefreshing] = useState(false);
  const { selectedBranch, isLoading: tenantLoading } = useTenant();

  const loadDashboardData = useCallback(async () => {
    if (tenantLoading) return;

    // Use IST for "today" to avoid UTC timezone mismatch
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const today = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, "0")}-${String(nowIST.getDate()).padStart(2, "0")}`;
    const branchId = selectedBranch?.id;

    let empQuery = supabaseBrowser.from("employees").select("*", { count: "exact", head: true }).eq("status", "ACTIVE");
    let attQuery = supabaseBrowser.from("attendance_logs").select("*", { count: "exact", head: true }).gte("check_in", today + "T00:00:00+05:30");
    let leaveQuery = supabaseBrowser.from("leave_requests").select("*, employees!inner(branch_id)", { count: "exact", head: true }).eq("status", "PENDING");
    
    // Query last 5 recent attendance logs
    let logsQuery = supabaseBrowser
      .from("attendance_logs")
      .select("id, check_in, check_out, status, source, created_at, branch_id, employees(id, full_name, branch_id, branches(name))")
      .order("check_in", { ascending: false })
      .limit(5);

    if (branchId) {
      empQuery = empQuery.eq("branch_id", branchId);
      attQuery = attQuery.eq("branch_id", branchId);
      leaveQuery = leaveQuery.eq("employees.branch_id", branchId);
      logsQuery = logsQuery.eq("branch_id", branchId);
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
    setRefreshing(false);
  }, [selectedBranch, tenantLoading]);

  // Initial load + Real-time live sync for instant updates
  useEffect(() => {
    setLoading(true);
    loadDashboardData();

    // Subscribe to real-time changes on attendance_logs and leave_requests
    const channel = supabaseBrowser
      .channel("dashboard_live_updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        () => {
          loadDashboardData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leave_requests" },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [loadDashboardData]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1>Operational Dashboard</h1>
            <button
              type="button"
              onClick={handleManualRefresh}
              className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${
                refreshing ? "animate-spin text-primary" : ""
              }`}
              title="Refresh Dashboard Data"
              aria-label="Refresh Dashboard Data"
            >
              🔄
            </button>
          </div>
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
        {/* Recent Activity: Shows strictly last 5 entries with live updates */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2>Recent Activity</h2>
              <span className="text-xs text-muted-foreground">
                Last 5 attendance check-ins
              </span>
            </div>
            <Link href="/attendance" className="button button-secondary h-8 text-xs font-semibold">
              View All
            </Link>
          </div>

          {recentLogs.length === 0 ? (
            <div className="centered border border-dashed border-border rounded p-8">
              <p className="text-muted-foreground text-sm">No recent attendance activity found.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentLogs.slice(0, 5).map((log) => {
                const checkInDate = new Date(log.check_in);
                const isToday = checkInDate.toDateString() === new Date().toDateString();
                const timeStr = checkInDate.toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
                const dateLabel = isToday
                  ? "Today"
                  : checkInDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

                const isPresent = log.status === "PRESENT" || log.status === "OT";
                const isAbsent = log.status === "ABSENT";

                return (
                  <div key={log.id} className="flex justify-between items-center py-2.5 border-b border-border/60 hover:bg-muted/30 px-1.5 rounded transition-colors">
                    <div>
                      {log.employees?.id ? (
                        <Link
                          href={`/attendance/employee/${log.employees.id}`}
                          className="text-sm font-bold text-foreground hover:text-primary hover:underline"
                        >
                          {log.employees.full_name}
                        </Link>
                      ) : (
                        <strong className="text-sm text-foreground">
                          {log.employees?.full_name || "Staff Member"}
                        </strong>
                      )}
                      <div className="text-muted-foreground text-xs mt-0.5">
                        {log.employees?.branches?.name ? `${log.employees.branches.name} • ` : ""}
                        <span>{dateLabel} at {timeStr}</span>
                        {log.check_out && (
                          <span className="text-foreground/75">
                            {" "}→ Out: {new Date(log.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="pill text-[0.65rem] font-medium bg-muted text-muted-foreground border border-border/60">
                        {log.source === "BIOMETRIC" ? "📱 Biometric" : log.source}
                      </span>
                      <span
                        className={`pill text-[0.65rem] font-bold ${
                          isPresent
                            ? "pill-success"
                            : isAbsent
                            ? "pill-destructive"
                            : "pill-warning"
                        }`}
                      >
                        {log.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {stats.pendingLeaves > 0 && (
            <div className="card bg-amber-500/10 border border-amber-500/30 p-4">
              <h3 className="text-amber-900 dark:text-amber-200 text-sm font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Pending Leaves</span>
              </h3>
              <p className="text-amber-800 dark:text-amber-300 text-xs mt-1">
                {stats.pendingLeaves} leave request{stats.pendingLeaves > 1 ? "s" : ""} awaiting approval.
              </p>
              <Link href="/leaves" className="button button-primary mt-3 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 text-center block">
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
