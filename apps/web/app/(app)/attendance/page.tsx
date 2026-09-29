"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import type { Employee, Branch, AttendanceStatus } from "../../../lib/types";

const STATUS_CONFIG: Record<AttendanceStatus | "-", { label: string; short: string; bg: string; color: string }> = {
  PRESENT: { label: "Present", short: "P", bg: "#dcfce7", color: "#166534" },
  ABSENT: { label: "Uninformed Absence", short: "A", bg: "#fee2e2", color: "#991b1b" },
  HALF_DAY: { label: "Half Day", short: "H", bg: "#fef3c7", color: "#92400e" },
  LATE: { label: "Late", short: "L", bg: "#fef9c3", color: "#854d0e" },
  OT: { label: "Overtime", short: "O", bg: "#dbeafe", color: "#1e40af" },
  LEAVE_APPROVED: { label: "Informed Approved", short: "✓", bg: "#e0e7ff", color: "#3730a3" },
  LEAVE_UNAPPROVED: { label: "Informed Unapproved", short: "✗", bg: "#fce7f3", color: "#9d174d" },
  "-": { label: "No Record", short: "-", bg: "var(--muted)", color: "var(--muted-foreground)" },
};

interface AttendanceLogItem {
  id: string;
  employee_id: string;
  check_in: string;
  check_out: string | null;
  status: string;
  source?: string | null;
  metadata?: {
    device_id?: string;
    device?: string;
    confidence?: number;
    liveness_verified?: boolean;
    punched_at?: string;
    [key: string]: any;
  } | null;
}

