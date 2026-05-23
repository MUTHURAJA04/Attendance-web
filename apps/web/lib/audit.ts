import { supabaseBrowser } from "./supabase/client";

/**
 * Log an action to the audit_logs table.
 * Fire-and-forget — we don't block the UI on audit writes.
 */
export function logAudit(action: string, details?: Record<string, unknown>) {
    supabaseBrowser
        .from("audit_logs")
        .insert([{
            action,
            details: details ? JSON.stringify(details) : null,
            performed_at: new Date().toISOString(),
        }])
        .then(({ error }) => {
            if (error) console.warn("[audit]", error.message);
        });
}
