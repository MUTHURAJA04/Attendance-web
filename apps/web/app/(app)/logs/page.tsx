"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import { useAuth } from "../../../components/AuthGate";

export interface AuditLogItem {
  id: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: Record<string, any> | string | null;
  user_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  branch_id?: string | null;
  branch_name?: string | null;
  performed_at: string;
}

// ── Human-Readable Action Formatter ──
function formatAction(actionRaw: string): { title: string; category: string; badgeColor: string; icon: string } {
  const act = (actionRaw || "").trim();
  const actUpper = act.toUpperCase();

  // Employee actions
  if (actUpper === "EMPLOYEE_RECORD_CREATE" || act === "employee_created" || actUpper.includes("EMPLOYEE_CREATE")) {
    return { title: "New employee created", category: "EMPLOYEE", badgeColor: "pill-success", icon: "👤" };
  }
  if (act === "employee_updated" || actUpper.includes("EMPLOYEE_UPDATE")) {
    return { title: "Employee profile updated", category: "EMPLOYEE", badgeColor: "pill-neutral", icon: "✏️" };
  }
  if (act === "employee_deleted" || actUpper.includes("EMPLOYEE_DELETE")) {
    return { title: "Employee record deleted", category: "EMPLOYEE", badgeColor: "pill-destructive", icon: "🗑️" };
  }
  if (act === "employee_disabled" || actUpper.includes("EMPLOYEE_DEACTIVATE")) {
    return { title: "Employee deactivated", category: "EMPLOYEE", badgeColor: "pill-destructive", icon: "🚫" };
  }
  if (act === "employee_enabled" || actUpper.includes("EMPLOYEE_ACTIVATE")) {
    return { title: "Employee reactivated", category: "EMPLOYEE", badgeColor: "pill-success", icon: "✅" };
  }
  if (act === "employee_marked_left" || actUpper.includes("EMPLOYEE_LEFT")) {
    return { title: "Employee marked as Left", category: "EMPLOYEE", badgeColor: "pill-warning", icon: "🚪" };
  }

  // Branch & Rules
  if (act === "branch_created" || actUpper.includes("BRANCH_CREATE")) {
    return { title: "New branch created", category: "SETTINGS", badgeColor: "pill-success", icon: "🏢" };
  }
  if (act === "branch_updated" || actUpper.includes("BRANCH_UPDATE")) {
    return { title: "Branch details updated", category: "SETTINGS", badgeColor: "pill-neutral", icon: "🏢" };
  }
  if (act === "branch_rule_created") {
    return { title: "Leave & Late rule created", category: "RULES", badgeColor: "pill-success", icon: "⚙️" };
  }
  if (act === "branch_rule_updated") {
    return { title: "Leave & Late rule updated", category: "RULES", badgeColor: "pill-neutral", icon: "⚙️" };
  }
  if (act === "branch_rule_deleted") {
    return { title: "Leave & Late rule deleted", category: "RULES", badgeColor: "pill-destructive", icon: "🗑️" };
  }
  if (act === "branch_rule_activated") {
    return { title: "Leave & Late rule enabled", category: "RULES", badgeColor: "pill-success", icon: "✅" };
  }
  if (act === "branch_rule_deactivated") {
    return { title: "Leave & Late rule disabled", category: "RULES", badgeColor: "pill-muted", icon: "⏸️" };
  }

  // Attendance
  if (actUpper === "PUNCH_CHECK_IN" || act === "attendance_punch_in" || act === "check_in") {
    return { title: "Clock In (Check-in)", category: "ATTENDANCE", badgeColor: "pill-success", icon: "🟢" };
  }
  if (actUpper === "PUNCH_CHECK_OUT" || act === "attendance_punch_out" || act === "check_out") {
    return { title: "Clock Out (Check-out)", category: "ATTENDANCE", badgeColor: "pill-neutral", icon: "🔴" };
  }
  if (act === "auto_checkout_cron_executed" || actUpper.includes("AUTO_CHECKOUT")) {
    return { title: "11:00 PM Auto Check-Out Completed", category: "ATTENDANCE", badgeColor: "pill-warning", icon: "🌙" };
  }
  if (act === "attendance_manual_override" || act === "attendance_edit" || actUpper.includes("ATTENDANCE_EDIT")) {
    return { title: "Attendance punch adjusted", category: "ATTENDANCE", badgeColor: "pill-warning", icon: "⏱️" };
  }

  // Leaves
  if (actUpper === "LEAVE_REQUEST" || act === "leave_requested") {
    return { title: "Leave request submitted", category: "LEAVES", badgeColor: "pill-warning", icon: "📄" };
  }
  if (actUpper === "LEAVE_APPROVED" || act === "leave_approved") {
    return { title: "Leave request approved", category: "LEAVES", badgeColor: "pill-success", icon: "✓" };
  }
  if (actUpper === "LEAVE_REJECTED" || act === "leave_rejected") {
    return { title: "Leave request rejected", category: "LEAVES", badgeColor: "pill-destructive", icon: "✗" };
  }

  // Loans & Advances
  if (actUpper === "LOAN_CREATE" || act === "loan_created" || actUpper === "LOAN_ACTIVE") {
    return { title: "Loan / Advance disbursed", category: "LOANS", badgeColor: "pill-warning", icon: "💳" };
  }
  if (act === "loan_writeoff" || actUpper.includes("WRITEOFF")) {
    return { title: "Loan balance written off", category: "LOANS", badgeColor: "pill-destructive", icon: "📉" };
  }
  if (act === "loan_restored" || actUpper.includes("RESTORE")) {
    return { title: "Written-off loan restored", category: "LOANS", badgeColor: "pill-success", icon: "♻️" };
  }

  // Payroll
  if (act === "payroll_calculated" || act === "calculate_payroll" || actUpper.includes("PAYROLL_COMPUTE")) {
    return { title: "Payroll calculated & generated", category: "PAYROLL", badgeColor: "pill-success", icon: "💰" };
  }
  if (act === "payroll_period_locked" || actUpper.includes("PERIOD_LOCKED")) {
    return { title: "Payroll period finalized & locked", category: "PAYROLL", badgeColor: "pill-neutral", icon: "🔒" };
  }
  if (act === "payroll_period_open" || actUpper.includes("PERIOD_OPEN")) {
    return { title: "Payroll period reopened", category: "PAYROLL", badgeColor: "pill-warning", icon: "🔓" };
  }
  if (act === "salary_structure_updated" || actUpper.includes("SALARY_UPDATE")) {
    return { title: "Salary structure updated", category: "PAYROLL", badgeColor: "pill-neutral", icon: "💵" };
  }

  // Documents & Holidays
  if (act === "document_uploaded") {
    return { title: "Staff document uploaded", category: "EMPLOYEE", badgeColor: "pill-neutral", icon: "📎" };
  }
  if (act === "document_deleted") {
    return { title: "Staff document removed", category: "EMPLOYEE", badgeColor: "pill-destructive", icon: "🗑️" };
  }
  if (act === "holiday_created") {
    return { title: "Holiday added to calendar", category: "SETTINGS", badgeColor: "pill-success", icon: "📅" };
  }

  // Clean fallback for any generic snake_case / uppercase strings
  const formatted = act
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    title: formatted || "System Event",
    category: "SYSTEM",
    badgeColor: "pill-neutral",
    icon: "📋",
  };
}

