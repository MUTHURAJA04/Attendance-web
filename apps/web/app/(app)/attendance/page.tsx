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

export default function AttendancePage() {
  const [employees, setEmployees] = useState<(Pick<Employee, "id" | "full_name" | "branch_id"> & { branches?: { name: string } | null })[]>([]);
  const [logs, setLogs] = useState<{ id: string; employee_id: string; check_in: string; check_out: string | null; status: string }[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<{ id: string; employee_id: string; start_date: string; end_date: string; status: string }[]>([]);
  const [branches, setBranches] = useState<Pick<Branch, "id" | "name">[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

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

  async function loadData() {
    if (tenantLoading) return;
    setLoading(true);
    // Use IST (Asia/Kolkata) for date range to avoid UTC mismatch
    const pad = (n: number) => String(n).padStart(2, "0");
    const startIST = `${year}-${pad(month + 1)}-01T00:00:00+05:30`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endIST = `${year}-${pad(month + 1)}-${pad(lastDay)}T23:59:59+05:30`;

    let empQuery = supabaseBrowser.from("employees").select("id, full_name, branch_id, branches(name)").eq("status", "ACTIVE");
    let logsQuery = supabaseBrowser
      .from("attendance_logs")
      .select("id, employee_id, check_in, check_out, status")
      .gte("check_in", startIST)
      .lte("check_in", endIST);
    let leavesQuery = supabaseBrowser
      .from("leave_requests")
      .select("id, employee_id, start_date, end_date, status, employees!inner(branch_id)")
      .in("status", ["APPROVED", "PENDING"])
      .gte("start_date", `${year}-${pad(month + 1)}-01`)
      .lte("end_date", `${year}-${pad(month + 1)}-${pad(lastDay)}`);

    if (globalBranch) {
      empQuery = empQuery.eq("branch_id", globalBranch.id);
      logsQuery = logsQuery.eq("branch_id", globalBranch.id);
      leavesQuery = leavesQuery.eq("employees.branch_id", globalBranch.id);
    }

    const [emps, syncLogs, branchRes, leavesRes] = await Promise.all([
      empQuery,
      logsQuery,
      supabaseBrowser.from("branches").select("id, name"),
      leavesQuery,
    ]);

    setEmployees((emps.data || []) as unknown as typeof employees);
    setLogs((syncLogs.data || []) as unknown as typeof logs);
    setBranches((branchRes.data || []) as unknown as typeof branches);
    setLeaveRequests((leavesRes.data || []) as unknown as typeof leaveRequests);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [month, year, globalBranch, tenantLoading]);

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
                      title="View Daily Details"
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
                        <div
                          title={cfg.label}
                          className="w-6 h-6 rounded grid place-items-center font-semibold text-[0.6rem] mx-auto"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          {cfg.short}
                        </div>
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
