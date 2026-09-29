import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export const VALID_ROLES = [
  "SUPER_ADMIN",
  "BRAND_ADMIN",
  "BRANCH_ADMIN",
  "MANAGER",
  "BRANCH_STAFF",
  "PAYROLL_MANAGER",
  "BRANCH_MANAGER",
  "EMPLOYEE",
] as const;

export type UserRole = (typeof VALID_ROLES)[number];

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !key) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  });
}

// 1. GET: List all users from profiles table with brands and branches
export async function GET() {
  try {
    const supabase = getSupabaseClient();

    // Fetch auth users to merge with profiles
    let authUsersMap = new Map<string, any>();
    try {
      const { data: authUsersData } = await supabase.auth.admin.listUsers();
      if (authUsersData?.users) {
        authUsersMap = new Map(authUsersData.users.map((u) => [u.id, u]));
      }
    } catch (e) {
      console.warn("Could not fetch auth users list:", e);
    }

    // 1. Try full profile query with all optional columns
    const { data: fullProfiles, error: fullErr } = await supabase
      .from("profiles")
      .select(`
        *,
        branches (
          id,
          name,
          brand_id,
          brands (
            id,
            name
          )
        )
      `)
      .order("created_at", { ascending: false });

    let profiles = fullProfiles;

    // 2. Fallback to basic profiles query if extra columns do not exist yet
    if (fullErr) {
      const { data: basicProfiles, error: basicErr } = await supabase
        .from("profiles")
        .select(`
          id,
          role,
          branch_id,
          created_at,
          branches (
            id,
            name,
            brand_id,
            brands (
              id,
              name
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (basicErr) {
        return NextResponse.json({ error: basicErr.message }, { status: 500 });
      }
      profiles = basicProfiles;
    }

    const { data: allBrands } = await supabase.from("brands").select("id, name");
    const { data: allBranches } = await supabase.from("branches").select("id, name, brand_id");

    const brandMap = new Map((allBrands || []).map((b) => [b.id, b.name]));
    const branchMap = new Map((allBranches || []).map((br) => [br.id, br.name]));

    const formatted = (profiles || []).map((p: any) => {
      const authUser = authUsersMap.get(p.id);
      const meta = authUser?.user_metadata || {};

      const userEmail = p.email || authUser?.email || "";
      const userRole = p.role || meta.role || "BRANCH_STAFF";
      const displayName = p.full_name || meta.full_name || (userEmail ? userEmail.split("@")[0] : `User (${p.id.slice(0, 6)})`);
      
      const rawBrandIds = (Array.isArray(p.brand_ids) && p.brand_ids.length > 0)
        ? p.brand_ids
        : (Array.isArray(meta.brand_ids) && meta.brand_ids.length > 0)
        ? meta.brand_ids
        : p.brand_id ? [p.brand_id]
        : meta.brand_id ? [meta.brand_id] : [];

      const rawBranchIds = (Array.isArray(p.branch_ids) && p.branch_ids.length > 0)
        ? p.branch_ids
        : (Array.isArray(meta.branch_ids) && meta.branch_ids.length > 0)
        ? meta.branch_ids
        : p.branch_id ? [p.branch_id]
        : meta.branch_id ? [meta.branch_id] : [];

      const brandNamesList = rawBrandIds.map((bid: string) => brandMap.get(bid)).filter(Boolean) as string[];
      const branchNamesList = rawBranchIds.map((brid: string) => branchMap.get(brid)).filter(Boolean) as string[];

      const brandNames = brandNamesList.join(", ");
      const branchNames = branchNamesList.join(", ");

      const branchName = branchNames || p.branches?.name || null;
      const brandName = brandNames || p.brands?.name || p.branches?.brands?.name || null;
      const brandId = rawBrandIds[0] || p.brand_id || p.branches?.brand_id || null;
      const branchId = rawBranchIds[0] || p.branch_id || null;

      return {
        id: p.id,
        full_name: displayName,
        email: userEmail,
        role: userRole,
        brand_id: brandId,
        brand_ids: rawBrandIds,
        brand_name: brandName,
        brand_names_list: brandNamesList,
        branch_id: branchId,
        branch_ids: rawBranchIds,
        branch_name: branchName,
        branch_names_list: branchNamesList,
        is_active: p.is_active !== false,
        created_at: p.created_at || authUser?.created_at || new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, users: formatted });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to list users" },
      { status: 500 }
    );
  }
}

// 2. POST: Create a new user (via RPC, Auth Admin, or SignUp + Profile)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      full_name,
      email,
      password,
      role = "BRANCH_STAFF",
      brand_id = null,
      branch_id = null,
      brand_ids = [],
      branch_ids = [],
      is_active = true,
    } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email address is required" },
        { status: 400 }
      );
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const effectiveBrandIds: string[] = Array.isArray(brand_ids) && brand_ids.length > 0
      ? brand_ids
      : brand_id ? [brand_id] : [];

    const effectiveBranchIds: string[] = Array.isArray(branch_ids) && branch_ids.length > 0
      ? branch_ids
      : branch_id ? [branch_id] : [];

    const primaryBrandId = effectiveBrandIds[0] || null;
    const primaryBranchId = effectiveBranchIds[0] || null;

    const supabase = getSupabaseClient();

    // 1. Primary Method: Try Postgres RPC function fn_admin_create_user_v2 / fn_admin_create_user
    try {
      const { data: rpcDataV2, error: rpcErrorV2 } = await supabase.rpc("fn_admin_create_user_v2", {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_full_name: full_name?.trim() || email.split("@")[0],
        p_role: role,
        p_brand_ids: role === "SUPER_ADMIN" ? [] : effectiveBrandIds,
        p_branch_ids: (role === "SUPER_ADMIN" || role === "BRAND_ADMIN") ? [] : effectiveBranchIds,
        p_is_active: is_active !== false,
      });

      if (!rpcErrorV2 && rpcDataV2) {
        return NextResponse.json({
          success: true,
          user: rpcDataV2,
        });
      }
    } catch {}

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("fn_admin_create_user", {
        p_email: email.trim().toLowerCase(),
        p_password: password,
        p_full_name: full_name?.trim() || email.split("@")[0],
        p_role: role,
        p_brand_id: primaryBrandId,
        p_branch_id: primaryBranchId,
      });

      if (!rpcError && rpcData) {
        // Also update brand_ids and branch_ids on profile
        await supabase.from("profiles").update({
          brand_ids: effectiveBrandIds,
          branch_ids: effectiveBranchIds,
          is_active: is_active !== false,
        }).eq("id", rpcData.id);

        return NextResponse.json({
          success: true,
          user: {
            ...rpcData,
            brand_ids: effectiveBrandIds,
            branch_ids: effectiveBranchIds,
          },
        });
      }
    } catch (rpcErr) {
      console.warn("RPC call error:", rpcErr);
    }

    // 2. Fallback Method: Auth Admin / SignUp
    const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    let userId: string = randomUUID();
    let authCreated = false;
    let authErrorDetail = "";

    const userMetadata = {
      role,
      full_name,
      brand_id: primaryBrandId,
      branch_id: primaryBranchId,
      brand_ids: effectiveBrandIds,
      branch_ids: effectiveBranchIds,
    };

    if (hasServiceRoleKey) {
      const { data: newAuthUser, error: authError } = await supabase.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });

      if (!authError && newAuthUser?.user) {
        userId = newAuthUser.user.id;
        authCreated = true;
      } else {
        authErrorDetail = authError?.message || "";
      }
    }

    if (!authCreated) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: userMetadata,
        },
      });

      if (!signUpError && signUpData?.user) {
        userId = signUpData.user.id;
        authCreated = true;
      } else if (signUpError) {
        authErrorDetail = signUpError.message;
      }
    }

    // 3. Upsert into profiles table
    let profileInserted = false;
    const profilePayload: Record<string, any> = {
      id: userId,
      role: role,
      branch_id: primaryBranchId,
      brand_id: primaryBrandId,
      brand_ids: effectiveBrandIds,
      branch_ids: effectiveBranchIds,
      full_name: full_name || email.split("@")[0],
      email: email.trim().toLowerCase(),
      is_active: is_active !== false,
      updated_at: new Date().toISOString(),
    };

    try {
      const { error: fullProfileErr } = await supabase.from("profiles").upsert(profilePayload);
      if (!fullProfileErr) {
        profileInserted = true;
      } else {
        const { error: basicErr } = await supabase.from("profiles").upsert({
          id: userId,
          role: role,
          branch_id: primaryBranchId,
          brand_id: primaryBrandId,
        });
        if (!basicErr) profileInserted = true;
      }
    } catch (e: any) {
      console.warn("Profile upsert error:", e);
    }

    if (!authCreated && !profileInserted) {
      return NextResponse.json(
        {
          error:
            authErrorDetail ||
            "Failed to create user. Please execute migration 20260523000025_multi_brand_branch_assignment.sql in Supabase SQL Editor.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        full_name: full_name || email.split("@")[0],
        email: email.trim().toLowerCase(),
        role,
        brand_id: primaryBrandId,
        branch_id: primaryBranchId,
        brand_ids: effectiveBrandIds,
        branch_ids: effectiveBranchIds,
        is_active,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to process user creation" },
      { status: 500 }
    );
  }
}

// 3. PATCH: Update user profile, role, brand/branch, or status
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      full_name,
      role,
      brand_id,
      branch_id,
      brand_ids,
      branch_ids,
      is_active,
      password,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const effectiveBrandIds = brand_ids !== undefined
      ? brand_ids
      : brand_id ? [brand_id] : undefined;

    const effectiveBranchIds = branch_ids !== undefined
      ? branch_ids
      : branch_id ? [branch_id] : undefined;

    const primaryBrandId = effectiveBrandIds !== undefined
      ? (effectiveBrandIds[0] || null)
      : brand_id !== undefined ? brand_id : undefined;

    const primaryBranchId = effectiveBranchIds !== undefined
      ? (effectiveBranchIds[0] || null)
      : branch_id !== undefined ? branch_id : undefined;

    const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (hasServiceRoleKey) {
      try {
        const authPayload: Record<string, any> = {
          user_metadata: {
            ...(role ? { role } : {}),
            ...(full_name ? { full_name } : {}),
            ...(primaryBrandId !== undefined ? { brand_id: primaryBrandId } : {}),
            ...(primaryBranchId !== undefined ? { branch_id: primaryBranchId } : {}),
            ...(effectiveBrandIds !== undefined ? { brand_ids: effectiveBrandIds } : {}),
            ...(effectiveBranchIds !== undefined ? { branch_ids: effectiveBranchIds } : {}),
          },
        };
        if (password && password.trim().length >= 6) {
          authPayload.password = password.trim();
        }
        await supabase.auth.admin.updateUserById(id, authPayload);
      } catch (authErr) {
        console.warn("Could not update auth user:", authErr);
      }
    }

    // 1. Try RPC fn_admin_update_user_v2
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("fn_admin_update_user_v2", {
        p_id: id,
        p_full_name: full_name ?? null,
        p_role: role ?? null,
        p_brand_ids: effectiveBrandIds ?? [],
        p_branch_ids: effectiveBranchIds ?? [],
        p_is_active: is_active ?? true,
        p_password: password && password.trim().length >= 6 ? password.trim() : null,
      });

      if (!rpcErr && rpcData) {
        return NextResponse.json({
          success: true,
          message: "User updated successfully",
          user: rpcData,
        });
      }
    } catch (e) {
      console.warn("RPC update_v2 failed:", e);
    }

    // 2. Try older RPC fn_admin_update_user
    try {
      const { data: rpcOld, error: rpcOldErr } = await supabase.rpc("fn_admin_update_user", {
        p_id: id,
        p_full_name: full_name ?? null,
        p_role: role ?? null,
        p_brand_id: primaryBrandId ?? null,
        p_branch_id: primaryBranchId ?? null,
        p_is_active: is_active ?? null,
        p_password: password && password.trim().length >= 6 ? password.trim() : null,
      });

      if (!rpcOldErr && rpcOld) {
        // Also update brand_ids / branch_ids on profile directly if column exists
        try {
          await supabase.from("profiles").update({
            brand_ids: effectiveBrandIds ?? [],
            branch_ids: effectiveBranchIds ?? [],
          }).eq("id", id);
        } catch {}

        return NextResponse.json({
          success: true,
          message: "User updated successfully",
          user: {
            ...rpcOld,
            brand_ids: effectiveBrandIds ?? [],
            branch_ids: effectiveBranchIds ?? [],
          },
        });
      }
    } catch (e) {
      console.warn("RPC update fallback failed:", e);
    }

    // 3. Fallback: Direct table update
    const profileUpdatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (role !== undefined) profileUpdatePayload.role = role;
    if (primaryBranchId !== undefined) profileUpdatePayload.branch_id = primaryBranchId;
    if (primaryBrandId !== undefined) profileUpdatePayload.brand_id = primaryBrandId;
    if (effectiveBrandIds !== undefined) profileUpdatePayload.brand_ids = effectiveBrandIds;
    if (effectiveBranchIds !== undefined) profileUpdatePayload.branch_ids = effectiveBranchIds;
    if (full_name !== undefined) profileUpdatePayload.full_name = full_name;
    if (is_active !== undefined) profileUpdatePayload.is_active = is_active;

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdatePayload)
      .eq("id", id);

    if (profileError) {
      // Fallback minimal update
      const minimalPayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (role !== undefined) minimalPayload.role = role;
      if (primaryBranchId !== undefined) minimalPayload.branch_id = primaryBranchId;
      if (primaryBrandId !== undefined) minimalPayload.brand_id = primaryBrandId;
      if (full_name !== undefined) minimalPayload.full_name = full_name;
      if (is_active !== undefined) minimalPayload.is_active = is_active;

      await supabase.from("profiles").update(minimalPayload).eq("id", id);
    }

    return NextResponse.json({
      success: true,
      message: "User updated successfully",
      user: {
        id,
        role,
        full_name,
        brand_id: primaryBrandId,
        branch_id: primaryBranchId,
        brand_ids: effectiveBrandIds,
        branch_ids: effectiveBranchIds,
        is_active,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update user" },
      { status: 500 }
    );
  }
}

// 4. DELETE: Delete user account
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 1. Try RPC fn_admin_delete_user
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc("fn_admin_delete_user", {
        p_id: id,
      });

      if (!rpcError && rpcData) {
        return NextResponse.json({
          success: true,
          message: "User removed successfully",
        });
      }
    } catch (rpcErr) {
      console.warn("RPC delete error:", rpcErr);
    }

    // 2. Direct Fallback
    const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (hasServiceRoleKey) {
      try {
        await supabase.auth.admin.deleteUser(id);
      } catch {}
    }

    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      await supabase.from("profiles").update({ is_active: false }).eq("id", id);
    }

    return NextResponse.json({
      success: true,
      message: "User removed successfully",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
