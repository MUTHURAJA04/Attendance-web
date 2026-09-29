"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "../../../../../lib/supabase/client";
import { useTenant } from "../../../../../components/TenantContext";
import type { AttendanceLog, AttendanceStatus } from "../../../../../lib/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const STATUS_CONFIG: Record<string, { label: string; short: string; bg: string; color: string; border: string }> = {
  PRESENT: { label: "Present", short: "P", bg: "#dcfce7", color: "#166534", border: "#bbf7d0" },
  ABSENT: { label: "Absent", short: "A", bg: "#fee2e2", color: "#991b1b", border: "#fecaca" },
  HALF_DAY: { label: "Half Day", short: "HD", bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
  LATE: { label: "Late In", short: "L", bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  OT: { label: "Overtime", short: "OT", bg: "#ede9fe", color: "#5b21b6", border: "#ddd6fe" },
  LEAVE_APPROVED: { label: "Approved Leave", short: "L(A)", bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
  LEAVE_UNAPPROVED: { label: "Unapproved Leave", short: "L(U)", bg: "#fce7f3", color: "#9d174d", border: "#fbcfe8" },
  "-": { label: "No Record", short: "-", bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
};

interface EmployeeDetails {
  id: string;
  full_name: string;
  employee_code: string | null;
  role: string;
  department: string | null;
  branch_id: string;
  shift_start: string | null;
  shift_end: string | null;
  total_working_hours: number | null;
  branches?: { name: string } | null;
}

interface DayAttendanceRecord {
  day: number;
  dateStr: string;
  dayName: string;
  shiftDisplay: string;
  inTimeDisplay: string;
  outTimeDisplay: string;
  lateInDisplay: string;
  lateInMinutes: number;
  earlyOutDisplay: string;
  earlyOutMinutes: number;
  workAndOTDisplay: string;
  workMinutes: number;
  overtimeDisplay: string;
  overtimeMinutes: number;
  status: AttendanceStatus | "-";
  deviceId: string;
  rawFirstCheckIn: string | null;
  rawLastCheckOut: string | null;
  hasLogs: boolean;
  logCount: number;
}

interface PunchSession {
  id: string | null;
  checkIn: string; // HH:MM
  checkOut: string; // HH:MM
  status: AttendanceStatus;
}

interface EditPunchModalState {
  day: number;
  dateStr: string;
  punches: PunchSession[];
  overallStatus: AttendanceStatus;
  hasExistingPunches: boolean;
}

export default function EmployeeMonthlyAttendancePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeId = params.id as string;
  const { selectedBranch: globalBranch } = useTenant();

  const now = new Date();
  const initialMonth = searchParams.get("month") !== null ? Number(searchParams.get("month")) : now.getMonth();
  const initialYear = searchParams.get("year") !== null ? Number(searchParams.get("year")) : now.getFullYear();

  const [month, setMonth] = useState<number>(initialMonth);
  const [year, setYear] = useState<number>(initialYear);
  const [loading, setLoading] = useState(true);
  const [savingPunch, setSavingPunch] = useState(false);
  const [employee, setEmployee] = useState<EmployeeDetails | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<{ id: string; start_date: string; end_date: string; status: string }[]>([]);

  // Modification / Edit Modal State
  const [editModal, setEditModal] = useState<EditPunchModalState | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const loadData = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);

    const pad = (n: number) => String(n).padStart(2, "0");
    const startIST = `${year}-${pad(month + 1)}-01T00:00:00+05:30`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endIST = `${year}-${pad(month + 1)}-${pad(lastDay)}T23:59:59+05:30`;

    const [empRes, logsRes, leavesRes] = await Promise.all([
      supabaseBrowser
        .from("employees")
        .select("id, full_name, employee_code, role, department, branch_id, shift_start, shift_end, total_working_hours, branches(name)")
        .eq("id", employeeId)
        .single(),
      supabaseBrowser
        .from("attendance_logs")
        .select("id, employee_id, check_in, check_out, status, source, metadata")
        .eq("employee_id", employeeId)
        .gte("check_in", startIST)
        .lte("check_in", endIST)
        .order("check_in", { ascending: true }),
      supabaseBrowser
        .from("leave_requests")
        .select("id, start_date, end_date, status")
        .eq("employee_id", employeeId)
        .in("status", ["APPROVED", "PENDING"])
        .gte("start_date", `${year}-${pad(month + 1)}-01`)
        .lte("end_date", `${year}-${pad(month + 1)}-${pad(lastDay)}`),
    ]);

    if (empRes.data) {
      setEmployee(empRes.data as unknown as EmployeeDetails);
    }
    setLogs((logsRes.data || []) as unknown as AttendanceLog[]);
    setLeaveRequests(leavesRes.data || []);
    setLoading(false);
  }, [employeeId, month, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle ESC key for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editModal) {
        setEditModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editModal]);

  // Parse time helper (HH:MM or HH:MM:SS to minutes of day)
  const timeToMinutes = (timeStr: string | null): number | null => {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return isNaN(h) || isNaN(m) ? null : h * 60 + m;
  };

  // Format minutes into Xh Ym
  const formatMinutesToHours = (totalMins: number): string => {
    if (totalMins <= 0) return "—";
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // Format Date to HH:MM in IST
  const formatHHMM = (dateStr: string): string => {
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Computed day records
  const dayRecords: DayAttendanceRecord[] = useMemo(() => {
    if (!employee) return [];

    const pad = (n: number) => String(n).padStart(2, "0");
    const shiftStart = employee.shift_start || "09:00";
    const shiftEnd = employee.shift_end || "18:00";
    const shiftStartMins = timeToMinutes(shiftStart) ?? 9 * 60;
    const shiftEndMins = timeToMinutes(shiftEnd) ?? 18 * 60;
    const expectedShiftDurationMins = employee.total_working_hours
      ? Math.round(employee.total_working_hours * 60)
      : Math.max(0, shiftEndMins - shiftStartMins);

    const records: DayAttendanceRecord[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
      const dayName = dateObj.toLocaleDateString("en-IN", { weekday: "short" });

      const dayLogs = logs.filter((l) => {
        const checkInDate = new Date(l.check_in);
        return checkInDate.getDate() === d;
      });

      const firstLog = dayLogs.length > 0 ? dayLogs[0] : null;
      const lastLog =
        dayLogs.length > 0
          ? [...dayLogs].reverse().find((l) => l.check_out) || dayLogs[dayLogs.length - 1]
          : null;

      const leave = leaveRequests.find((lr) => {
        const start = new Date(lr.start_date + "T00:00:00");
        const end = new Date(lr.end_date + "T23:59:59");
        return dateObj >= start && dateObj <= end;
      });

      let inTimeDisplay = "—";
      let outTimeDisplay = "—";
      let lateInMinutes = 0;
      let lateInDisplay = "—";
      let earlyOutMinutes = 0;
      let earlyOutDisplay = "—";
      let workMinutes = 0;
      let workAndOTDisplay = "—";
      let overtimeMinutes = 0;
      let overtimeDisplay = "—";
      let status: AttendanceStatus | "-" = "-";
      let deviceId = "—";

      if (firstLog) {
        const inDate = new Date(firstLog.check_in);
        inTimeDisplay = inDate.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        const inMins = inDate.getHours() * 60 + inDate.getMinutes();
        if (inMins > shiftStartMins + 5) {
          lateInMinutes = inMins - shiftStartMins;
          lateInDisplay = `${lateInMinutes}m Late`;
        } else {
          lateInDisplay = "On Time";
        }

        const meta = firstLog.metadata as Record<string, unknown> | null;
        deviceId = (meta?.device_id as string) || (meta?.device as string) || (firstLog.source === "BIOMETRIC" ? "Biometric Device" : firstLog.source);
      }

      if (lastLog?.check_out) {
        const outDate = new Date(lastLog.check_out);
        outTimeDisplay = outDate.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

        const outMins = outDate.getHours() * 60 + outDate.getMinutes();
        if (outMins < shiftEndMins - 5) {
          earlyOutMinutes = shiftEndMins - outMins;
          earlyOutDisplay = `${earlyOutMinutes}m Early`;
        } else {
          earlyOutDisplay = "—";
        }

        let totalDurationMs = 0;
        dayLogs.forEach((l) => {
          if (l.check_out) {
            const diff = new Date(l.check_out).getTime() - new Date(l.check_in).getTime();
            if (diff > 0) totalDurationMs += diff;
          }
        });

        if (totalDurationMs > 0) {
          workMinutes = Math.floor(totalDurationMs / (1000 * 60));
          workAndOTDisplay = formatMinutesToHours(workMinutes);

          if (workMinutes > expectedShiftDurationMins) {
            overtimeMinutes = workMinutes - expectedShiftDurationMins;
            overtimeDisplay = formatMinutesToHours(overtimeMinutes);
          }
        }
      } else if (firstLog && !lastLog?.check_out) {
        outTimeDisplay = "In Progress";
        const diffMs = Date.now() - new Date(firstLog.check_in).getTime();
        if (diffMs > 0) {
          workMinutes = Math.floor(diffMs / (1000 * 60));
          workAndOTDisplay = `${formatMinutesToHours(workMinutes)} (Live)`;
        }
      }

      if (firstLog) {
        if (overtimeMinutes >= 60) {
          status = "OT";
        } else if (firstLog.status) {
          status = firstLog.status;
        } else if (lateInMinutes > 45) {
          status = "LATE";
        } else {
          status = "PRESENT";
        }
      } else if (leave) {
        status = leave.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_UNAPPROVED";
      } else {
        const isPastDate = new Date() >= new Date(year, month, d, 23, 59, 59);
        status = isPastDate ? "ABSENT" : "-";
      }

      records.push({
        day: d,
        dateStr,
        dayName,
        shiftDisplay: `${shiftStart.substring(0, 5)} – ${shiftEnd.substring(0, 5)}`,
        inTimeDisplay,
        outTimeDisplay,
        lateInDisplay,
        lateInMinutes,
        earlyOutDisplay,
        earlyOutMinutes,
        workAndOTDisplay,
        workMinutes,
        overtimeDisplay,
        overtimeMinutes,
        status,
        deviceId,
        rawFirstCheckIn: firstLog?.check_in || null,
        rawLastCheckOut: lastLog?.check_out || null,
        hasLogs: dayLogs.length > 0,
        logCount: dayLogs.length,
      });
    }

    return records;
  }, [employee, logs, leaveRequests, month, year, daysInMonth]);

  // Aggregate monthly stats
  const monthlyStats = useMemo(() => {
    let present = 0;
    let absent = 0;
    let leaves = 0;
    let lateCount = 0;
    let totalWorkMinutes = 0;
    let totalOTMinutes = 0;

    dayRecords.forEach((r) => {
      if (r.status === "PRESENT" || r.status === "OT" || r.status === "LATE" || r.status === "HALF_DAY") {
        present++;
      } else if (r.status === "ABSENT") {
        absent++;
      } else if (r.status === "LEAVE_APPROVED" || r.status === "LEAVE_UNAPPROVED") {
        leaves++;
      }

      if (r.lateInMinutes > 0) lateCount++;
      totalWorkMinutes += r.workMinutes;
      totalOTMinutes += r.overtimeMinutes;
    });

    return {
      present,
      absent,
      leaves,
      lateCount,
      totalWorkFormatted: formatMinutesToHours(totalWorkMinutes),
      totalOTFormatted: formatMinutesToHours(totalOTMinutes),
    };
  }, [dayRecords]);

  // Open Edit Modal for a given day
  const handleOpenEdit = (record: DayAttendanceRecord) => {
    const dayLogs = logs.filter((l) => new Date(l.check_in).getDate() === record.day);

    let punches: PunchSession[] = [];
    if (dayLogs.length > 0) {
      punches = dayLogs.map((l) => ({
        id: l.id,
        checkIn: formatHHMM(l.check_in),
        checkOut: l.check_out ? formatHHMM(l.check_out) : "",
        status: (l.status || "PRESENT") as AttendanceStatus,
      }));
    } else {
      punches = [
        {
          id: null,
          checkIn: employee?.shift_start?.substring(0, 5) || "09:00",
          checkOut: employee?.shift_end?.substring(0, 5) || "18:00",
          status: "PRESENT",
        },
      ];
    }

    setEditModal({
      day: record.day,
      dateStr: record.dateStr,
      punches,
      overallStatus: (record.status !== "-" ? record.status : "PRESENT") as AttendanceStatus,
      hasExistingPunches: record.hasLogs,
    });
  };

  // Add another punch entry to the modal
  const handleAddPunchSession = () => {
    if (!editModal) return;
    const lastSession = editModal.punches[editModal.punches.length - 1];
    let newIn = "19:00";
    let newOut = "21:00";

    if (lastSession && lastSession.checkOut) {
      const parts = lastSession.checkOut.split(":");
      const nextH = Math.min(23, parseInt(parts[0], 10) + 1);
      const nextEndH = Math.min(23, nextH + 2);
      newIn = `${String(nextH).padStart(2, "0")}:00`;
      newOut = `${String(nextEndH).padStart(2, "0")}:00`;
    }

    setEditModal({
      ...editModal,
      punches: [
        ...editModal.punches,
        {
          id: null,
          checkIn: newIn,
          checkOut: newOut,
          status: editModal.overallStatus,
        },
      ],
    });
  };

  // Remove a punch entry from the modal
  const handleRemovePunchSession = (index: number) => {
    if (!editModal || editModal.punches.length <= 1) return;
    const updated = [...editModal.punches];
    updated.splice(index, 1);
    setEditModal({ ...editModal, punches: updated });
  };

  // Update field in a specific punch entry
  const handleUpdatePunchField = (index: number, field: "checkIn" | "checkOut", value: string) => {
    if (!editModal) return;
    const updated = [...editModal.punches];
    updated[index] = { ...updated[index], [field]: value };
    setEditModal({ ...editModal, punches: updated });
  };

  const isNoPunchStatus = (status: AttendanceStatus | string) => {
    return status === "ABSENT" || status === "LEAVE_APPROVED" || status === "LEAVE_UNAPPROVED";
  };

  // Calculate live total duration across modal sessions
  const modalTotalWorkingDuration = useMemo(() => {
    if (!editModal || isNoPunchStatus(editModal.overallStatus)) return "0 hrs";
    let totalMins = 0;
    editModal.punches.forEach((p) => {
      const inM = timeToMinutes(p.checkIn);
      const outM = timeToMinutes(p.checkOut);
      if (inM !== null && outM !== null && outM > inM) {
        totalMins += outM - inM;
      }
    });
    return formatMinutesToHours(totalMins);
  }, [editModal]);

  // Save All Punches for the day
  const handleSavePunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal || !employee) return;

    setSavingPunch(true);
    const { dateStr, punches, overallStatus } = editModal;
    const startIST = `${dateStr}T00:00:00+05:30`;
    const endIST = `${dateStr}T23:59:59+05:30`;

    // 1. Delete all existing logs for this day to cleanly replace with new sessions
    await supabaseBrowser
      .from("attendance_logs")
      .delete()
      .eq("employee_id", employee.id)
      .gte("check_in", startIST)
      .lte("check_in", endIST);

    // 2. Insert new logs or handle absent / leave statuses
    if (isNoPunchStatus(overallStatus)) {
      await supabaseBrowser.from("attendance_logs").insert([
        {
          employee_id: employee.id,
          branch_id: employee.branch_id || globalBranch?.id,
          check_in: new Date(`${dateStr}T00:00:00+05:30`).toISOString(),
          check_out: null,
          status: overallStatus,
          source: "MANUAL",
          metadata: {
            modified_by: "ADMIN",
            note: overallStatus === "ABSENT"
              ? "Marked absent manually"
              : overallStatus === "LEAVE_APPROVED"
                ? "Marked leave (approved) manually"
                : "Marked leave (unapproved) manually",
          },
        },
      ]);
    } else {
      const inserts = punches
        .filter((p) => p.checkIn)
        .map((p, idx) => {
          const inISO = new Date(`${dateStr}T${p.checkIn}:00+05:30`).toISOString();
          const outISO = p.checkOut ? new Date(`${dateStr}T${p.checkOut}:00+05:30`).toISOString() : null;

          return {
            employee_id: employee.id,
            branch_id: employee.branch_id || globalBranch?.id,
            check_in: inISO,
            check_out: outISO,
            status: overallStatus,
            source: "MANUAL",
            metadata: {
              modified_by: "ADMIN",
              session_index: idx + 1,
              note: punches.length > 1 ? `Session ${idx + 1} of ${punches.length}` : "Manual entry",
            },
          };
        });

      if (inserts.length > 0) {
        await supabaseBrowser.from("attendance_logs").insert(inserts);
      }
    }

    setSavingPunch(false);
    setEditModal(null);
    setActionSuccessMsg(`Punches updated for ${dateStr}.`);
    setTimeout(() => setActionSuccessMsg(null), 4000);
    await loadData();
  };

  // Delete / Clear all punches for a day
  const handleDeletePunch = async () => {
    if (!editModal || !employee) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete all punches for ${editModal.dateStr}?`
    );
    if (!confirmDelete) return;

    setSavingPunch(true);
    const startIST = `${editModal.dateStr}T00:00:00+05:30`;
    const endIST = `${editModal.dateStr}T23:59:59+05:30`;

    await supabaseBrowser
      .from("attendance_logs")
      .delete()
      .eq("employee_id", employee.id)
      .gte("check_in", startIST)
      .lte("check_in", endIST);

    setSavingPunch(false);
    setEditModal(null);
    setActionSuccessMsg(`Punches cleared for ${editModal.dateStr}.`);
    setTimeout(() => setActionSuccessMsg(null), 4000);
    await loadData();
  };

  // Excel Export Handler
  const handleExportExcel = () => {
    if (!employee || dayRecords.length === 0) return;

    const rows = [
      ["Employee Monthly Attendance Report"],
      [`Employee Name: ${employee.full_name}`, `Code: ${employee.employee_code || "N/A"}`, `Branch: ${employee.branches?.name || "All Branches"}`],
      [`Period: ${MONTH_NAMES[month]} ${year}`, `Shift: ${employee.shift_start || "09:00"} - ${employee.shift_end || "18:00"}`],
      [],
      [
        "Date",
        "Day",
        "Shift",
        "IN Time",
        "Late In",
        "Erl Out",
        "OUT Time",
        "Work+OT",
        "Over Time",
        "Status",
        "Device / Source"
      ],
      ...dayRecords.map((r) => [
        r.dateStr,
        r.dayName,
        r.shiftDisplay,
        r.inTimeDisplay,
        r.lateInDisplay,
        r.earlyOutDisplay,
        r.outTimeDisplay,
        r.workAndOTDisplay,
        r.overtimeDisplay,
        STATUS_CONFIG[r.status]?.label || r.status,
        r.deviceId,
      ]),
      [],
      ["Summary Totals:"],
      [`Total Days: ${daysInMonth}`, `Present: ${monthlyStats.present}`, `Absent: ${monthlyStats.absent}`, `Leaves: ${monthlyStats.leaves}`],
      [`Late In Count: ${monthlyStats.lateCount}`, `Total Working Hours: ${monthlyStats.totalWorkFormatted}`, `Total Overtime: ${monthlyStats.totalOTFormatted}`],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    worksheet["!cols"] = [
      { wch: 14 },
      { wch: 8 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 18 },
      { wch: 22 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly Attendance");

    const sanitizedName = employee.full_name.replace(/[^a-zA-Z0-9]/g, "_");
    XLSX.writeFile(
      workbook,
      `Attendance_${sanitizedName}_${MONTH_NAMES[month]}_${year}.xlsx`
    );
  };

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  if (loading && !employee) {
    return (
      <main className="p-8 max-w-7xl mx-auto space-y-6" aria-label="Loading employee attendance">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-muted rounded"></div>
          <div className="h-12 w-64 bg-muted rounded"></div>
          <div className="h-32 bg-muted rounded-xl"></div>
        </div>
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="p-8 max-w-7xl mx-auto text-center space-y-4">
        <h1 className="text-xl font-bold">Employee Not Found</h1>
        <p className="text-muted-foreground text-sm">Could not find attendance details for the requested employee.</p>
        <Link href="/attendance" className="button button-primary inline-block">
          ← Back to Attendance
        </Link>
      </main>
    );
  }

  return (
    <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Success Notification Alert */}
      {actionSuccessMsg && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-semibold flex items-center justify-between"
        >
          <span>✓ {actionSuccessMsg}</span>
          <button
            type="button"
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 font-bold px-1"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Breadcrumb */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <Link
            href="/attendance"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2 transition-colors font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            ← Back to Attendance Sheet
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {employee.full_name}
            </h1>
            {employee.employee_code && (
              <span className="pill text-xs font-mono font-bold bg-muted/60 text-muted-foreground">
                {employee.employee_code}
              </span>
            )}
          </div>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {employee.role} {employee.department ? `• ${employee.department}` : ""} {employee.branches?.name ? `• ${employee.branches.name}` : ""}
          </p>
        </div>

        {/* Action Controls: Month selector, Quick Add, and Excel Export */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-card border border-border rounded-lg p-1 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-muted rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              title="Previous Month"
              aria-label="Previous Month"
            >
              ◀
            </button>
            <div className="px-3 py-1 font-bold text-sm select-none" aria-live="polite">
              {MONTH_NAMES[month]} {year}
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-muted rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              title="Next Month"
              aria-label="Next Month"
            >
              ▶
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const todayDay = new Date().getDate();
              const rec = dayRecords.find((r) => r.day === todayDay) || dayRecords[0];
              if (rec) handleOpenEdit(rec);
            }}
            className="button button-secondary flex items-center gap-1.5 text-xs md:text-sm font-bold shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Add or modify punch entries"
          >
            <span>+</span>
            <span>Add / Edit Punch</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="button button-primary flex items-center gap-2 text-xs md:text-sm font-bold shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Export attendance to Excel spreadsheet"
          >
            <span>📥</span>
            <span>Export Excel</span>
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section aria-labelledby="monthly-summary-heading">
        <h2 id="monthly-summary-heading" className="sr-only">Monthly Attendance Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-3.5 border-l-4 border-l-primary bg-card/80">
            <span className="text-[0.68rem] uppercase font-bold text-muted-foreground tracking-wider block">Shift Timing</span>
            <span className="text-sm font-extrabold text-foreground block mt-1">
              {employee.shift_start || "09:00"} – {employee.shift_end || "18:00"}
            </span>
            <span className="text-[0.65rem] text-muted-foreground block mt-0.5">
              {employee.total_working_hours || 9} hrs standard
            </span>
          </div>

          <div className="card p-3.5 border-l-4 border-l-emerald-500 bg-emerald-500/5">
            <span className="text-[0.68rem] uppercase font-bold text-emerald-700 dark:text-emerald-400 tracking-wider block">Present Days</span>
            <span className="text-xl font-extrabold text-emerald-600 block mt-1">
              {monthlyStats.present}
            </span>
            <span className="text-[0.65rem] text-muted-foreground block mt-0.5">
              Out of {daysInMonth} days
            </span>
          </div>

          <div className="card p-3.5 border-l-4 border-l-rose-500 bg-rose-500/5">
            <span className="text-[0.68rem] uppercase font-bold text-rose-700 dark:text-rose-400 tracking-wider block">Absent Days</span>
            <span className="text-xl font-extrabold text-rose-600 block mt-1">
              {monthlyStats.absent}
            </span>
            <span className="text-[0.65rem] text-muted-foreground block mt-0.5">
              Uninformed
            </span>
          </div>

          <div className="card p-3.5 border-l-4 border-l-amber-500 bg-amber-500/5">
            <span className="text-[0.68rem] uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider block">Late In Count</span>
            <span className="text-xl font-extrabold text-amber-600 block mt-1">
              {monthlyStats.lateCount}
            </span>
            <span className="text-[0.65rem] text-muted-foreground block mt-0.5">
              Past grace period
            </span>
          </div>

          <div className="card p-3.5 border-l-4 border-l-blue-500 bg-blue-500/5">
            <span className="text-[0.68rem] uppercase font-bold text-blue-700 dark:text-blue-400 tracking-wider block">Leaves</span>
            <span className="text-xl font-extrabold text-blue-600 block mt-1">
              {monthlyStats.leaves}
            </span>
            <span className="text-[0.65rem] text-muted-foreground block mt-0.5">
              Approved / Pending
            </span>
          </div>

          <div className="card p-3.5 border-l-4 border-l-purple-500 bg-purple-500/5">
            <span className="text-[0.68rem] uppercase font-bold text-purple-700 dark:text-purple-400 tracking-wider block">Total Work + OT</span>
            <span className="text-xl font-extrabold text-purple-600 block mt-1">
              {monthlyStats.totalWorkFormatted}
            </span>
            <span className="text-[0.65rem] text-muted-foreground block mt-0.5">
              OT: {monthlyStats.totalOTFormatted}
            </span>
          </div>
        </div>
      </section>

      {/* Main Monthly Attendance Table with Edit Action */}
      <section className="card overflow-hidden shadow-sm border border-border/70 p-0" aria-labelledby="table-heading">
        <div className="px-5 py-4 border-b border-border/60 flex justify-between items-center bg-muted/20">
          <div>
            <h2 id="table-heading" className="text-base font-bold text-foreground">
              {MONTH_NAMES[month]} {year} Daily Breakdown
            </h2>
            <p className="text-xs text-muted-foreground">
              Day-by-day punches, sessions, late arrival, early departure, and active hours.
            </p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {daysInMonth} Days Recorded
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm" aria-label="Monthly Attendance Daily Records">
            <thead>
              <tr className="border-b border-border/80 bg-muted/40 font-bold text-muted-foreground text-[0.72rem] uppercase tracking-wider">
                <th scope="col" className="py-3 px-3.5">Date / Day</th>
                <th scope="col" className="py-3 px-3">Shift</th>
                <th scope="col" className="py-3 px-3">IN Time</th>
                <th scope="col" className="py-3 px-3">Late In</th>
                <th scope="col" className="py-3 px-3">Erl Out</th>
                <th scope="col" className="py-3 px-3">OUT Time</th>
                <th scope="col" className="py-3 px-3">Work + OT</th>
                <th scope="col" className="py-3 px-3">Over Time</th>
                <th scope="col" className="py-3 px-3 text-center">Status</th>
                <th scope="col" className="py-3 px-3">Device / Info</th>
                <th scope="col" className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {dayRecords.map((record) => {
                const statusCfg = STATUS_CONFIG[record.status] || STATUS_CONFIG["-"];
                const isSunday = record.dayName === "Sun";

                return (
                  <tr
                    key={record.day}
                    className={`hover:bg-muted/30 transition-colors ${
                      isSunday ? "bg-muted/10 font-medium" : ""
                    }`}
                  >
                    {/* Date / Day */}
                    <td className="py-2.5 px-3.5 font-semibold text-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 text-right font-bold text-muted-foreground text-xs">
                          {record.day}
                        </span>
                        <span>{MONTH_NAMES[month].substring(0, 3)}</span>
                        <span
                          className={`text-[0.68rem] px-1.5 py-0.5 rounded font-bold uppercase ${
                            isSunday ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {record.dayName}
                        </span>
                      </div>
                    </td>

                    {/* Shift */}
                    <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {record.shiftDisplay}
                    </td>

                    {/* IN Time */}
                    <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                      {record.inTimeDisplay !== "—" ? (
                        <span className="text-foreground font-bold">{record.inTimeDisplay}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>

                    {/* Late In */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {record.lateInMinutes > 0 ? (
                        <span className="pill text-[0.68rem] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          {record.lateInDisplay}
                        </span>
                      ) : record.lateInDisplay === "On Time" ? (
                        <span className="text-[0.68rem] text-emerald-600 dark:text-emerald-400 font-semibold">
                          ✓ On Time
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>

                    {/* Erl Out */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {record.earlyOutMinutes > 0 ? (
                        <span className="pill text-[0.68rem] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                          {record.earlyOutDisplay}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>

                    {/* OUT Time */}
                    <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                      {record.outTimeDisplay === "In Progress" ? (
                        <span className="pill text-[0.68rem] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 animate-pulse">
                          In Progress
                        </span>
                      ) : record.outTimeDisplay !== "—" ? (
                        <span className="text-foreground font-bold">{record.outTimeDisplay}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>

                    {/* Work + OT */}
                    <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                      {record.workAndOTDisplay !== "—" ? (
                        <span className="text-foreground">{record.workAndOTDisplay}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>

                    {/* Over Time */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {record.overtimeMinutes > 0 ? (
                        <span className="pill text-[0.68rem] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                          +{record.overtimeDisplay}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className="inline-block px-2.5 py-1 rounded-md text-xs font-bold shadow-2xs border"
                        style={{
                          background: statusCfg.bg,
                          color: statusCfg.color,
                          borderColor: statusCfg.border,
                        }}
                      >
                        {statusCfg.label}
                      </span>
                    </td>

                    {/* Device / Punch Info */}
                    <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {record.deviceId !== "—" && (
                          <span className="font-mono text-[0.68rem] bg-muted/70 px-1.5 py-0.5 rounded border border-border/60">
                            {record.deviceId.length > 12 ? `${record.deviceId.substring(0, 12)}…` : record.deviceId}
                          </span>
                        )}
                        {record.logCount > 1 && (
                          <span className="pill text-[0.62rem] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                            {record.logCount} entries
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Action Button: Edit / Add Punch */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(record)}
                        className={`text-xs py-1 px-2.5 rounded-md font-semibold border transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                          record.hasLogs
                            ? "bg-muted hover:bg-muted/80 text-foreground border-border"
                            : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                        }`}
                        title={`Edit attendance punches for ${record.dateStr}`}
                        aria-label={`Edit attendance punches for Day ${record.day}, ${record.dateStr}`}
                      >
                        {record.hasLogs ? "✏️ Edit" : "+ Punch"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Minimal Punch Modal */}
      {editModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs grid place-items-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-modal-title"
          onClick={() => setEditModal(null)}
        >
          <div
            className="card w-full max-w-[420px] max-h-[85vh] overflow-y-auto p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-border/60 pb-3">
              <div>
                <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground font-bold">
                  Day {editModal.day} • {editModal.hasExistingPunches ? "Edit Punches" : "New Entry"}
                </span>
                <h3 id="edit-modal-title" className="text-base font-bold text-foreground mt-0.5">
                  {employee.full_name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {editModal.dateStr} ({MONTH_NAMES[month]} {year})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="text-muted-foreground hover:text-foreground text-base w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSavePunch} className="space-y-3.5">
              {/* Overall Status Select */}
              <div className="form-group">
                <label htmlFor="edit-status" className="label text-xs font-bold text-foreground">
                  Status
                </label>
                <select
                  id="edit-status"
                  value={editModal.overallStatus}
                  onChange={(e) =>
                    setEditModal({ ...editModal, overallStatus: e.target.value as AttendanceStatus })
                  }
                  className="input text-xs font-semibold py-1.5"
                  required
                >
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="LATE">Late</option>
                  <option value="OT">Overtime</option>
                  <option value="LEAVE_APPROVED">Leave (Approved)</option>
                  <option value="LEAVE_UNAPPROVED">Leave (Unapproved)</option>
                </select>
              </div>

              {/* Minimal Punch Rows vs Absent/Leave Banner */}
              {!isNoPunchStatus(editModal.overallStatus) ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-foreground">
                      Punches ({editModal.punches.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddPunchSession}
                      className="button button-secondary text-xs py-1 px-2.5 font-bold flex items-center gap-1 shadow-2xs hover:bg-muted"
                      title="Add another check-in / check-out punch"
                    >
                      <span>+</span>
                      <span>Add Punch</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {editModal.punches.map((punch, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-muted/40 p-2.5 rounded-lg border border-border/60"
                      >
                        <span className="text-[0.68rem] font-bold text-muted-foreground w-4 text-center">
                          #{idx + 1}
                        </span>

                        <div className="flex-1">
                          <label
                            htmlFor={`checkin-${idx}`}
                            className="text-[0.6rem] uppercase font-bold text-muted-foreground block mb-0.5"
                          >
                            IN
                          </label>
                          <input
                            id={`checkin-${idx}`}
                            type="time"
                            value={punch.checkIn}
                            onChange={(e) => handleUpdatePunchField(idx, "checkIn", e.target.value)}
                            required
                            className="input text-xs font-semibold py-1 px-2 h-7.5"
                          />
                        </div>

                        <span className="text-muted-foreground text-xs mt-3.5 font-bold">→</span>

                        <div className="flex-1">
                          <label
                            htmlFor={`checkout-${idx}`}
                            className="text-[0.6rem] uppercase font-bold text-muted-foreground block mb-0.5"
                          >
                            OUT
                          </label>
                          <input
                            id={`checkout-${idx}`}
                            type="time"
                            value={punch.checkOut}
                            onChange={(e) => handleUpdatePunchField(idx, "checkOut", e.target.value)}
                            className="input text-xs font-semibold py-1 px-2 h-7.5"
                          />
                        </div>

                        {editModal.punches.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePunchSession(idx)}
                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-500/10 p-1.5 rounded text-sm mt-3.5 transition-colors"
                            title="Delete this punch"
                            aria-label={`Delete punch ${idx + 1}`}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total Duration Pill */}
                  <div className="flex justify-between items-center px-3 py-2 bg-primary/5 rounded-md border border-primary/15 text-xs font-semibold">
                    <span className="text-muted-foreground">Total Working Time:</span>
                    <span className="text-primary font-bold">{modalTotalWorkingDuration}</span>
                  </div>
                </div>
              ) : (
                <div
                  className={`p-3.5 rounded-lg text-xs border ${
                    editModal.overallStatus === "LEAVE_APPROVED"
                      ? "bg-blue-500/10 border-blue-500/25 text-blue-700 dark:text-blue-300"
                      : editModal.overallStatus === "LEAVE_UNAPPROVED"
                        ? "bg-pink-500/10 border-pink-500/25 text-pink-700 dark:text-pink-300"
                        : "bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {editModal.overallStatus === "LEAVE_APPROVED" ? (
                    <>🌴 Marked as <strong>Leave (Approved)</strong>. No punch records are required for approved leave.</>
                  ) : editModal.overallStatus === "LEAVE_UNAPPROVED" ? (
                    <>⚠️ Marked as <strong>Leave (Unapproved)</strong>. No punch records are required for unapproved leave.</>
                  ) : (
                    <>⚠️ Marked as <strong>Absent</strong>. All punches will be cleared for this date.</>
                  )}
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                {editModal.hasExistingPunches ? (
                  <button
                    type="button"
                    onClick={handleDeletePunch}
                    disabled={savingPunch}
                    className="button button-destructive text-xs py-1.5 px-2.5 flex items-center gap-1"
                    title="Clear all punches for this day"
                  >
                    <span>🗑</span>
                    <span>Clear</span>
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditModal(null)}
                    disabled={savingPunch}
                    className="button button-secondary text-xs py-1.5 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPunch}
                    className="button button-primary text-xs py-1.5 px-4 font-bold shadow-sm"
                  >
                    {savingPunch ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
