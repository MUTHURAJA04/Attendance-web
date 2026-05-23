import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const READ_ROLES = ["SUPER_ADMIN", "PAYROLL_MANAGER", "BRANCH_MANAGER"] as const;
const WRITE_ROLES = ["SUPER_ADMIN", "PAYROLL_MANAGER"] as const;

type ReadRole = (typeof READ_ROLES)[number];

type BranchCreateInput = {
  name: string;
  city: string;
  state?: string;
  brandId?: string;
};

function requireBranchFields(payload: Partial<BranchCreateInput>) {
  const missing: string[] = [];
  if (!payload.name) missing.push("name");
  if (!payload.city) missing.push("city");
  return missing;
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

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const role = userData.user.user_metadata?.role as ReadRole | undefined;
  if (!role || !READ_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("branches")
      .select("id, name, city, state")
      .order("name", { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ branches: data ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (!WRITE_ROLES.includes(role as (typeof WRITE_ROLES)[number])) {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const payload = (await req.json()) as Partial<BranchCreateInput>;
  const missing = requireBranchFields(payload);

  if (missing.length > 0) {
    return new Response(
      JSON.stringify({ error: `Missing required fields: ${missing.join(", ")}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  const { data, error } = await supabase
    .from("branches")
    .insert({
      name: payload.name,
      city: payload.city,
      state: payload.state ?? null,
      brand_id: payload.brandId ?? null
    })
    .select("id, name, city, state")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ branch: data }), {
    status: 201,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
