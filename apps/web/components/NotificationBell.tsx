"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../lib/supabase/client";
import { useTenant } from "./TenantContext";
import { useAuth } from "./AuthGate";
import { logAudit } from "../lib/audit";
import type { LeaveType } from "../lib/types";

interface PendingLeaveItem {
  id: string;
  kind: "LEAVE_REQUEST";
  employee_id: string;
  employee_name: string;
  branch_name?: string | null;
  type: LeaveType | string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

interface UnclosedAttendanceItem {
  id: string;
  employee_id: string;
  employee_name: string;
  branch_name: string;
  check_in: string;
  check_in_formatted: string;
  date_str: string;
  custom_time: string; // e.g. "23:00"
  is_editing: boolean;
}

export function NotificationBell() {
  const { selectedBranch } = useTenant();
  const { role, userId, email } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "CHECKOUT" | "LEAVES">("ALL");
  const [leaveNotifications, setLeaveNotifications] = useState<PendingLeaveItem[]>([]);
  const [unclosedList, setUnclosedList] = useState<UnclosedAttendanceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch all pending notifications and unclosed punches
  const fetchAllNotifications = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch pending leave requests
      let leaveQuery = supabaseBrowser
        .from("leave_requests")
        .select("id, employee_id, type, start_date, end_date, reason, created_at, employees!inner(full_name, branch_id, branches(name))")
        .eq("status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(20);

      if (selectedBranch?.id) {
        leaveQuery = leaveQuery.eq("employees.branch_id", selectedBranch.id);
      }

      // 2. Fetch unclosed attendance logs where check_out IS NULL
      let logsQuery = supabaseBrowser
        .from("attendance_logs")
        .select("id, employee_id, check_in, check_out, metadata, branch_id, employees!inner(full_name, branch_id, branches(name))")
        .is("check_out", null)
        .order("check_in", { ascending: false })
        .limit(30);

      if (selectedBranch?.id) {
        logsQuery = logsQuery.eq("branch_id", selectedBranch.id);
      }

      const [leaveRes, logsRes] = await Promise.allSettled([leaveQuery, logsQuery]);

      if (leaveRes.status === "fulfilled" && !leaveRes.value.error && leaveRes.value.data) {
        const formatted: PendingLeaveItem[] = leaveRes.value.data.map((item: any) => ({
          id: item.id,
          kind: "LEAVE_REQUEST",
          employee_id: item.employee_id,
          employee_name: item.employees?.full_name || "Employee",
          branch_name: item.employees?.branches?.name || null,
          type: item.type,
          start_date: item.start_date,
          end_date: item.end_date,
          reason: item.reason,
          created_at: item.created_at,
        }));
        setLeaveNotifications(formatted);
      }

      if (logsRes.status === "fulfilled" && !logsRes.value.error && logsRes.value.data) {
        const formattedLogs: UnclosedAttendanceItem[] = logsRes.value.data.map((item: any) => {
          const checkInDate = new Date(item.check_in);
          const dateStr = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(checkInDate);

          const timeFormatted = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }).format(checkInDate);

          return {
            id: item.id,
            employee_id: item.employee_id,
            employee_name: item.employees?.full_name || "Staff",
            branch_name: item.employees?.branches?.name || "Branch",
            check_in: item.check_in,
            check_in_formatted: timeFormatted,
            date_str: dateStr,
            custom_time: "23:00",
            is_editing: false,
          };
        });
        setUnclosedList(formattedLogs);
      }
    } catch (err) {
      console.error("[NotificationBell] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch?.id]);

  useEffect(() => {
    fetchAllNotifications();

    // Supabase Real-time listener
    const channel = supabaseBrowser
      .channel("notifications_channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => {
        fetchAllNotifications();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () => {
        fetchAllNotifications();
      })
      .subscribe();

    const interval = setInterval(fetchAllNotifications, 30000);

    return () => {
      supabaseBrowser.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchAllNotifications]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Approve Auto Check-out (Default 11:00 PM IST)
  const handleApproveCheckout = async (item: UnclosedAttendanceItem) => {
    try {
      setActionLoadingId(item.id);
      const checkOutTime = `${item.date_str}T23:00:00+05:30`;

      const { error } = await supabaseBrowser
        .from("attendance_logs")
        .update({
          check_out: checkOutTime,
          metadata: {
            auto_checked_out: true,
            reviewed_by: email || "Manager",
            reviewed_at: new Date().toISOString(),
            action: "APPROVED_11PM",
          },
        })
        .eq("id", item.id);

      if (error) {
        alert(`Failed to approve check-out: ${error.message}`);
        return;
      }

      setUnclosedList((prev) => prev.filter((n) => n.id !== item.id));

      logAudit("ATTENDANCE_CHECKOUT_APPROVED", {
        log_id: item.id,
        employee_name: item.employee_name,
        check_out: checkOutTime,
      });
    } catch (err: any) {
      console.error("Approve error:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Modify & Save Custom Check-Out Time
  const handleSaveCustomCheckout = async (item: UnclosedAttendanceItem) => {
    try {
      setActionLoadingId(item.id);
      const timeVal = item.custom_time || "23:00";
      const checkOutTime = `${item.date_str}T${timeVal}:00+05:30`;

      const { error } = await supabaseBrowser
        .from("attendance_logs")
        .update({
          check_out: checkOutTime,
          metadata: {
            auto_checked_out: false,
            modified_manually: true,
            reviewed_by: email || "Manager",
            reviewed_at: new Date().toISOString(),
            custom_time: timeVal,
          },
        })
        .eq("id", item.id);

      if (error) {
        alert(`Failed to save custom check-out: ${error.message}`);
        return;
      }

      setUnclosedList((prev) => prev.filter((n) => n.id !== item.id));

      logAudit("ATTENDANCE_CHECKOUT_MODIFIED", {
        log_id: item.id,
        employee_name: item.employee_name,
        check_out: checkOutTime,
      });
    } catch (err: any) {
      console.error("Save custom time error:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Toggle inline editing state for an unclosed employee
  const toggleEdit = (id: string) => {
    setUnclosedList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, is_editing: !item.is_editing } : item
      )
    );
  };

  // Update custom time value
  const updateCustomTime = (id: string, timeVal: string) => {
    setUnclosedList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, custom_time: timeVal } : item
      )
    );
  };

  // Approve or Reject Leave Request
  const handleLeaveDecision = async (
    leaveId: string,
    decision: "APPROVED" | "REJECTED",
    item: PendingLeaveItem
  ) => {
    try {
      setActionLoadingId(leaveId);

      const { error } = await supabaseBrowser
        .from("leave_requests")
        .update({
          status: decision,
          approved_by: userId || null,
        })
        .eq("id", leaveId);

      if (error) {
        alert(`Failed to ${decision.toLowerCase()} leave: ${error.message}`);
        return;
      }

      setLeaveNotifications((prev) => prev.filter((n) => n.id !== leaveId));

      logAudit(
        decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        {
          leave_id: leaveId,
          employee: item.employee_name,
          leave_type: item.type,
          dates: `${item.start_date} to ${item.end_date}`,
        },
        {
          branchId: selectedBranch?.id,
          entityType: "leave_requests",
          entityId: leaveId,
        }
      );
    } catch (err) {
      console.error("[NotificationBell] update error:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatDateRange = (start: string, end: string) => {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const sStr = s.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const eStr = e.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const daysDiff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const daysText = daysDiff === 1 ? "1 day" : `${daysDiff} days`;

      if (start === end) {
        return `${eStr} (${daysText})`;
      }
      return `${sStr} – ${eStr} (${daysText})`;
    } catch {
      return `${start} – ${end}`;
    }
  };

  const totalUnreadCount = unclosedList.length + leaveNotifications.length;

  return (
    <div className="relative print:hidden" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-8 h-8 rounded-full bg-muted grid place-items-center text-sm cursor-pointer hover:bg-border transition-colors border border-border focus-visible:ring-2 focus-visible:ring-primary focus:outline-none"
        aria-label={`Notifications (${totalUnreadCount} pending)`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Notifications & Unclosed Check-Outs"
      >
        <span className="select-none" aria-hidden="true">🔔</span>

        {totalUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-rose-600 text-white text-[0.625rem] font-bold flex items-center justify-center shadow-xs animate-pulse">
            {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            role="presentation"
          />

          <div
            className="absolute right-0 top-full mt-2 w-84 sm:w-[440px] rounded-xl bg-card border border-border shadow-2xl z-50 overflow-hidden divide-y divide-border animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-label="Notifications Panel"
          >
            {/* Header */}
            <div className="p-3 bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">Notifications</span>
                {totalUnreadCount > 0 ? (
                  <span className="pill pill-destructive text-[0.65rem] font-bold">
                    {totalUnreadCount} Pending
                  </span>
                ) : (
                  <span className="pill pill-neutral text-[0.65rem]">0 New</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={fetchAllNotifications}
                  disabled={loading}
                  className="text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors cursor-pointer"
                  title="Refresh notifications"
                  aria-label="Refresh notifications"
                >
                  {loading ? "⏳" : "🔄"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground w-6 h-6 rounded flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
                  aria-label="Close notifications"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center px-3 py-1.5 bg-muted/20 border-b border-border text-xs gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("ALL")}
                className={`px-2.5 py-1 rounded text-[0.7rem] font-semibold transition-colors cursor-pointer ${
                  activeTab === "ALL" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                All ({unclosedList.length + leaveNotifications.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("CHECKOUT")}
                className={`px-2.5 py-1 rounded text-[0.7rem] font-semibold transition-colors cursor-pointer ${
                  activeTab === "CHECKOUT" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                🌙 Unclosed Check-Ins ({unclosedList.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("LEAVES")}
                className={`px-2.5 py-1 rounded text-[0.7rem] font-semibold transition-colors cursor-pointer ${
                  activeTab === "LEAVES" ? "bg-amber-600 text-white" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                📄 Leaves ({leaveNotifications.length})
              </button>
            </div>

            {/* Notification Items List */}
            <div className="max-h-[420px] overflow-y-auto divide-y divide-border/60">
              {unclosedList.length === 0 && leaveNotifications.length === 0 ? (
                <div className="p-6 text-center space-y-1.5 bg-card">
                  <span className="text-2xl block" aria-hidden="true">✨</span>
                  <div className="text-xs font-bold text-foreground">All caught up!</div>
                  <p className="text-[0.75rem] text-muted-foreground">
                    No unclosed employee check-outs or pending leave requests.
                  </p>
                </div>
              ) : (
                <>
                  {/* 1. UNCLOSED EMPLOYEE CHECK-OUTS (Approve 11 PM or Modify time) */}
                  {(activeTab === "ALL" || activeTab === "CHECKOUT") &&
                    unclosedList.map((item) => {
                      const isActing = actionLoadingId === item.id;

                      return (
                        <div
                          key={item.id}
                          className="p-3 hover:bg-muted/15 transition-colors bg-card text-xs space-y-2"
                        >
                          {/* Top Row: Employee Name & Check-in Time */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm shrink-0" aria-hidden="true">🌙</span>
                              <div className="min-w-0">
                                <div className="font-bold text-foreground text-[0.78rem] truncate">
                                  {item.employee_name}
                                </div>
                                <div className="text-[0.68rem] text-muted-foreground">
                                  In: <strong className="font-mono text-foreground">{item.check_in_formatted}</strong> ({item.date_str}) • <span className="text-amber-600 dark:text-amber-400 font-semibold">Not Checked Out</span>
                                </div>
                              </div>
                            </div>

                            {/* Right: Approve or Modify Buttons (Normal View) */}
                            {!item.is_editing && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleApproveCheckout(item)}
                                  className="button button-primary h-7 text-[0.7rem] px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer disabled:opacity-50"
                                  title="Approve check-out at default 11:00 PM IST"
                                >
                                  {isActing ? "…" : "✓ Approve (11 PM)"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => toggleEdit(item.id)}
                                  className="button button-secondary h-7 text-[0.7rem] px-2 font-medium cursor-pointer"
                                  title="Select custom check-out time"
                                >
                                  ✏️ Modify
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Expanded Inline Time Selector (Modify View) */}
                          {item.is_editing && (
                            <div className="p-2 rounded bg-muted/40 border border-border flex items-center justify-between gap-2 animate-in fade-in duration-100">
                              <div className="flex items-center gap-2">
                                <label className="text-[0.7rem] font-semibold text-foreground shrink-0">
                                  Check-out Time:
                                </label>
                                <input
                                  type="time"
                                  value={item.custom_time}
                                  onChange={(e) => updateCustomTime(item.id, e.target.value)}
                                  className="input h-7 text-xs px-2 font-mono w-28"
                                />
                              </div>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleSaveCustomCheckout(item)}
                                  className="button button-primary h-7 text-[0.7rem] px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer disabled:opacity-50"
                                >
                                  {isActing ? "…" : "Save"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => toggleEdit(item.id)}
                                  className="button button-secondary h-7 text-[0.7rem] px-2 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {/* 2. LEAVE REQUESTS (Single Line Layout with ✓ and ✕ Icons) */}
                  {(activeTab === "ALL" || activeTab === "LEAVES") &&
                    leaveNotifications.map((item) => {
                      const isActing = actionLoadingId === item.id;

                      return (
                        <div
                          key={item.id}
                          className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-muted/20 transition-colors bg-card text-xs select-none"
                        >
                          {/* Left: Info in a single line */}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              className="font-bold text-foreground text-[0.75rem] truncate shrink-0 max-w-[110px]"
                              title={`${item.employee_name}${item.branch_name ? ` (${item.branch_name})` : ""}`}
                            >
                              {item.employee_name}
                            </span>
                            <span className="pill text-[0.58rem] py-0 px-1.5 pill-warning font-bold shrink-0">
                              {item.type}
                            </span>
                            <span
                              className="text-[0.68rem] text-muted-foreground truncate"
                              title={`${formatDateRange(item.start_date, item.end_date)}${item.reason ? ` — "${item.reason}"` : ""}`}
                            >
                              📅 {formatDateRange(item.start_date, item.end_date)}
                            </span>
                          </div>

                          {/* Right: Approve (✓) / Reject (✕) */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleLeaveDecision(item.id, "APPROVED", item)}
                              className="w-6 h-6 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center transition cursor-pointer disabled:opacity-50 shadow-2xs"
                              title="Approve Leave"
                              aria-label="Approve Leave"
                            >
                              {isActing ? "…" : "✓"}
                            </button>
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleLeaveDecision(item.id, "REJECTED", item)}
                              className="w-6 h-6 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center transition cursor-pointer disabled:opacity-50 shadow-2xs"
                              title="Reject Leave"
                              aria-label="Reject Leave"
                            >
                              {isActing ? "…" : "✕"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 bg-muted/30 flex items-center justify-between text-xs">
              <Link
                href="/attendance"
                onClick={() => setIsOpen(false)}
                className="text-primary hover:underline font-semibold"
              >
                Attendance Grid →
              </Link>
              <Link
                href="/logs"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground font-semibold"
              >
                View Logs →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
