import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. First attempt to call the stored database function
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "fn_auto_checkout_unclosed_attendance"
    );

    if (!rpcError && rpcData) {
      return new Response(JSON.stringify(rpcData), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fallback in Deno runtime if RPC isn't deployed yet
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

    // Fetch unclosed attendance logs with employee details
    const { data: unclosedLogs, error: fetchError } = await supabase
      .from("attendance_logs")
      .select("id, employee_id, check_in, metadata, branch_id, employees(full_name), branches(name)")
      .is("check_out", null);

    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updatedCount = 0;
    const checkoutList: any[] = [];
    const staffNames: string[] = [];

    for (const log of (unclosedLogs as any[]) || []) {
      const checkInDate = new Date(log.check_in);
      const checkInDateIST = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(checkInDate);

      // Qualify if check_in was in the past, or if today and past 23:00 (11:00 PM)
      if (checkInDateIST < todayIST || (checkInDateIST === todayIST && currentISTTime >= "23:00")) {
        const autoCheckOutTime = `${checkInDateIST}T23:00:00+05:30`;

        const existingMeta = typeof log.metadata === "object" && log.metadata !== null ? log.metadata : {};
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

    // Insert into system_notifications and audit_logs
    if (updatedCount > 0) {
      // 1. Notification
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

    return new Response(
      JSON.stringify({
        success: true,
        updated_count: updatedCount,
        employees: checkoutList,
        executed_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
