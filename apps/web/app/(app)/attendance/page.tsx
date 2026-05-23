"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import type { Employee, Branch, AttendanceStatus } from "../../../lib/types";

const STATUS_CONFIG: Record<AttendanceStatus | "-", { label: string; short: string; bg: string; color: string }> = {
  PRESENT: { label: "Present", short: "P", bg: "#dcfce7", color: "#166534" },
  ABSENT: { label: "Absent (2x ded.)", short: "A", bg: "#fee2e2", color: "#991b1b" },
  HALF_DAY: { label: "Half Day", short: "H", bg: "#fef3c7", color: "#92400e" },
  LATE: { label: "Late", short: "L", bg: "#fef9c3", color: "#854d0e" },
  OT: { label: "Overtime", short: "O", bg: "#dbeafe", color: "#1e40af" },
  LEAVE_APPROVED: { label: "Leave (Appr.)", short: "✓", bg: "#e0e7ff", color: "#3730a3" },
  LEAVE_UNAPPROVED: { label: "Leave (Unappr.)", short: "✗", bg: "#fce7f3", color: "#9d174d" },
  "-": { label: "No Record", short: "-", bg: "var(--muted)", color: "var(--muted-foreground)" },
};

export default function AttendancePage() {
  const [employees, setEmployees] = useState<(Pick<Employee, "id" | "full_name" | "branch_id"> & { branches?: { name: string } | null })[]>([]);
  const [logs, setLogs] = useState<{ id: string; employee_id: string; check_in: string; check_out: string | null; status: string }[]>([]);
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

    if (globalBranch) {
      empQuery = empQuery.eq("branch_id", globalBranch.id);
      logsQuery = logsQuery.eq("branch_id", globalBranch.id);
    }

    const [emps, syncLogs, branchRes] = await Promise.all([
      empQuery,
      logsQuery,
      supabaseBrowser.from("branches").select("id, name"),
    ]);

    setEmployees((emps.data || []) as unknown as typeof employees);
    setLogs((syncLogs.data || []) as unknown as typeof logs);
    setBranches((branchRes.data || []) as unknown as typeof branches);
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
    const log = logs.find(
      (l) => l.employee_id === empId && new Date(l.check_in).getDate() === day
    );
    return (log?.status as AttendanceStatus) || "-";
  };

  const DAYS_IN_MONTH = new Date(year, month + 1, 0).getDate();
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // Stats
  const totalPresent = logs.filter((l) => l.status === "PRESENT" || l.status === "LATE").length;
  const totalAbsent = logs.filter((l) => l.status === "ABSENT").length;
  const totalOT = logs.filter((l) => l.status === "OT").length;

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
        <div className="flex gap-2 min-w-[150px]">
          {/* Note: Branch selection is now handled globally via the Top Nav context switcher */}
        </div>
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
            <span className="stat-value text-xl">{totalPresent}</span>
          </div>
          <div className="card stat-card py-2 px-4 min-w-[80px]">
            <span className="stat-label text-[0.65rem]">Absent</span>
            <span className="stat-value text-xl text-destructive">{totalAbsent}</span>
          </div>
          <div className="card stat-card py-2 px-4 min-w-[80px]">
            <span className="stat-label text-[0.65rem]">OT</span>
            <span className="stat-value text-xl">{totalOT}</span>
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
                  <th key={i} className="text-center w-[30px] p-1">{i + 1}</th>
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
