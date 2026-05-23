import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type Role = "SUPER_ADMIN" | "BRANCH_MANAGER" | "EMPLOYEE" | "PAYROLL_MANAGER";

const ASSIGNABLE_ROLES: Role[] = [
  "SUPER_ADMIN",
  "BRANCH_MANAGER",
  "EMPLOYEE",
  "PAYROLL_MANAGER"
];

async function listAllUsers(supabase: ReturnType<typeof createClient>) {
  const users: Array<{
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  }> = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return { error };
    users.push(...data.users);
    if (data.users.length < perPage) break;
    page += 1;
  }

  return { users };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = authHeader
    ? authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : authHeader
    : null;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { data: callerData, error: callerError } = await supabase.auth.getUser(token);
  if (callerError || !callerData.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const callerRole = callerData.user.user_metadata?.role as Role | undefined;
  if (callerRole !== "SUPER_ADMIN") {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (req.method === "GET") {
    const { users, error } = await listAllUsers(supabase);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const ids = users.map((user) => user.id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ users: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, branch_id")
      .in("id", ids);

    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const profileMap = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        { role: profile.role as Role, branchId: profile.branch_id as string | null }
      ])
    );

    const summaries = users
      .map((user) => {
        const profile = profileMap.get(user.id);
        const metadataRole = (user.user_metadata?.role as Role | undefined) ?? null;

        return {
          id: user.id,
          email: user.email ?? "",
          metadataRole,
          profileRole: profile?.role ?? null,
          branchId: profile?.branchId ?? null
        };
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    return new Response(JSON.stringify({ users: summaries }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (req.method !== "PATCH") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const body = (await req.json()) as { userId?: string; role?: Role; branchId?: string | null };
  if (!body.userId || !body.role) {
    return new Response(JSON.stringify({ error: "Missing userId or role" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (!ASSIGNABLE_ROLES.includes(body.role)) {
    return new Response(JSON.stringify({ error: "Invalid role value" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { data: targetData, error: targetError } = await supabase.auth.admin.getUserById(
    body.userId
  );
  if (targetError || !targetData.user) {
    return new Response(JSON.stringify({ error: "Target user not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const previousMetadata = targetData.user.user_metadata ?? {};
  const updatedMetadata = { ...previousMetadata, role: body.role };

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(body.userId, {
    user_metadata: updatedMetadata
  });
  if (authUpdateError) {
    return new Response(JSON.stringify({ error: authUpdateError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", body.userId)
    .maybeSingle();

  if (existingProfileError) {
    await supabase.auth.admin.updateUserById(body.userId, {
      user_metadata: previousMetadata
    });
    return new Response(JSON.stringify({ error: existingProfileError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: body.userId,
    role: body.role,
    branch_id: body.branchId ?? existingProfile?.branch_id ?? null
  });

  if (profileError) {
    await supabase.auth.admin.updateUserById(body.userId, {
      user_metadata: previousMetadata
    });
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(
    JSON.stringify({
      user: {
        id: body.userId,
        role: body.role,
        profileRole: body.role,
        branchId: body.branchId ?? existingProfile?.branch_id ?? null
      }
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    }
  );
});