// ── Render Rich Inline Event Details ──
function renderEventDetails(details: any, entityType?: string | null): React.ReactNode {
  if (!details) {
    return <span className="text-muted-foreground text-[0.7rem]">—</span>;
  }

  let data = details;
  if (typeof details === "string") {
    try {
      data = JSON.parse(details);
    } catch {
      return (
        <span className="text-[0.72rem] text-foreground font-medium truncate block max-w-md" title={details}>
          {details}
        </span>
      );
    }
  }

  if (typeof data !== "object" || data === null) {
    return (
      <span className="text-[0.72rem] text-foreground font-medium truncate block max-w-md" title={String(data)}>
        {String(data)}
      </span>
    );
  }

  const entries = Object.entries(data).filter(([k, v]) => v !== undefined && v !== null && k !== "id");

  if (entries.length === 0) {
    return <span className="text-muted-foreground text-[0.7rem]">—</span>;
  }

  // Format keys into clean labels
  const formatKey = (k: string) =>
    k
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace("Emp ", "Staff ")
      .replace("Employee ", "Staff ");

  // Format values
  const formatVal = (k: string, v: any) => {
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (Array.isArray(v)) {
      if (v.length === 0) return "None";
      if (typeof v[0] === "object" && v[0]?.employee_name) {
        return v.map((e: any) => e.employee_name).join(", ");
      }
      return v.join(", ");
    }
    if (typeof v === "object") return JSON.stringify(v);
    if (k.includes("amount") || k.includes("salary") || k.includes("pay") || k.includes("emi") || k.includes("hra") || k.includes("deduction")) {
      const num = Number(v);
      if (!isNaN(num)) return `₹${num.toLocaleString("en-IN")}`;
    }
    return String(v);
  };

  const fullTooltip = entries.map(([key, val]) => `${formatKey(key)}: ${formatVal(key, val)}`).join(" | ");

  return (
    <div
      className="flex items-center gap-1.5 whitespace-nowrap overflow-x-hidden text-ellipsis py-0.5 max-w-[420px] xl:max-w-[550px]"
      title={fullTooltip}
    >
      {entries.map(([key, val]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 border border-border/70 text-[0.68rem] shrink-0"
        >
          <span className="text-muted-foreground font-medium">{formatKey(key)}:</span>
          <span className="font-semibold text-foreground">{formatVal(key, val)}</span>
        </span>
      ))}
    </div>
  );
}

