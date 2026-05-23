"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import type { LeaveRequest, LeaveType, Employee } from "../../../lib/types";

export default function LeavesPage() {
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [employees, setEmployees] = useState<Pick<Employee, "id" | "full_name">[]>([]);
    const [loading, setLoading] = useState(true);
    const [showApply, setShowApply] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ id: string, status: "APPROVED" | "REJECTED" } | null>(null);

    const [form, setForm] = useState({
        employee_id: "",
        type: "CASUAL" as LeaveType,
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date().toISOString().split("T")[0],
        reason: "",
    });

    const { selectedBranch: globalBranch, isLoading: tenantLoading } = useTenant();

    async function loadLeaves() {
        if (tenantLoading) return;
        setLoading(true);

        let leaveQuery = supabaseBrowser
            .from("leave_requests")
            .select("*, employees!inner(full_name, branch_id, branches(name))")
            .order("created_at", { ascending: false });
        let empQuery = supabaseBrowser.from("employees").select("id, full_name, branch_id").eq("status", "ACTIVE");

        if (globalBranch) {
            leaveQuery = leaveQuery.eq("employees.branch_id", globalBranch.id);
            empQuery = empQuery.eq("branch_id", globalBranch.id);
        }

        const [leavesRes, empsRes] = await Promise.all([
            leaveQuery,
            empQuery,
        ]);
        setLeaves((leavesRes.data as LeaveRequest[]) || []);
        setEmployees((empsRes.data as Pick<Employee, "id" | "full_name">[]) || []);
        setLoading(false);
    }

    useEffect(() => {
        loadLeaves();
    }, [globalBranch, tenantLoading]);

    const handleAction = (id: string, status: "APPROVED" | "REJECTED") => {
        setConfirmAction({ id, status });
    };

    const executeAction = async () => {
        if (!confirmAction) return;
        const { id, status } = confirmAction;
        setConfirmAction(null);
        setLoading(true);
        await supabaseBrowser.from("leave_requests").update({ status }).eq("id", id);
        await loadLeaves();
    };

    const handleApply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employee_id) { alert("Select an employee."); return; }
        if (new Date(form.end_date) < new Date(form.start_date)) { alert("End date must be after start date."); return; }

        const { error } = await supabaseBrowser.from("leave_requests").insert([{
            employee_id: form.employee_id,
            type: form.type,
            start_date: form.start_date,
            end_date: form.end_date,
            reason: form.reason || null,
            status: "PENDING",
        }]);

        if (!error) {
            setShowApply(false);
            setForm({ employee_id: "", type: "CASUAL", start_date: new Date().toISOString().split("T")[0], end_date: new Date().toISOString().split("T")[0], reason: "" });
            loadLeaves();
        } else {
            alert(error.message);
        }
    };

    const pendingCount = leaves.filter((l) => l.status === "PENDING").length;
    const approvedCount = leaves.filter((l) => l.status === "APPROVED").length;

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1>Leave Management</h1>
                    <p>Review, approve, and track employee leave applications.</p>
                </div>
                <div className="flex gap-2">
                    <button className="button button-primary" onClick={() => setShowApply(true)}>+ Apply for Leave</button>
                </div>
            </div>

            <div className="stats-grid mb-8">
                <div className="card stat-card">
                    <span className="stat-label">Pending Requests</span>
                    <span className={`stat-value ${pendingCount > 0 ? "text-destructive" : "text-foreground"}`}>{pendingCount}</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Approved This Month</span>
                    <span className="stat-value">{approvedCount}</span>
                </div>
                <div className="card stat-card">
                    <span className="stat-label">Total Requests</span>
                    <span className="stat-value">{leaves.length}</span>
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <table className="role-table">
                    <thead>
                        <tr>
                            <th>Employee</th>
                            <th>Leave Type</th>
                            <th>Duration</th>
                            <th>Reason</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="centered">Loading leave requests...</td></tr>
                        ) : leaves.length === 0 ? (
                            <tr><td colSpan={6} className="centered">No leave requests found.</td></tr>
                        ) : (
                            leaves.map((request) => (
                                <tr key={request.id}>
                                    <td>
                                        <strong>{request.employees?.full_name}</strong>
                                        <div className="text-muted-foreground text-[0.7rem]">{request.employees?.branches?.name}</div>
                                    </td>
                                    <td><span className="pill">{request.type}</span></td>
                                    <td>
                                        {new Date(request.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                        {" – "}
                                        {new Date(request.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                    </td>
                                    <td className="max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis">
                                        {request.reason || "—"}
                                    </td>
                                    <td>
                                        <span className={`pill ${request.status === "APPROVED" ? "pill-success" : request.status === "REJECTED" ? "pill-destructive" : "pill-warning"}`}>
                                            {request.status}
                                        </span>
                                    </td>
                                    <td>
                                        {request.status === "PENDING" && (
                                            <div className="flex gap-2">
                                                <button type="button" className="button button-secondary h-7 text-xs text-accent-2" onClick={() => handleAction(request.id, "APPROVED")}>Approve</button>
                                                <button type="button" className="button button-secondary h-7 text-xs text-destructive" onClick={() => handleAction(request.id, "REJECTED")}>Reject</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showApply && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50">
                    <div className="card w-full max-w-[450px]">
                        <h2>Apply for Leave</h2>
                        <form onSubmit={handleApply} className="mt-4 flex flex-col gap-4">
                            <div className="form-group">
                                <label className="label">Employee</label>
                                <select className="input" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                                    <option value="">Select Employee</option>
                                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Leave Type</label>
                                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
                                    <option value="CASUAL">Casual Leave</option>
                                    <option value="SICK">Sick Leave</option>
                                    <option value="PAID">Paid Leave</option>
                                    <option value="LOP">Loss of Pay</option>
                                </select>
                            </div>
                            <div className="flex gap-4">
                                <div className="form-group flex-1">
                                    <label className="label">Start Date</label>
                                    <input className="input" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                                </div>
                                <div className="form-group flex-1">
                                    <label className="label">End Date</label>
                                    <input className="input" type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="label">Reason</label>
                                <textarea className="input h-20 py-2 px-3 resize-y" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional reason..." />
                            </div>
                            <div className="flex justify-end gap-2 border-t border-border pt-4">
                                <button type="button" className="button button-secondary" onClick={() => setShowApply(false)}>Cancel</button>
                                <button type="submit" className="button button-primary">Submit Request</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmAction && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-[60]">
                    <div className="card w-full max-w-[400px]">
                        <h2>Confirm Action</h2>
                        <p className="mt-2">
                            Are you sure you want to <strong>{confirmAction.status === "APPROVED" ? "approve" : "reject"}</strong> this leave request?
                        </p>
                        <div className="flex justify-end gap-2 mt-6 border-t border-border pt-4">
                            <button type="button" className="button button-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                            <button
                                type="button"
                                className={`button ${confirmAction.status === "APPROVED" ? "button-primary" : "button-destructive"}`}
                                onClick={executeAction}
                            >
                                {confirmAction.status === "APPROVED" ? "Approve" : "Reject"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
