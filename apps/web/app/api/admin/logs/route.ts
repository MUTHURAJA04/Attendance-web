import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}

// GET: List audit logs
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branch_id");

    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    const { data: logs, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, logs: logs || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch logs" }, { status: 500 });
  }
}

// DELETE: Clear all audit log records
export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branch_id");

    let query = supabase.from("audit_logs").delete();

    if (branchId) {
      query = query.eq("branch_id", branchId);
    } else {
      query = query.neq("id", "00000000-0000-0000-0000-000000000000");
    }

    const { error } = await query;
    if (error) {
      console.error("[DELETE audit_logs error]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the purge action as a clean single new starting record
    await supabase.from("audit_logs").insert([
      {
        action: "audit_logs_cleared",
        entity_type: "SYSTEM",
        details: JSON.stringify({ message: branchId ? `Logs cleared for branch` : "All audit logs cleared by Super Admin", _branch_id: branchId }),
      },
    ]);

    return NextResponse.json({
      success: true,
      message: "Audit logs cleared successfully",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to clear logs" }, { status: 500 });
  }
}
