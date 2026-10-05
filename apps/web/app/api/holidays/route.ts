import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}

// GET: Fetch holidays
export async function GET(req: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branch_id");

    let query = supabase
      .from("global_holidays")
      .select("*, branches(name)")
      .order("date", { ascending: true });

    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
    }

    const { data: holidays, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, holidays: holidays || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch holidays" }, { status: 500 });
  }
}

// POST: Declare new holiday
export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const { name, date, branch_id, type } = body;
    if (!name || !date) {
      return NextResponse.json({ error: "Holiday name and date are required" }, { status: 400 });
    }

    // 1. Try RPC fn_create_holiday (SECURITY DEFINER)
    const { data: rpcData, error: rpcError } = await supabase.rpc("fn_create_holiday", {
      p_name: String(name).trim(),
      p_date: String(date),
      p_type: type || "PAID",
      p_branch_id: branch_id || null,
    });

    if (!rpcError && rpcData) {
      if (rpcData.success) {
        return NextResponse.json({ success: true, holiday: rpcData.holiday });
      } else if (rpcData.error) {
        return NextResponse.json({ error: rpcData.error }, { status: 500 });
      }
    }

    // 2. Direct fallback
    const payload = {
      name: String(name).trim(),
      date: String(date),
      branch_id: branch_id || null,
      type: type || "PAID",
    };

    const { data, error } = await supabase
      .from("global_holidays")
      .insert([payload])
      .select()
      .single();

    if (error) {
      if (error.message.includes("row-level security policy")) {
        return NextResponse.json({
          error: "Database RLS policy restricted this action. Please execute migration 20260523000028_holiday_rpcs.sql in Supabase SQL Editor or log in as Super Admin."
        }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Safely log audit event without blocking
    try {
      await supabase.from("audit_logs").insert([
        {
          action: "holiday_created",
          entity_type: "SETTINGS",
          entity_id: data.id,
          details: JSON.stringify({ ...payload, _branch_id: payload.branch_id }),
        },
      ]);
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ success: true, holiday: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to declare holiday" }, { status: 500 });
  }
}

// PUT: Update holiday
export async function PUT(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();

    const { id, name, date, branch_id, type } = body;
    if (!id || !name || !date) {
      return NextResponse.json({ error: "Holiday ID, name and date are required" }, { status: 400 });
    }

    // 1. Try RPC fn_update_holiday (SECURITY DEFINER)
    const { data: rpcData, error: rpcError } = await supabase.rpc("fn_update_holiday", {
      p_id: id,
      p_name: String(name).trim(),
      p_date: String(date),
      p_type: type || "PAID",
      p_branch_id: branch_id || null,
    });

    if (!rpcError && rpcData) {
      if (rpcData.success) {
        return NextResponse.json({ success: true });
      } else if (rpcData.error) {
        return NextResponse.json({ error: rpcData.error }, { status: 500 });
      }
    }

    // 2. Direct fallback
    const payload = {
      name: String(name).trim(),
      date: String(date),
      branch_id: branch_id || null,
      type: type || "PAID",
    };

    const { data, error } = await supabase
      .from("global_holidays")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.message.includes("row-level security policy")) {
        return NextResponse.json({
          error: "Database RLS policy restricted this action. Please execute migration 20260523000028_holiday_rpcs.sql in Supabase SQL Editor or log in as Super Admin."
        }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Safely log audit event without blocking
    try {
      await supabase.from("audit_logs").insert([
        {
          action: "holiday_updated",
          entity_type: "SETTINGS",
          entity_id: id,
          details: JSON.stringify({ ...payload, _branch_id: payload.branch_id }),
        },
      ]);
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ success: true, holiday: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update holiday" }, { status: 500 });
  }
}

// DELETE: Delete holiday
export async function DELETE(req: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Holiday ID is required" }, { status: 400 });
    }

    // 1. Try RPC fn_delete_holiday (SECURITY DEFINER)
    const { data: rpcData, error: rpcError } = await supabase.rpc("fn_delete_holiday", {
      p_id: id,
    });

    if (!rpcError && rpcData) {
      if (rpcData.success) {
        return NextResponse.json({ success: true, message: "Holiday deleted" });
      } else if (rpcData.error) {
        return NextResponse.json({ error: rpcData.error }, { status: 500 });
      }
    }

    // 2. Direct fallback
    const { error } = await supabase.from("global_holidays").delete().eq("id", id);
    if (error) {
      if (error.message.includes("row-level security policy")) {
        return NextResponse.json({
          error: "Database RLS policy restricted this action. Please execute migration 20260523000028_holiday_rpcs.sql in Supabase SQL Editor or log in as Super Admin."
        }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Safely log audit event without blocking
    try {
      await supabase.from("audit_logs").insert([
        {
          action: "holiday_deleted",
          entity_type: "SETTINGS",
          entity_id: id,
          details: JSON.stringify({ holiday_id: id }),
        },
      ]);
    } catch {
      // Non-blocking
    }

    return NextResponse.json({ success: true, message: "Holiday deleted" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete holiday" }, { status: 500 });
  }
}
