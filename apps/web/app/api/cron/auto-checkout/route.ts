import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  if (action === "pre_check_alert") {
    return handlePreCheckAlert();
  }
  return handleAutoCheckout();
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "pre_check_alert") {
      return handlePreCheckAlert();
    }
  } catch {}
  return handleAutoCheckout();
}

// 1. Pre-execution notification trigger (runs before 11 PM or on demand)
async function handlePreCheckAlert() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayIST = formatter.format(now);

    const { data: unclosedLogs, error: fetchError } = await supabase
      .from("attendance_logs")
      .select("id, employee_id, check_in, status, metadata, branch_id, employees(full_name), branches(name)")
      .is("check_out", null)
      .neq("status", "ABSENT")
      .neq("status", "LEAVE_APPROVED")
      .neq("status", "LEAVE_UNAPPROVED");

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const eligibleList: any[] = [];
    const staffNames: string[] = [];

    for (const log of (unclosedLogs as any[]) || []) {
      if (log.status === "ABSENT" || log.status === "LEAVE_APPROVED" || log.status === "LEAVE_UNAPPROVED") {
        continue;
      }
      const isExcluded = Boolean(log.metadata?.exclude_from_auto_checkout);
      if (isExcluded) continue;

      const empName = log.employees?.full_name || "Staff";
      staffNames.push(empName);
      eligibleList.push({
        log_id: log.id,
        employee_id: log.employee_id,
        employee_name: empName,
        branch_name: log.branches?.name || "Main Branch",
        check_in: log.check_in,
      });
    }

    if (eligibleList.length > 0) {
      await supabase.from("system_notifications").insert([
        {
          title: "⚠️ 11:00 PM Auto Check-Out Pre-Review Alert",
          message: `${eligibleList.length} employee(s) are currently checked in and pending auto check-out at 11:00 PM: ${staffNames.slice(0, 5).join(", ")}${staffNames.length > 5 ? ` +${staffNames.length - 5} more` : ""}`,
          type: "PRE_AUTO_CHECKOUT",
          details: {
            eligible_count: eligibleList.length,
            target_time: "11:00 PM IST",
            staff_names: staffNames,
            employees: eligibleList,
          },
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      pending_review_count: eligibleList.length,
      employees: eligibleList,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to send pre-check alert" }, { status: 500 });
  }
}

// 2. Full 11:00 PM Auto Check-Out Execution
async function handleAutoCheckout() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Try invoking the stored database procedure
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "fn_auto_checkout_unclosed_attendance"
    );

    if (!rpcError && rpcData) {
      return NextResponse.json(rpcData);
    }

    // 2. Fallback in JavaScript runtime
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayIST = formatter.format(now); // "YYYY-MM-DD"

    const timeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentISTTime = timeFormatter.format(now); // "HH:MM"

    // Fetch unclosed punches with employee info
    const { data: unclosedLogs, error: fetchError } = await supabase
      .from("attendance_logs")
      .select("id, employee_id, check_in, status, metadata, branch_id, employees(full_name), branches(name)")
      .is("check_out", null)
      .neq("status", "ABSENT")
      .neq("status", "LEAVE_APPROVED")
      .neq("status", "LEAVE_UNAPPROVED");

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    let updatedCount = 0;
    const checkoutList: any[] = [];
    const staffNames: string[] = [];

    for (const log of (unclosedLogs as any[]) || []) {
      if (log.status === "ABSENT" || log.status === "LEAVE_APPROVED" || log.status === "LEAVE_UNAPPROVED") {
        continue;
      }
      const existingMeta =
        typeof log.metadata === "object" && log.metadata !== null ? log.metadata : {};

      // If marked as excluded from auto check-out (e.g. night shift), skip!
      if (Boolean(existingMeta.exclude_from_auto_checkout)) {
        continue;
      }

      const checkInDate = new Date(log.check_in);
      const checkInDateIST = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(checkInDate);

      // Past date OR today past 23:00 (11:00 PM)
      if (checkInDateIST < todayIST || (checkInDateIST === todayIST && currentISTTime >= "23:00")) {
        const autoCheckOutTime = `${checkInDateIST}T23:00:00+05:30`;

        const updatedMeta = {
          ...existingMeta,
          auto_checked_out: true,
          auto_checkout_reason: "11:00 PM Auto-Checkout Cron",
        };

        const { error: updateError } = await supabase
          .from("attendance_logs")
          .update({
            check_out: autoCheckOutTime,
            metadata: updatedMeta,
          })
          .eq("id", log.id);

        if (!updateError) {
          updatedCount++;
          const empName = log.employees?.full_name || "Staff";
          staffNames.push(empName);
          checkoutList.push({
            log_id: log.id,
            employee_id: log.employee_id,
            employee_name: empName,
            branch_name: log.branches?.name || "Main Branch",
            branch_id: log.branch_id,
            check_in: log.check_in,
            check_out: autoCheckOutTime,
            date: checkInDateIST,
          });
        }
      }
    }

    // Insert Notification and Audit Log
    if (updatedCount > 0) {
      // 1. Notification
      try {
        await supabase.from("system_notifications").insert([
          {
            title: "🌙 11:00 PM Auto Check-Out Summary",
            message: `${updatedCount} employee(s) automatically checked out at 11:00 PM: ${staffNames.join(", ")}`,
            type: "AUTO_CHECKOUT",
            details: {
              count: updatedCount,
              checkout_time: "23:00:00 IST",
              staff_names: staffNames,
              employees: checkoutList,
            },
          },
        ]);
      } catch (e) {
        console.warn("Could not insert to system_notifications:", e);
      }

      // 2. Audit Log
      await supabase.from("audit_logs").insert([
        {
          action: "auto_checkout_cron_executed",
          entity_type: "attendance_logs",
          entity_id: "system_cron",
          actor_email: "System Cron Job",
          actor_role: "SYSTEM",
          details: {
            updated_count: updatedCount,
            checkout_time: "23:00:00 IST",
            staff_names: staffNames,
            employees: checkoutList,
          },
        },
      ]);
    }

    return NextResponse.json({
      success: true,
      updated_count: updatedCount,
      employees: checkoutList,
      executed_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to execute auto check-out" },
      { status: 500 }
    );
  }
}
