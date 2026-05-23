"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "../../../../lib/supabase/client";
import type { WriteOff } from "../../../../lib/types";

export default function WriteOffReportPage() {
    const [writeoffs, setWriteoffs] = useState<WriteOff[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadWriteoffs();
    }, []);

    async function loadWriteoffs() {
        setLoading(true);
        const { data, error } = await supabaseBrowser
            .from("loan_writeoffs")
            .select(`
                *,
                employees(full_name, employee_code),
                loans(type, amount, balance_amount)
            `)
            .order("created_at", { ascending: false });

        if (!error && data) {
            setWriteoffs(data as any[]);
        }
        setLoading(false);
    }

    const totalWrittenOff = writeoffs.reduce((sum, wo) => sum + Number(wo.amount), 0);
    const totalRestored = writeoffs.filter(wo => wo.restored).reduce((sum, wo) => sum + Number(wo.amount), 0);
    const outstandingWriteoff = totalWrittenOff - totalRestored;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Loan Write-off Report</h1>
                    <p className="text-muted-foreground">Historical records of loans written off during employee separation.</p>
                </div>
                <Link href="/reports" className="button button-secondary">← Back to Reports</Link>
            </div>

            <div className="stats-grid mb-8">
                <div className="card stat-card border-l-4 border-l-destructive">
                    <span className="stat-label">Total Written Off</span>
                    <span className="stat-value text-destructive">₹{totalWrittenOff.toLocaleString("en-IN")}</span>
                </div>
                <div className="card stat-card border-l-4 border-l-success">
                    <span className="stat-label">Total Restored (Re-joined)</span>
                    <span className="stat-value text-success">₹{totalRestored.toLocaleString("en-IN")}</span>
                </div>
                <div className="card stat-card border-l-4 border-l-amber-500">
                    <span className="stat-label">Net Write-off</span>
                    <span className="stat-value text-amber-500">₹{outstandingWriteoff.toLocaleString("en-IN")}</span>
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <table className="role-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Employee</th>
                            <th>Loan Details</th>
                            <th>Write-off Amount</th>
                            <th>Status</th>
                            <th>Recovery</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="centered h-32">Loading records...</td></tr>
                        ) : writeoffs.length === 0 ? (
                            <tr><td colSpan={6} className="centered h-32">No write-off records found.</td></tr>
                        ) : (
                            writeoffs.map((wo: any) => (
                                <tr key={wo.id}>
                                    <td>
                                        <div className="text-sm font-medium">
                                            {new Date(wo.created_at).toLocaleDateString("en-IN")}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(wo.created_at).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="font-bold">{wo.employees?.full_name}</div>
                                        <div className="text-xs text-muted-foreground">{wo.employees?.employee_code || "No Code"}</div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span className={`pill text-[0.65rem] ${wo.loans?.type === 'ADVANCE' ? 'pill-warning' : 'pill-secondary'}`}>
                                                {wo.loans?.type || 'LOAN'}
                                            </span>
                                            <span className="text-sm">₹{Number(wo.loans?.amount || 0).toLocaleString("en-IN")} Principal</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className="font-bold text-destructive">₹{Number(wo.amount).toLocaleString("en-IN")}</span>
                                    </td>
                                    <td>
                                        <span className={`pill ${wo.restored ? "pill-success" : "pill-destructive"}`}>
                                            {wo.restored ? "RESTORED" : "WRITTEN OFF"}
                                        </span>
                                    </td>
                                    <td>
                                        {wo.restored ? (
                                            <div className="text-xs">
                                                <span className="text-green-600 font-semibold">Recovering via Re-join</span>
                                                <div className="text-muted-foreground">Linked to new loan: {wo.restored_loan_id?.slice(0, 8)}...</div>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">Pending Restoration</span>
                                        )}
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
