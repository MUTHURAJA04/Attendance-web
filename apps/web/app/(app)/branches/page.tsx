"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../lib/supabase/client";
import type { Branch } from "../../../lib/types";

export default function BranchesPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadBranches() {
            const { data } = await supabaseBrowser.from("branches").select("*").order("created_at", { ascending: false });
            if (data) setBranches(data as Branch[]);
            setLoading(false);
        }
        loadBranches();
    }, []);

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        if (!confirm(currentStatus ? "Mark this branch as inactive?" : "Re-activate this branch?")) return;
        const { error } = await supabaseBrowser.from("branches").update({ is_active: !currentStatus }).eq("id", id);
        if (!error) {
            setBranches(branches.map((b) => (b.id === id ? { ...b, is_active: !currentStatus } : b)));
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1>Branches</h1>
                    <p>Manage your restaurant locations and branch-specific rules.</p>
                </div>
                <Link href="/branches/new" className="button button-primary">+ Add Branch</Link>
            </div>

            <div className="card p-0 overflow-hidden">
                <table className="role-table">
                    <thead>
                        <tr>
                            <th>Branch Details</th>
                            <th>Status</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className="centered">Loading branches...</td></tr>
                        ) : branches.length === 0 ? (
                            <tr><td colSpan={4} className="centered">No branches found. Create your first location.</td></tr>
                        ) : (
                            branches.map((branch) => (
                                <tr key={branch.id}>
                                    <td>
                                        <div className="flex flex-col">
                                            <strong>{branch.name}</strong>
                                            <span className="text-muted-foreground text-xs">{branch.city}, {branch.state || ""}</span>
                                        </div>
                                    </td>

                                    <td>
                                        <span className={`pill ${branch.is_active !== false ? "pill-success" : "pill-destructive"}`}>
                                            {branch.is_active !== false ? "Operational" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Link href={`/branches/${branch.id}`} className="button button-secondary h-8 text-xs">Manage</Link>
                                            <Link href={`/branches/${branch.id}/edit`} className="button button-secondary h-8 text-xs">Edit</Link>
                                            <button
                                                onClick={() => toggleStatus(branch.id, branch.is_active !== false)}
                                                className={`button button-secondary h-8 text-xs ${branch.is_active !== false ? "text-destructive" : "text-foreground"}`}
                                            >
                                                {branch.is_active !== false ? "Disable" : "Enable"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
