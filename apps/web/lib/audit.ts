import { supabaseBrowser } from "./supabase/client";

export interface AuditLogPayload {
    action: string;
    details?: Record<string, unknown> | string | null;
    entityType?: string;
    entityId?: string;
    branchId?: string;
}

/**
 * Log an action to the audit_logs table.
 * Fire-and-forget — we don't block the UI on audit writes.
 */
export async function logAudit(
    action: string,
    details?: Record<string, unknown> | string | null,
    options?: { branchId?: string; entityType?: string; entityId?: string }
) {
    try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        const user = session?.user;

        let parsedDetails: Record<string, unknown> = {};
        if (typeof details === "string") {
            try { parsedDetails = JSON.parse(details); } catch { parsedDetails = { raw: details }; }
        } else if (details && typeof details === "object") {
            parsedDetails = { ...details };
        }

        if (user?.email) parsedDetails._actor_email = user.email;
        if (user?.user_metadata?.role) parsedDetails._actor_role = user.user_metadata.role;
        if (options?.branchId) parsedDetails._branch_id = options.branchId;

        const row = {
            action,
            entity_type: options?.entityType || "SYSTEM",
            entity_id: options?.entityId || null,
            actor_id: user?.id || null,
            details: JSON.stringify(parsedDetails),
        };

        supabaseBrowser
            .from("audit_logs")
            .insert([row])
            .then(({ error }) => {
                if (error) console.warn("[audit]", error.message);
            });
    } catch (e) {
        console.warn("[audit error]", e);
    }
}