export default function AttendancePage() {
  const [employees, setEmployees] = useState<(Pick<Employee, "id" | "full_name" | "branch_id"> & { branches?: { name: string } | null })[]>([]);
  const [logs, setLogs] = useState<AttendanceLogItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<{ id: string; employee_id: string; start_date: string; end_date: string; status: string }[]>([]);
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

interface PunchSessionItem {
  id: string;
  checkIn: string;
  checkOut: string;
  duration: string;
  durationMinutes: number;
  autoCheckedOut?: boolean;
}

  // Selected Entry for Modal Popup Details
  const [selectedEntry, setSelectedEntry] = useState<{
    employee: { id: string; full_name: string; branchName?: string };
    date: string;
    formattedDate: string;
    dayNumber: number;
    status: AttendanceStatus | "-";
    totalWorkedDisplay: string;
    sessions: PunchSessionItem[];
    deviceId: string;
    leave: { id: string; status: string } | null;
  } | null>(null);

  // Global Tenant Filter
  const { selectedBranch: globalBranch, isLoading: tenantLoading } = useTenant();

  // Filters
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  // Manual marking
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    employee_id: "",
    date: new Date().toISOString().split("T")[0],
    status: "PRESENT" as AttendanceStatus,
    check_in: "09:00",
    check_out: "18:00",
  });

  // Background 11:00 PM Auto Check-Out check
  const handleAutoCheckout = async () => {
    try {
      await fetch("/api/cron/auto-checkout", { method: "POST" });
      await loadData();
    } catch (err) {
      console.error("Background auto checkout error:", err);
    }
  };

  async function loadData() {
    if (tenantLoading) return;
    setLoading(true);
    // Use IST (Asia/Kolkata) for date range to avoid UTC mismatch
    const pad = (n: number) => String(n).padStart(2, "0");
    const startIST = `${year}-${pad(month + 1)}-01T00:00:00+05:30`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endIST = `${year}-${pad(month + 1)}-${pad(lastDay)}T23:59:59+05:30`;

    let empQuery = supabaseBrowser.from("employees").select("id, full_name, branch_id, branches(name)").eq("status", "ACTIVE");
    if (globalBranch) {
      empQuery = empQuery.eq("branch_id", globalBranch.id);
    }

    const [emps, branchRes] = await Promise.all([
      empQuery,
      supabaseBrowser.from("branches").select("id, name"),
    ]);

    const activeEmployees = (emps.data || []) as unknown as typeof employees;
    const empIds = activeEmployees.map((e) => e.id);

    let logsQuery = supabaseBrowser
      .from("attendance_logs")
      .select("id, employee_id, check_in, check_out, status, source, metadata")
      .gte("check_in", startIST)
      .lte("check_in", endIST);

    if (globalBranch && empIds.length > 0) {
      logsQuery = logsQuery.in("employee_id", empIds);
    } else if (globalBranch) {
      logsQuery = logsQuery.eq("branch_id", globalBranch.id);
    }

    let leavesQuery = supabaseBrowser
      .from("leave_requests")
      .select("id, employee_id, start_date, end_date, status")
      .in("status", ["APPROVED", "PENDING"])
      .gte("start_date", `${year}-${pad(month + 1)}-01`)
      .lte("end_date", `${year}-${pad(month + 1)}-${pad(lastDay)}`);

    if (empIds.length > 0) {
      leavesQuery = leavesQuery.in("employee_id", empIds);
    }

    const [syncLogs, leavesRes] = await Promise.all([
      logsQuery,
      leavesQuery,
    ]);

    setEmployees(activeEmployees);
    setLogs((syncLogs.data || []) as unknown as typeof logs);
    setBranches((branchRes.data || []) as unknown as typeof branches);
    setLeaveRequests((leavesRes.data || []) as unknown as typeof leaveRequests);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    // Check if any unclosed punches need 11 PM auto checkout
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    if (nowIST.getHours() >= 23 || nowIST.getDate() > 1) {
      handleAutoCheckout();
    }
  }, [month, year, globalBranch, tenantLoading]);

  // Handle ESC key for modal dismissal (WCAG keyboard accessibility)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedEntry) setSelectedEntry(null);
        if (showManual) setShowManual(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEntry, showManual]);

  const handleSync = async () => {
    setIsSyncing(true);
    await loadData();
    setIsSyncing(false);
  };

  const handleManualMark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.employee_id) { alert("Select an employee."); return; }

    const checkInDate = new Date(`${manualForm.date}T${manualForm.check_in}:00`);
    const checkOutDate = manualForm.check_out ? new Date(`${manualForm.date}T${manualForm.check_out}:00`) : null;

    const { error } = await supabaseBrowser.from("attendance_logs").insert([{
      employee_id: manualForm.employee_id,
      branch_id: employees.find((e) => e.id === manualForm.employee_id)?.branch_id,
      check_in: checkInDate.toISOString(),
      check_out: checkOutDate?.toISOString() || null,
      status: manualForm.status,
      source: "MANUAL",
    }]);

    if (!error) {
      setShowManual(false);
      loadData();
    } else {
      alert(error.message);
    }
  };

  const getStatus = (empId: string, day: number): AttendanceStatus | "-" => {
    // Check attendance_logs first
    const log = logs.find(
      (l) => l.employee_id === empId && new Date(l.check_in).getDate() === day
    );
    // If we have a definitive attendance status (present, late, etc.), use it
    if (log && log.status !== "ABSENT") return log.status as AttendanceStatus;

    // Check leave requests for this day
    const dayDate = new Date(year, month, day);
    const leave = leaveRequests.find((lr) => {
      if (lr.employee_id !== empId) return false;
      const start = new Date(lr.start_date + "T00:00:00");
      const end = new Date(lr.end_date + "T23:59:59");
      return dayDate >= start && dayDate <= end;
    });

    if (leave) {
      return leave.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_UNAPPROVED";
    }

    // If there's an ABSENT log, it's uninformed
    if (log) return "ABSENT";

    return "-";
  };

  const handleCellClick = (emp: typeof employees[0], day: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    const dateObj = new Date(year, month, day);
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const dayLogs = logs
      .filter((l) => l.employee_id === emp.id && new Date(l.check_in).getDate() === day)
      .sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());

    let totalWorkedMinutes = 0;
    const sessions: PunchSessionItem[] = dayLogs.map((l) => {
      const inDate = new Date(l.check_in);
      const inTimeStr = inDate.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      let outTimeStr = "—";
      let durationStr = "—";
      let sessionMins = 0;

      if (l.check_out) {
        const outDate = new Date(l.check_out);
        outTimeStr = outDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        const diffMs = outDate.getTime() - inDate.getTime();
        if (diffMs > 0) {
          sessionMins = Math.floor(diffMs / (1000 * 60));
          totalWorkedMinutes += sessionMins;
          const hrs = Math.floor(sessionMins / 60);
          const mins = sessionMins % 60;
          durationStr = `${hrs.toString().padStart(2, "0")}h ${mins.toString().padStart(2, "0")}m`;
        } else {
          durationStr = "00h 00m";
        }
      } else {
        outTimeStr = "In Progress";
      }

      const isAutoOut = Boolean((l.metadata as any)?.auto_checked_out);

      return {
        id: l.id,
        checkIn: inTimeStr,
        checkOut: outTimeStr,
        duration: durationStr,
        durationMinutes: sessionMins,
        autoCheckedOut: isAutoOut,
      };
    });

    const leave = leaveRequests.find((lr) => {
      if (lr.employee_id !== emp.id) return false;
      const start = new Date(lr.start_date + "T00:00:00");
      const end = new Date(lr.end_date + "T23:59:59");
      return dateObj >= start && dateObj <= end;
    }) || null;

    const status = getStatus(emp.id, day);

    const firstLog = dayLogs.length > 0 ? dayLogs[0] : null;
    const meta = firstLog?.metadata as Record<string, unknown> | null;
    const rawDevice =
      (meta?.device_id as string) ||
      (meta?.device as string) ||
      (firstLog?.source ? firstLog.source.toUpperCase() : "MANUAL");
    const deviceId = rawDevice.replace(/_/g, " ");

    const totalHours = Math.floor(totalWorkedMinutes / 60);
    const totalMins = totalWorkedMinutes % 60;
    const totalWorkedDisplay = totalWorkedMinutes > 0
      ? `${totalHours.toString().padStart(2, "0")}h ${totalMins.toString().padStart(2, "0")}m`
      : dayLogs.length > 0 && !dayLogs.some((l) => l.check_out)
        ? "In Progress"
        : "00h 00m";

    setSelectedEntry({
      employee: {
        id: emp.id,
        full_name: emp.full_name,
        branchName: emp.branches?.name,
      },
      date: dateStr,
      formattedDate,
      dayNumber: day,
      status,
      totalWorkedDisplay,
      sessions,
      deviceId,
      leave,
    });
  };

  const DAYS_IN_MONTH = new Date(year, month + 1, 0).getDate();
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Stats — compute by iterating all employee-days
  let statPresent = 0, statAbsent = 0, statApprLeave = 0, statUnapprLeave = 0, statOT = 0;
  for (const emp of employees) {
    for (let d = 1; d <= DAYS_IN_MONTH; d++) {
      const s = getStatus(emp.id, d);
      if (s === "PRESENT" || s === "LATE") statPresent++;
      else if (s === "ABSENT") statAbsent++;
      else if (s === "LEAVE_APPROVED") statApprLeave++;
      else if (s === "LEAVE_UNAPPROVED") statUnapprLeave++;
      else if (s === "OT") statOT++;
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1>Attendance Tracking</h1>
          <p>{MONTH_NAMES[month]} {year} — {employees.length} employees tracked</p>
        </div>
        <div className="flex gap-2">
          <Link href="/attendance/import" className="button button-secondary">
            📥 Import XLSX
          </Link>
          <button className="button button-secondary" onClick={() => setShowManual(true)}>
            ✏️ Manual Entry
          </button>
          <button className="button button-primary" onClick={handleSync} disabled={isSyncing}>
            {isSyncing ? "Syncing..." : "🔄 Sync Biometric"}
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex gap-4 mb-6 items-end">
        <div className="form-group min-w-[140px]">
          <label className="label">Month</label>
          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div className="form-group min-w-[100px]">
          <label className="label">Year</label>
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex gap-4 ml-auto">
          <div className="card stat-card py-2 px-4 min-w-[80px]">
            <span className="stat-label text-[0.65rem]">Present</span>
            <span className="stat-value text-xl">{statPresent}</span>
          </div>
          <div className="card stat-card py-2 px-4 min-w-[80px]">
            <span className="stat-label text-[0.65rem]">Absent</span>
            <span className="stat-value text-xl text-destructive">{statAbsent}</span>
          </div>
          <div className="card stat-card py-2 px-4 min-w-[80px]">
            <span className="stat-label text-[0.65rem]">Appr. Leave</span>
            <span className="stat-value text-xl" style={{color: "#3730a3"}}>{statApprLeave}</span>
          </div>
          <div className="card stat-card py-2 px-4 min-w-[80px]">
            <span className="stat-label text-[0.65rem]">Unappr. Leave</span>
            <span className="stat-value text-xl" style={{color: "#9d174d"}}>{statUnapprLeave}</span>
          </div>
          <div className="card stat-card py-2 px-4 min-w-[80px]">
            <span className="stat-label text-[0.65rem]">OT</span>
            <span className="stat-value text-xl">{statOT}</span>
          </div>
        </div>
      </div>

      {/* Attendance Grid */}
      <div className="card overflow-x-auto p-0">
        {loading ? (
          <p className="p-8 text-center text-muted-foreground">Loading records...</p>
        ) : employees.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">No employees found for this filter.</p>
        ) : (
          <table className="role-table text-xs">
            <thead>
              <tr>
                <th className="min-w-[160px] sticky left-0 bg-card z-[2]">Employee</th>
                {Array.from({ length: DAYS_IN_MONTH }).map((_, i) => (
                  <th key={i} className="text-center w-[30px] p-1">
                    <Link 
                      href={`/attendance/daily/${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`}
                      className="hover:bg-muted/50 w-full h-full rounded py-1 transition-colors cursor-pointer text-primary hover:text-primary/80 font-bold inline-block"
                      title="View Daily Sheet"
                    >
                      {i + 1}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td className="sticky left-0 bg-card z-[1]">
                    <div><strong>{emp.full_name}</strong></div>
                    <div className="text-muted-foreground text-[0.65rem]">{emp.branches?.name}</div>
                  </td>
                  {Array.from({ length: DAYS_IN_MONTH }).map((_, i) => {
                    const status = getStatus(emp.id, i + 1);
                    const cfg = STATUS_CONFIG[status];
                    return (
                      <td key={i} className="text-center p-0.5">
                        <button
                          type="button"
                          onClick={() => handleCellClick(emp, i + 1)}
                          title={`Day ${i + 1}: ${cfg.label} (Click for entry details)`}
                          className="w-6 h-6 rounded grid place-items-center font-semibold text-[0.6rem] mx-auto cursor-pointer transition-all duration-150 hover:scale-125 hover:shadow-md hover:ring-2 hover:ring-primary/60 focus:outline-none select-none border-0"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          {cfg.short}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="mt-6 flex gap-4 flex-wrap">
        {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG["-"]][]).filter(([k]) => k !== "-").map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ background: cfg.bg }} />
            <span className="text-muted-foreground text-[0.8rem]">{cfg.short} — {cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Attendance Details Modal (WCAG Compliant, Clean Square Geometry) */}
      {selectedEntry && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs grid place-items-center z-50 p-4"
          onClick={() => setSelectedEntry(null)}
          role="presentation"
        >
          <div 
            className="card w-full max-w-[420px] p-5 shadow-xl border border-border bg-card space-y-3.5 animate-in fade-in zoom-in-95 duration-150 relative rounded-none"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-modal-title"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-base" aria-hidden="true">🕒</span>
                <h2 id="attendance-modal-title" className="text-sm font-bold text-foreground tracking-wide uppercase">
                  Attendance Details
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="text-foreground hover:bg-muted text-xs w-7 h-7 flex items-center justify-center border border-border transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus:outline-none"
                aria-label="Close attendance details modal"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Employee Info & Status Line */}
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-foreground leading-snug">
                {selectedEntry.employee.full_name}
              </h3>
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium">{selectedEntry.formattedDate}</span>
                  <span className="text-muted-foreground font-bold" aria-hidden="true">•</span>
                  <span
                    className="px-2 py-0.5 text-[0.7rem] font-bold border inline-flex items-center gap-1.5"
                    style={{
                      background: STATUS_CONFIG[selectedEntry.status]?.bg || "var(--muted)",
                      color: STATUS_CONFIG[selectedEntry.status]?.color || "var(--foreground)",
                      borderColor: STATUS_CONFIG[selectedEntry.status]?.color ? `${STATUS_CONFIG[selectedEntry.status]?.color}60` : "currentColor",
                    }}
                  >
                    <span>{STATUS_CONFIG[selectedEntry.status]?.label || "No Record"}</span>
                  </span>
                </div>

                {selectedEntry.deviceId && selectedEntry.sessions.length > 0 && (
                  <span className="px-2 py-0.5 bg-muted text-[0.68rem] text-foreground font-mono font-semibold border border-border">
                    <span aria-hidden="true">📱</span> {selectedEntry.deviceId}
                  </span>
                )}
              </div>
            </div>

            {/* Total Worked Stat Banner */}
            <div className="flex items-center justify-between p-2.5 bg-muted/40 border border-border">
              <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Total Worked</span>
              <span className="text-sm font-bold font-mono text-primary">{selectedEntry.totalWorkedDisplay}</span>
            </div>

            {/* SESSIONS / PUNCH LOGS Table */}
            <div className="space-y-1">
              <span className="text-[0.68rem] uppercase font-bold tracking-wider text-muted-foreground block">
                SESSIONS / PUNCH LOGS
              </span>
              <div className="border border-border overflow-hidden">
                {selectedEntry.sessions.length > 0 ? (
                  <table className="w-full text-xs text-left border-collapse" role="table" aria-label="Punch Sessions">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border text-[0.65rem] uppercase font-bold text-foreground">
                        <th scope="col" className="py-2 px-3 w-8 text-center border-r border-border/60">#</th>
                        <th scope="col" className="py-2 px-3 border-r border-border/60">CHECK-IN</th>
                        <th scope="col" className="py-2 px-3 border-r border-border/60">CHECK-OUT</th>
                        <th scope="col" className="py-2 px-3 text-right">DURATION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 font-mono text-xs bg-card">
                      {selectedEntry.sessions.map((sess, idx) => (
                        <tr key={sess.id || idx} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 text-center text-muted-foreground font-semibold border-r border-border/60">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 text-foreground font-medium border-r border-border/60">
                            {sess.checkIn}
                          </td>
                          <td className="py-2 px-3 text-foreground font-medium border-r border-border/60">
                            {sess.checkOut === "In Progress" ? (
                              <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/40 text-[0.65rem] font-sans font-bold">
                                In Progress
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{sess.checkOut}</span>
                                {sess.autoCheckedOut && (
                                  <span
                                    className="px-1 py-0.2 text-[0.6rem] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-sans font-semibold inline-flex items-center gap-0.5"
                                    title="Auto checked out by 11:00 PM cron"
                                  >
                                    <span>🌙</span> Auto
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-primary">
                            {sess.duration}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-5 px-4 text-center space-y-1 bg-muted/20">
                    {selectedEntry.leave ? (
                      <>
                        <span className="text-xl block" aria-hidden="true">🌴</span>
                        <span className="font-bold text-xs text-foreground block">
                          {selectedEntry.leave.status === "APPROVED" ? "Approved Leave Request" : "Pending Leave Request"}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground font-medium block">
                        No punch sessions recorded for this day
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Action */}
            <div className="pt-2 border-t border-border">
              <Link
                href={`/attendance/employee/${selectedEntry.employee.id}?month=${month}&year=${year}`}
                className="w-full py-2.5 px-3 bg-secondary text-foreground hover:bg-secondary/80 border border-border font-semibold text-xs flex items-center justify-between transition-colors no-underline focus-visible:ring-2 focus-visible:ring-primary focus:outline-none"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">📅</span>
                  <span>Employee Monthly Attendance</span>
                </span>
                <span aria-hidden="true" className="text-sm font-bold">→</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showManual && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
          <div className="card w-full max-w-[450px]">
            <h2>Manual Attendance Entry</h2>
            <form onSubmit={handleManualMark} className="mt-4 flex flex-col gap-4">
              <div className="form-group">
                <label className="label">Employee</label>
                <select className="input" required value={manualForm.employee_id} onChange={(e) => setManualForm({ ...manualForm, employee_id: e.target.value })}>
                  <option value="">Select Employee</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="form-group flex-1">
                  <label className="label">Date</label>
                  <input className="input" type="date" required value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Status</label>
                  <select className="input" value={manualForm.status} onChange={(e) => setManualForm({ ...manualForm, status: e.target.value as AttendanceStatus })}>
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="LATE">Late</option>
                    <option value="OT">Overtime</option>
                    <option value="LEAVE_APPROVED">Leave (Approved)</option>
                    <option value="LEAVE_UNAPPROVED">Leave (Unapproved)</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="form-group flex-1">
                  <label className="label">Check-In Time</label>
                  <input className="input" type="time" value={manualForm.check_in} onChange={(e) => setManualForm({ ...manualForm, check_in: e.target.value })} />
                </div>
                <div className="form-group flex-1">
                  <label className="label">Check-Out Time</label>
                  <input className="input" type="time" value={manualForm.check_out} onChange={(e) => setManualForm({ ...manualForm, check_out: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <button type="button" className="button button-secondary" onClick={() => setShowManual(false)}>Cancel</button>
                <button type="submit" className="button button-primary">Mark Attendance</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