export default function AuditLogsPage() {
  const { selectedBranch, branches } = useTenant();
  const { role: userRole } = useAuth();

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Map branch ID to name for quick lookup
  const branchMap = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b) => {
      map[b.id] = b.name;
    });
    return map;
  }, [branches]);

  // Fetch comprehensive audit log items
  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Primary Query on audit_logs table
      let auditQuery = supabaseBrowser
        .from("audit_logs")
        .select("*")
        .order("performed_at", { ascending: false })
        .limit(300);

      if (selectedBranch?.id) {
        auditQuery = auditQuery.or(`branch_id.eq.${selectedBranch.id},branch_id.is.null`);
      }

      const [auditRes, attRes, leaveRes, loanRes, empRes, rulesRes, periodRes] = await Promise.all([
        auditQuery,
        supabaseBrowser
          .from("attendance_logs")
          .select("id, employee_id, status, check_in, check_out, branch_id, employees(full_name, role)")
          .order("check_in", { ascending: false })
          .limit(40),
        supabaseBrowser
          .from("leave_requests")
          .select("id, employee_id, type, status, start_date, end_date, reason, created_at, employees(full_name, branch_id)")
          .order("created_at", { ascending: false })
          .limit(25),
        supabaseBrowser
          .from("loans")
          .select("id, employee_id, type, amount, balance_amount, status, created_at, employees(full_name, branch_id)")
          .order("created_at", { ascending: false })
          .limit(25),
        supabaseBrowser
          .from("employees")
          .select("id, full_name, role, status, employee_code, date_of_joining, created_at, branch_id")
          .order("created_at", { ascending: false })
          .limit(25),
        supabaseBrowser
          .from("branch_rules")
          .select("id, branch_id, rule_type, title, threshold_minutes, deduction_percentage, is_active, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
        supabaseBrowser
          .from("payroll_periods")
          .select("id, month, year, status, locked_at, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const directLogs: AuditLogItem[] = (auditRes.data || []).map((item) => {
        let parsedDetails = item.details;
        if (typeof item.details === "string") {
          try {
            parsedDetails = JSON.parse(item.details);
          } catch {
            // Keep string
          }
        }
        return {
          ...item,
          details: parsedDetails,
          branch_name: item.branch_id ? branchMap[item.branch_id] || "Assigned Branch" : "System / Global",
        };
      });

      // 2. Synthesize events from primary tables so that logs are comprehensive across all modules
      const synthesized: AuditLogItem[] = [];

      // Attendance punches
      if (attRes.data) {
        attRes.data.forEach((a: any) => {
          if (a.check_in) {
            synthesized.push({
              id: `att-in-${a.id}`,
              action: "attendance_punch_in",
              entity_type: "attendance_logs",
              entity_id: a.id,
              actor_email: a.employees?.full_name ? `${a.employees.full_name} (Self)` : "Biometric Device",
              actor_role: "EMPLOYEE",
              branch_id: a.branch_id,
              branch_name: a.branch_id ? branchMap[a.branch_id] || "Branch" : "Main",
              performed_at: a.check_in,
              details: {
                staff: a.employees?.full_name || "Employee",
                role: a.employees?.role || "Staff",
                status: a.status || "PRESENT",
                time: new Date(a.check_in).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }),
              },
            });
          }
        });
      }

      // Leave requests
      if (leaveRes.data) {
        leaveRes.data.forEach((l: any) => {
          synthesized.push({
            id: `leave-${l.id}`,
            action: l.status === "APPROVED" ? "leave_approved" : l.status === "REJECTED" ? "leave_rejected" : "leave_requested",
            entity_type: "leave_requests",
            entity_id: l.id,
            actor_email: l.status === "APPROVED" ? "Branch Manager" : l.employees?.full_name || "Staff",
            actor_role: l.status === "APPROVED" ? "BRANCH_MANAGER" : "EMPLOYEE",
            branch_id: l.employees?.branch_id,
            branch_name: l.employees?.branch_id ? branchMap[l.employees.branch_id] || "Branch" : "Main",
            performed_at: l.created_at,
            details: {
              staff: l.employees?.full_name || "Employee",
              leave_type: l.type,
              duration: `${l.start_date} to ${l.end_date}`,
              status: l.status,
              reason: l.reason || "Personal",
            },
          });
        });
      }

      // Loans
      if (loanRes.data) {
        loanRes.data.forEach((lo: any) => {
          synthesized.push({
            id: `loan-${lo.id}`,
            action: lo.status === "WRITTEN_OFF" ? "loan_writeoff" : "loan_created",
            entity_type: "loans",
            entity_id: lo.id,
            actor_email: "Payroll Manager",
            actor_role: "PAYROLL_MANAGER",
            branch_id: lo.employees?.branch_id,
            branch_name: lo.employees?.branch_id ? branchMap[lo.employees.branch_id] || "Branch" : "Main",
            performed_at: lo.created_at,
            details: {
              staff: lo.employees?.full_name || "Employee",
              type: lo.type,
              principal: Number(lo.amount || 0),
              balance: Number(lo.balance_amount || 0),
              status: lo.status,
            },
          });
        });
      }

      // Employees
      if (empRes.data) {
        empRes.data.forEach((e: any) => {
          synthesized.push({
            id: `emp-${e.id}`,
            action: e.status === "LEFT" ? "employee_marked_left" : e.status === "INACTIVE" ? "employee_disabled" : "employee_created",
            entity_type: "employees",
            entity_id: e.id,
            actor_email: "Branch Manager",
            actor_role: "BRANCH_MANAGER",
            branch_id: e.branch_id,
            branch_name: e.branch_id ? branchMap[e.branch_id] || "Branch" : "Main",
            performed_at: e.created_at || e.date_of_joining,
            details: {
              staff: e.full_name,
              role: e.role,
              code: e.employee_code || "—",
              status: e.status,
            },
          });
        });
      }

      // Branch Rules
      if (rulesRes.data) {
        rulesRes.data.forEach((r: any) => {
          synthesized.push({
            id: `rule-${r.id}`,
            action: "branch_rule_created",
            entity_type: "branch_rules",
            entity_id: r.id,
            actor_email: "Branch Admin",
            actor_role: "SUPER_ADMIN",
            branch_id: r.branch_id,
            branch_name: r.branch_id ? branchMap[r.branch_id] || "Branch" : "All Branches",
            performed_at: r.created_at,
            details: {
              rule_title: r.title,
              type: r.rule_type,
              threshold: `${r.threshold_minutes} mins`,
              deduction: `${r.deduction_percentage}%`,
              active: r.is_active ? "Active" : "Disabled",
            },
          });
        });
      }

      // Payroll Periods
      if (periodRes.data) {
        periodRes.data.forEach((p: any) => {
          synthesized.push({
            id: `payroll-${p.id}`,
            action: p.status === "LOCKED" ? "payroll_period_locked" : "payroll_calculated",
            entity_type: "payroll_periods",
            entity_id: p.id,
            actor_email: "Payroll Manager",
            actor_role: "PAYROLL_MANAGER",
            branch_id: null,
            branch_name: "All Branches",
            performed_at: p.locked_at || p.created_at,
            details: {
              period: `${p.month}/${p.year}`,
              status: p.status,
              locked: p.status === "LOCKED" ? "Locked & Finalized" : "Open",
            },
          });
        });
      }

      // Merge & deduplicate by ID or identical action+entity
      const seen = new Set<string>();
      const merged: AuditLogItem[] = [];

      for (const log of [...directLogs, ...synthesized]) {
        const uniqueKey = log.id || `${log.action}-${log.entity_id}-${log.performed_at}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          merged.push(log);
        }
      }

      merged.sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime());

      setLogs(merged);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch?.id, branchMap]);

  useEffect(() => {
    fetchAuditLogs();

    // Supabase Real-time listener for live audit events
    const channel = supabaseBrowser
      .channel("audit_logs_realtime_feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_logs" }, () => {
        if (autoRefresh) {
          fetchAuditLogs();
        }
      })
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [fetchAuditLogs, autoRefresh]);

  // Format Date in IST
  const formatIST = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  // Relative Time helper
  const getRelativeTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const now = new Date().getTime();
      const past = new Date(isoString).getTime();
      const diffSec = Math.floor((now - past) / 1000);

      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return "";
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const meta = formatAction(log.action);

      // 1. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = meta.title.toLowerCase().includes(q);
        const actionMatch = log.action?.toLowerCase().includes(q);
        const emailMatch = log.actor_email?.toLowerCase().includes(q);
        const roleMatch = log.actor_role?.toLowerCase().includes(q);
        const branchMatch = log.branch_name?.toLowerCase().includes(q);
        const detailsMatch = log.details ? JSON.stringify(log.details).toLowerCase().includes(q) : false;

        if (!titleMatch && !actionMatch && !emailMatch && !roleMatch && !branchMatch && !detailsMatch) {
          return false;
        }
      }

      // 2. Role Filter
      if (roleFilter !== "ALL") {
        if (log.actor_role !== roleFilter) return false;
      }

      // 3. Category Filter
      if (categoryFilter !== "ALL") {
        if (meta.category !== categoryFilter) return false;
      }

      // 4. Date Filter
      if (dateFilter !== "ALL") {
        const logDate = new Date(log.performed_at);
        const now = new Date();

        if (dateFilter === "TODAY") {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (logDate < today) return false;
        } else if (dateFilter === "WEEK") {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (logDate < sevenDaysAgo) return false;
        } else if (dateFilter === "MONTH") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          if (logDate < startOfMonth) return false;
        }
      }

      return true;
    });
  }, [logs, searchQuery, roleFilter, categoryFilter, dateFilter]);

  // Export to Excel / CSV
  const handleExport = () => {
    const rows = filteredLogs.map((l) => {
      const meta = formatAction(l.action);
      return {
        "Timestamp (IST)": formatIST(l.performed_at),
        "Event Title": meta.title,
        "Category": meta.category,
        "Actor": l.actor_email || l.actor_role || "System",
        "Actor Role": l.actor_role || "SYSTEM",
        "Branch": l.branch_name || "System / Global",
        "Event Details": typeof l.details === "object" ? JSON.stringify(l.details) : String(l.details || ""),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Event_History");
    XLSX.writeFile(
      workbook,
      `Audit_Event_History_${selectedBranch ? selectedBranch.name.replace(/\s+/g, "_") : "All"}_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  return (
    <div className="max-w-7xl mx-auto pb-16 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-widest text-primary">Live Activity & Compliance</span>
            <span className="pill text-[0.65rem] pill-neutral font-bold">IST (UTC+05:30)</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
            <span>📜</span> System Audit Logs & Event History
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time, detailed activity trail of employee actions, attendance check-ins, leave approvals, salary updates, and branch rules.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            className="button button-secondary text-xs flex items-center gap-1.5"
            onClick={() => fetchAuditLogs()}
            title="Refresh logs"
          >
            🔄 Refresh
          </button>

          <button
            type="button"
            className="button button-primary text-xs flex items-center gap-1.5"
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
          >
            📥 Export to Excel
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="form-group sm:col-span-2 lg:col-span-1">
            <label className="label text-xs">Search Events</label>
            <div className="relative">
              <input
                type="text"
                className="input text-xs pl-8 w-full"
                placeholder="Search staff, event, actor, branch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery("")}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <div className="form-group">
            <label className="label text-xs">Category</label>
            <select
              className="input text-xs"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              <option value="EMPLOYEE">👤 Employees & Staff</option>
              <option value="ATTENDANCE">🟢 Attendance & Punches</option>
              <option value="LEAVES">📄 Leave Requests</option>
              <option value="LOANS">💳 Loans & Advances</option>
              <option value="PAYROLL">💰 Payroll & Salaries</option>
              <option value="RULES">⚙️ Leave & Late Rules</option>
              <option value="SETTINGS">🏢 Branch & Settings</option>
            </select>
          </div>

          {/* Actor Role Filter */}
          <div className="form-group">
            <label className="label text-xs">Operator Role</label>
            <select
              className="input text-xs"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="ALL">All Operator Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="PAYROLL_MANAGER">Payroll Manager</option>
              <option value="BRANCH_MANAGER">Branch Manager</option>
              <option value="EMPLOYEE">Staff / Employee</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="form-group">
            <label className="label text-xs">Time Period</label>
            <select
              className="input text-xs"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="ALL">All History</option>
              <option value="TODAY">Today Only</option>
              <option value="WEEK">Last 7 Days</option>
              <option value="MONTH">This Month</option>
            </select>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(searchQuery || categoryFilter !== "ALL" || roleFilter !== "ALL" || dateFilter !== "ALL") && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50 text-xs flex-wrap">
            <span className="text-muted-foreground font-medium">Active filters:</span>
            {searchQuery && (
              <span className="pill pill-neutral flex items-center gap-1">
                &quot;{searchQuery}&quot;
                <button onClick={() => setSearchQuery("")} className="hover:text-destructive">✕</button>
              </span>
            )}
            {categoryFilter !== "ALL" && (
              <span className="pill pill-neutral flex items-center gap-1">
                Category: {categoryFilter}
                <button onClick={() => setCategoryFilter("ALL")} className="hover:text-destructive">✕</button>
              </span>
            )}
            {roleFilter !== "ALL" && (
              <span className="pill pill-neutral flex items-center gap-1">
                Role: {roleFilter}
                <button onClick={() => setRoleFilter("ALL")} className="hover:text-destructive">✕</button>
              </span>
            )}
            {dateFilter !== "ALL" && (
              <span className="pill pill-neutral flex items-center gap-1">
                Time: {dateFilter}
                <button onClick={() => setDateFilter("ALL")} className="hover:text-destructive">✕</button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery("");
                setCategoryFilter("ALL");
                setRoleFilter("ALL");
                setDateFilter("ALL");
              }}
              className="text-xs text-primary font-bold hover:underline ml-2"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {/* Detailed Event History Table */}
      <div className="card overflow-hidden p-0">
        <div className="p-4 border-b border-border flex justify-between items-center bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">Event History</span>
            <span className="pill text-[0.65rem] pill-neutral font-mono">{filteredLogs.length} events</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-primary"
              />
              <span>Live updates</span>
            </label>
          </div>
        </div>

        {loading ? (
          <div className="min-h-[300px] grid place-items-center p-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground font-medium">Loading activity records...</p>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground space-y-3">
            <span className="text-4xl block">🔍</span>
            <p className="text-sm font-semibold">No activity logs match your filter</p>
            <p className="text-xs">
              {searchQuery || categoryFilter !== "ALL" || roleFilter !== "ALL" || dateFilter !== "ALL"
                ? "Try adjusting your search criteria or resetting filters."
                : "Real-time activity records will populate automatically as actions are taken."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground text-[0.72rem]">
                  <th className="py-2 px-3 whitespace-nowrap w-52">Date & Time</th>
                  <th className="py-2 px-3 whitespace-nowrap w-64">Event</th>
                  <th className="py-2 px-3 whitespace-nowrap">Event Details & Attributes</th>
                  <th className="py-2 px-3 whitespace-nowrap w-52">Performed By</th>
                  <th className="py-2 px-3 whitespace-nowrap w-40 text-right">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredLogs.map((log) => {
                  const meta = formatAction(log.action);
                  const relative = getRelativeTime(log.performed_at);

                  return (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors border-b border-border/30 h-10">
                      {/* Timestamp (Single-line) */}
                      <td className="py-2 px-3 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium text-foreground text-[0.72rem]">
                            {formatIST(log.performed_at)}
                          </span>
                          {relative && (
                            <span className="text-[0.65rem] text-muted-foreground">
                              ({relative})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Event Title & Badge (Single-line) */}
                      <td className="py-2 px-3 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm shrink-0">{meta.icon}</span>
                          <span className="font-bold text-foreground text-[0.75rem] truncate max-w-[170px]" title={meta.title}>
                            {meta.title}
                          </span>
                          <span className={`pill text-[0.6rem] py-0 px-1.5 shrink-0 font-semibold ${meta.badgeColor}`}>
                            {meta.category}
                          </span>
                        </div>
                      </td>

                      {/* Detailed Event Attributes (Single-line with hover tooltip) */}
                      <td className="py-2 px-3 whitespace-nowrap align-middle">
                        {renderEventDetails(log.details, log.entity_type)}
                      </td>

                      {/* Actor (Single-line) */}
                      <td className="py-2 px-3 whitespace-nowrap align-middle">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold text-[0.6rem] grid place-items-center shrink-0">
                            {(log.actor_email || log.actor_role || "U").substring(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground truncate max-w-[120px] text-[0.72rem]" title={log.actor_email || "System"}>
                            {log.actor_email ? log.actor_email.split("@")[0] : "System"}
                          </span>
                          <span className="text-[0.6rem] pill pill-neutral py-0 px-1 font-mono uppercase shrink-0">
                            {log.actor_role || "SYSTEM"}
                          </span>
                        </div>
                      </td>

                      {/* Branch / Scope (Single-line) */}
                      <td className="py-2 px-3 whitespace-nowrap align-middle text-right">
                        <span className="pill text-[0.62rem] pill-neutral inline-flex items-center gap-1">
                          🏢 {log.branch_name || "All Branches"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
