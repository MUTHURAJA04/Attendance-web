import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProvision(request);
}

export async function POST(request: Request) {
  return handleProvision(request);
}

async function handleProvision(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    // 1. Get default Branch and Brand from database
    const { data: branches } = await supabase.from("branches").select("id, brand_id, name").order("created_at").limit(1);
    const defaultBranch = branches?.[0];
    const branchId = defaultBranch?.id || null;
    const brandId = defaultBranch?.brand_id || null;

    const accounts = [
      {
        email: "branchadmin@gmail.com",
        password: "Branch@123456",
        role: "BRANCH_ADMIN",
        fullName: "Branch Admin",
        branchId: branchId,
        brandId: brandId,
      },
      {
        email: "brandadmin@gmail.com",
        password: "Brand@123456",
        role: "BRAND_ADMIN",
        fullName: "Brand Admin",
        branchId: null,
        brandId: brandId,
      },
      {
        email: "manager@restaurant.com",
        password: "Manager@123456",
        role: "MANAGER",
        fullName: "Operations Manager",
        branchId: branchId,
        brandId: brandId,
      },
      {
        email: "staff@restaurant.com",
        password: "Staff@123456",
        role: "BRANCH_STAFF",
        fullName: "Front Desk Staff",
        branchId: branchId,
        brandId: brandId,
      },
    ];

    const results: any[] = [];

    for (const acc of accounts) {
      try {
        // Sign up through official GoTrue API
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: acc.email,
          password: acc.password,
          options: {
            data: {
              role: acc.role,
              full_name: acc.fullName,
              branch_id: acc.branchId,
              brand_id: acc.brandId,
            },
          },
        });

        if (signUpError) {
          // If already registered, attempt signIn to verify
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: acc.email,
            password: acc.password,
          });

          if (!signInError && signInData.user) {
            // Update profile
            await supabase.from("profiles").upsert({
              id: signInData.user.id,
              role: acc.role,
              branch_id: acc.branchId,
              brand_id: acc.brandId,
              full_name: acc.fullName,
              email: acc.email,
              is_active: true,
            });

            results.push({ email: acc.email, status: "already_valid", userId: signInData.user.id });
          } else {
            results.push({ email: acc.email, status: "error", error: signUpError.message || signInError?.message });
          }
        } else if (signUpData?.user) {
          // Upsert profile
          await supabase.from("profiles").upsert({
            id: signUpData.user.id,
            role: acc.role,
            branch_id: acc.branchId,
            brand_id: acc.brandId,
            full_name: acc.fullName,
            email: acc.email,
            is_active: true,
          });

          results.push({ email: acc.email, status: "created", userId: signUpData.user.id });
        }
      } catch (err: any) {
        results.push({ email: acc.email, status: "failed", error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Account provisioning complete",
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to process provisioning" }, { status: 500 });
  }
}
