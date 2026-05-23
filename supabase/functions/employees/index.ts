import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type EmployeeCreateInput = {
  fullName: string;
  employeeCode?: string;
  role: "STAFF" | "MANAGER" | "KITCHEN" | "CASHIER";
  branchId: string;
  dateOfJoining: string;
  phone: string;
  address?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankName: string;
  upiId?: string;
  aadhaar?: string;
  pan?: string;
  pfUan?: string;
  esiNumber?: string;
};

const ALLOWED_ROLES = ["SUPER_ADMIN", "PAYROLL_MANAGER"] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

function missingFields(payload: Partial<EmployeeCreateInput>) {
  const missing: string[] = [];
  if (!payload.fullName) missing.push("fullName");
  if (!payload.role) missing.push("role");
  if (!payload.branchId) missing.push("branchId");
  if (!payload.dateOfJoining) missing.push("dateOfJoining");
  if (!payload.phone) missing.push("phone");
  if (!payload.emergencyContactName) missing.push("emergencyContactName");
  if (!payload.emergencyContactPhone) missing.push("emergencyContactPhone");
  if (!payload.bankAccountNumber) missing.push("bankAccountNumber");
  if (!payload.bankIfsc) missing.push("bankIfsc");
  if (!payload.bankName) missing.push("bankName");
  return missing;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
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

  const role = userData.user.user_metadata?.role as AllowedRole | undefined;
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const payload = (await req.json()) as Partial<EmployeeCreateInput>;
  const missing = missingFields(payload);
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
    .from("employees")
    .insert({
      full_name: payload.fullName,
      employee_code: payload.employeeCode ?? null,
      role: payload.role,
      branch_id: payload.branchId,
      date_of_joining: payload.dateOfJoining,
      phone: payload.phone,
      address: payload.address ?? null,
      emergency_contact_name: payload.emergencyContactName,
      emergency_contact_phone: payload.emergencyContactPhone,
      bank_account_number: payload.bankAccountNumber,
      bank_ifsc: payload.bankIfsc,
      bank_name: payload.bankName,
      upi_id: payload.upiId ?? null,
      aadhaar: payload.aadhaar ?? null,
      pan: payload.pan ?? null,
      pf_uan: payload.pfUan ?? null,
      esi_number: payload.esiNumber ?? null,
      created_by: userData.user.id
    })
    .select("id, full_name, role, branch_id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ employee: data }), {
    status: 201,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
