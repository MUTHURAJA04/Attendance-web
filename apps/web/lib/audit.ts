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

        const row: Record<string, unknown> = {
            action,
            details: details ? (typeof details === "string" ? details : JSON.stringify(details)) : null,
            performed_at: new Date().toISOString(),
        };

        if (user?.id) row.user_id = user.id;
        if (user?.email) row.actor_email = user.email;
        if (user?.user_metadata?.role) row.actor_role = user.user_metadata.role;
        if (options?.branchId) row.branch_id = options.branchId;
        if (options?.entityType) row.entity_type = options.entityType;
        if (options?.entityId) row.entity_id = options.entityId;

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
