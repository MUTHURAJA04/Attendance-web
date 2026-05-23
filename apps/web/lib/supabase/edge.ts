import { FunctionsHttpError, SupabaseClient } from "@supabase/supabase-js";

export async function callEdgeFunction<T>(
  supabase: SupabaseClient,
  name: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
  }
): Promise<{ data?: T; error?: string; status: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    return { error: "You are not authenticated.", status: 401 };
  }

  const { data, error } = await supabase.functions.invoke(name, {
    method: options.method ?? "POST",
    body: options.body as any,
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (error) {
    let message = error.message;
    let status = 500;
    if (error instanceof FunctionsHttpError && error.context) {
      const res = error.context as Response;
      status = res.status ?? 500;
      try {
        const body = (await res.json()) as { error?: string } | null;
        if (body?.error) message = body.error;
      } catch {
        // ignore
      }
    }
    return { error: (data as { error?: string } | null)?.error ?? message, status };
  }

  const fnError = (data as { error?: string } | null)?.error;
  if (fnError) {
    return { error: fnError, status: 400 };
  }

  return { data: data as T, status: 200 };
}
