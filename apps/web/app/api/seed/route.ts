import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleSeed();
}

export async function POST() {
  return handleSeed();
}

async function handleSeed() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Try invoking stored database procedure
    const { data: rpcData, error: rpcError } = await supabase.rpc("fn_seed_demo_data");
    if (!rpcError && rpcData) {
      return NextResponse.json(rpcData);
    }

    return NextResponse.json({
      success: false,
      error: rpcError?.message || "Could not execute fn_seed_demo_data",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to seed demo data" }, { status: 500 });
  }
}
