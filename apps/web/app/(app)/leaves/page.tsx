"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import type { LeaveRequest, LeaveType, Employee } from "../../../lib/types";

type EmployeeWithShift = Pick<
    Employee,
    "id" | "full_name" | "branch_id" | "shift_start" | "shift_end" | "shift_type" | "role" | "employee_code" | "paid_off_days"
>;

// Helper to get current Date & Time in IST (Asia/Kolkata)
const getISTNow = () => {
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now); // "YYYY-MM-DD"

    const timeStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(now); // "HH:MM"

    return { todayIST: dateStr, currentISTTime: timeStr };
};

// Helper to format HH:MM or HH:MM:SS into 12-hour AM/PM
const format12Hour = (timeStr?: string | null) => {
    if (!timeStr) return "10:00 AM";
    try {
        const [hStr, mStr] = timeStr.split(":");
        let h = parseInt(hStr, 10);
        const m = mStr || "00";
        const ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
    } catch {
        return timeStr;
    }
};

export default function LeavesPage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth());
    const [year, setYear] = useState(now.getFullYear());

    const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
    const [employees, setEmployees] = useState<EmployeeWithShift[]>([]);
    const [loading, setLoading] = useState(true);
    const [showApply, setShowApply] = useState(false);
    const [showEdit, setShowEdit] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ id: string, status: "APPROVED" | "REJECTED" | "DELETE" } | null>(null);

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

        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0);
        
        const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(endOfMonth.getDate()).padStart(2, "0")}`;

        let leaveQuery = supabaseBrowser
            .from("leave_requests")
            .select("*, employees!inner(full_name, branch_id, branches(name))")
            .lte("start_date", endStr)
            .gte("end_date", startStr)
            .order("created_at", { ascending: false });
            
        let empQuery = supabaseBrowser
            .from("employees")
            .select("id, full_name, branch_id, shift_start, shift_end, shift_type, role, employee_code, paid_off_days")
            .eq("status", "ACTIVE");

        if (globalBranch) {
            leaveQuery = leaveQuery.eq("employees.branch_id", globalBranch.id);
            empQuery = empQuery.eq("branch_id", globalBranch.id);
        }

        const [leavesRes, empsRes] = await Promise.all([
            leaveQuery,
            empQuery,
        ]);
        setLeaves((leavesRes.data as LeaveRequest[]) || []);
        setEmployees((empsRes.data as EmployeeWithShift[]) || []);
        setLoading(false);
    }

    useEffect(() => {
        loadLeaves();
    }, [globalBranch, tenantLoading, month, year]);

    // Check scheduled week-off availability for selected employee
    const selectedEmp = employees.find((e) => e.id === form.employee_id);
    const scheduledWeekOffCount = selectedEmp ? (selectedEmp.paid_off_days ?? 4) : 0;
    const hasWeekOffAvailable = scheduledWeekOffCount >= 1;

    // Reset leave type to default if selected employee has 0 scheduled week-offs and WEEK_OFF is selected
    useEffect(() => {
        if (!hasWeekOffAvailable && form.type === "WEEK_OFF") {
            setForm((prev) => ({ ...prev, type: "CASUAL" }));
        }
    }, [form.employee_id, hasWeekOffAvailable, form.type]);

    // Validation: check if employee shift has already started
    const validateShiftForLeave = (
        employeeId: string,
        startDate: string,
        endDate: string
    ): { valid: boolean; error?: string; shiftStartStr?: string } => {
        const emp = employees.find((e) => e.id === employeeId);
        if (!emp) return { valid: true };

        const { todayIST, currentISTTime } = getISTNow();
        const shiftStart = emp.shift_start ? emp.shift_start.substring(0, 5) : "10:00";
        const shiftStart12 = format12Hour(shiftStart);
        const current12 = format12Hour(currentISTTime);

        // 1. If start date is in the past
        if (startDate < todayIST) {
            return {
                valid: false,
                error: `Cannot apply leave for past date (${startDate}). Leave must be applied before shift starts.`,
                shiftStartStr: shiftStart12,
            };
        }

        // 2. If leave covers today, check if current time is past shift start
        if (startDate <= todayIST && endDate >= todayIST) {
            if (currentISTTime >= shiftStart) {
                return {
                    valid: false,
                    error: `Shift already started! ${emp.full_name}'s shift began at ${shiftStart12} today (Current IST time is ${current12}). Leave cannot be applied once the shift has started.`,
                    shiftStartStr: shiftStart12,
                };
            }
        }

        return { valid: true, shiftStartStr: shiftStart12 };
    };

    const handleAction = (id: string, status: "APPROVED" | "REJECTED" | "DELETE") => {
        setConfirmAction({ id, status });
    };

    const executeAction = async () => {
        if (!confirmAction) return;
        const { id, status } = confirmAction;
        setConfirmAction(null);
        setLoading(true);
        
        if (status === "DELETE") {
            await supabaseBrowser.from("leave_requests").delete().eq("id", id);
        } else {
            await supabaseBrowser.from("leave_requests").update({ status }).eq("id", id);
        }
        
        await loadLeaves();
    };

    const handleApply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.employee_id) { alert("Select an employee."); return; }
        if (new Date(form.end_date) < new Date(form.start_date)) { alert("End date must be after start date."); return; }

        // Enforce Shift Start Rule
        const shiftValidation = validateShiftForLeave(form.employee_id, form.start_date, form.end_date);
        if (!shiftValidation.valid) {
            alert(shiftValidation.error);
            return;
        }

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

    const handleEditClick = (leave: LeaveRequest) => {
        setForm({
            employee_id: leave.employee_id,
            type: leave.type,
            start_date: leave.start_date,
            end_date: leave.end_date,
            reason: leave.reason || "",
        });
        setShowEdit(leave.id);
    };

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (new Date(form.end_date) < new Date(form.start_date)) { alert("End date must be after start date."); return; }
        
        // Enforce Shift Start Rule
        const shiftValidation = validateShiftForLeave(form.employee_id, form.start_date, form.end_date);
        if (!shiftValidation.valid) {
            alert(shiftValidation.error);
            return;
        }

        const { error } = await supabaseBrowser.from("leave_requests").update({
            type: form.type,
            start_date: form.start_date,
            end_date: form.end_date,
            reason: form.reason || null,
        }).eq("id", showEdit);

        if (!error) {
            setShowEdit(null);
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
                    <h1 className="text-2xl font-bold">Leave Management</h1>
                    <p className="text-muted-foreground mt-1">Review, approve, and track employee leave applications.</p>
                </div>
                <div className="flex gap-2 items-center">
                    <select className="input h-9" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                        {Array.from({ length: 12 }).map((_, i) => (
                            <option key={i} value={i}>{new Date(2000, i).toLocaleString("default", { month: "long" })}</option>
                        ))}
                    </select>
                    <select className="input h-9" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                        {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <button className="button button-primary ml-2" onClick={() => {
                        setForm({ employee_id: "", type: "CASUAL", start_date: new Date().toISOString().split("T")[0], end_date: new Date().toISOString().split("T")[0], reason: "" });
                        setShowApply(true);
                    }}>+ Apply for Leave</button>
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
                            <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading leave requests...</td></tr>
                        ) : leaves.length === 0 ? (
                            <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No leave requests found for this month.</td></tr>
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
                                        <div className="flex gap-2">
                                            {request.status === "PENDING" && (
                                                <>
                                                    <button type="button" className="button button-secondary h-7 text-xs text-indigo-600" onClick={() => handleAction(request.id, "APPROVED")}>Approve</button>
                                                    <button type="button" className="button button-secondary h-7 text-xs text-pink-600" onClick={() => handleAction(request.id, "REJECTED")}>Reject</button>
                                                </>
                                            )}
                                            <button type="button" className="button button-secondary h-7 text-xs" onClick={() => handleEditClick(request as LeaveRequest)}>Edit</button>
                                            <button type="button" className="button button-secondary h-7 text-xs text-destructive" onClick={() => handleAction(request.id, "DELETE")}>Delete</button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Apply Leave Modal */}
            {showApply && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4">
                    <div className="card w-full max-w-[460px]">
                        <h2 className="text-xl">Apply for Leave</h2>
                        <form onSubmit={handleApply} className="mt-4 flex flex-col gap-4">
                            <div className="form-group">
                                <label className="label">Employee</label>
                                <select className="input" required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                                    <option value="">Select Employee</option>
                                    {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.full_name} ({emp.role || "Staff"} • {format12Hour(emp.shift_start)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Shift Timing & Status Banner */}
                            {form.employee_id && (() => {
                                const selectedEmp = employees.find((e) => e.id === form.employee_id);
                                if (!selectedEmp) return null;
                                const { todayIST, currentISTTime } = getISTNow();
                                const shiftStart = selectedEmp.shift_start ? selectedEmp.shift_start.substring(0, 5) : "10:00";
                                const shiftEnd = selectedEmp.shift_end ? selectedEmp.shift_end.substring(0, 5) : "22:00";
                                const isTodayCovered = form.start_date <= todayIST && form.end_date >= todayIST;
                                const isPastStart = form.start_date < todayIST;
                                const isShiftStarted = isTodayCovered && currentISTTime >= shiftStart;
                                const isBlocked = isShiftStarted || isPastStart;

                                return (
                                    <div className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 transition ${
                                        isBlocked
                                            ? "bg-destructive/10 border-destructive/30 text-destructive"
                                            : "bg-muted/40 border-border text-foreground"
                                    }`}>
                                        <div className="flex items-center justify-between font-semibold">
                                            <span className="flex items-center gap-1.5">
                                                <span>⏱️ Scheduled Shift:</span>
                                                <span className="font-mono text-foreground">{format12Hour(shiftStart)} – {format12Hour(shiftEnd)}</span>
                                            </span>
                                            {isShiftStarted ? (
                                                <span className="pill pill-destructive text-[0.65rem] font-bold">Shift In Progress</span>
                                            ) : isPastStart ? (
                                                <span className="pill pill-destructive text-[0.65rem] font-bold">Past Date</span>
                                            ) : (
                                                <span className="pill pill-success text-[0.65rem] font-bold">Not Started</span>
                                            )}
                                        </div>
                                        {isShiftStarted ? (
                                            <p className="text-[0.72rem] text-destructive font-medium leading-relaxed">
                                                ⛔ <strong>Shift already started!</strong> {selectedEmp.full_name}&apos;s shift began at {format12Hour(shiftStart)} today (Current IST: {format12Hour(currentISTTime)}). Leave cannot be applied once the shift has started.
                                            </p>
                                        ) : isPastStart ? (
                                            <p className="text-[0.72rem] text-destructive font-medium leading-relaxed">
                                                ⛔ Cannot apply leave for past date ({form.start_date}). Leave must be applied before shift starts.
                                            </p>
                                        ) : (
                                            <p className="text-[0.7rem] text-muted-foreground">
                                                ✓ Shift begins at {format12Hour(shiftStart)}. Leave request can be submitted.
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}

                            <div className="form-group">
                                <label className="label">Leave Type</label>
                                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
                                    <option value="CASUAL">Casual Leave</option>
                                    <option value="SICK">Sick Leave</option>
                                    <option value="PAID">Paid Leave</option>
                                    <option value="LOP">Loss of Pay</option>
                                    {hasWeekOffAvailable && (
                                        <option value="WEEK_OFF">Scheduled Week-Off Leave</option>
                                    )}
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

            {/* Edit Leave Modal */}
            {showEdit && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 p-4">
                    <div className="card w-full max-w-[460px]">
                        <h2 className="text-xl">Edit Leave Request</h2>
                        <form onSubmit={handleEditSave} className="mt-4 flex flex-col gap-4">
                            <div className="form-group">
                                <label className="label">Employee</label>
                                <select className="input" disabled value={form.employee_id}>
                                    {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.full_name} ({emp.role || "Staff"} • {format12Hour(emp.shift_start)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Shift Timing & Status Banner */}
                            {form.employee_id && (() => {
                                const selectedEmp = employees.find((e) => e.id === form.employee_id);
                                if (!selectedEmp) return null;
                                const { todayIST, currentISTTime } = getISTNow();
                                const shiftStart = selectedEmp.shift_start ? selectedEmp.shift_start.substring(0, 5) : "10:00";
                                const shiftEnd = selectedEmp.shift_end ? selectedEmp.shift_end.substring(0, 5) : "22:00";
                                const isTodayCovered = form.start_date <= todayIST && form.end_date >= todayIST;
                                const isPastStart = form.start_date < todayIST;
                                const isShiftStarted = isTodayCovered && currentISTTime >= shiftStart;
                                const isBlocked = isShiftStarted || isPastStart;

                                return (
                                    <div className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 transition ${
                                        isBlocked
                                            ? "bg-destructive/10 border-destructive/30 text-destructive"
                                            : "bg-muted/40 border-border text-foreground"
                                    }`}>
                                        <div className="flex items-center justify-between font-semibold">
                                            <span className="flex items-center gap-1.5">
                                                <span>⏱️ Scheduled Shift:</span>
                                                <span className="font-mono text-foreground">{format12Hour(shiftStart)} – {format12Hour(shiftEnd)}</span>
                                            </span>
                                            {isShiftStarted ? (
                                                <span className="pill pill-destructive text-[0.65rem] font-bold">Shift In Progress</span>
                                            ) : isPastStart ? (
                                                <span className="pill pill-destructive text-[0.65rem] font-bold">Past Date</span>
                                            ) : (
                                                <span className="pill pill-success text-[0.65rem] font-bold">Not Started</span>
                                            )}
                                        </div>
                                        {isShiftStarted ? (
                                            <p className="text-[0.72rem] text-destructive font-medium leading-relaxed">
                                                ⛔ <strong>Shift already started!</strong> {selectedEmp.full_name}&apos;s shift began at {format12Hour(shiftStart)} today (Current IST: {format12Hour(currentISTTime)}). Leave cannot be applied once the shift has started.
                                            </p>
                                        ) : isPastStart ? (
                                            <p className="text-[0.72rem] text-destructive font-medium leading-relaxed">
                                                ⛔ Cannot apply leave for past date ({form.start_date}). Leave must be applied before shift starts.
                                            </p>
                                        ) : (
                                            <p className="text-[0.7rem] text-muted-foreground">
                                                ✓ Shift begins at {format12Hour(shiftStart)}. Leave request can be submitted.
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}

                            <div className="form-group">
                                <label className="label">Leave Type</label>
                                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as LeaveType })}>
                                    <option value="CASUAL">Casual Leave</option>
                                    <option value="SICK">Sick Leave</option>
                                    <option value="PAID">Paid Leave</option>
                                    <option value="LOP">Loss of Pay</option>
                                    {hasWeekOffAvailable && (
                                        <option value="WEEK_OFF">Scheduled Week-Off Leave</option>
                                    )}
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
                                <button type="button" className="button button-secondary" onClick={() => setShowEdit(null)}>Cancel</button>
                                <button type="submit" className="button button-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Action Modal */}
            {confirmAction && (
                <div className="fixed inset-0 bg-black/50 grid place-items-center z-[60] p-4">
                    <div className="card w-full max-w-[400px]">
                        <h2 className="text-xl">Confirm Action</h2>
                        <p className="mt-2">
                            Are you sure you want to <strong>{confirmAction.status === "DELETE" ? "delete" : confirmAction.status.toLowerCase()}</strong> this leave request?
                            {confirmAction.status === "DELETE" && <span className="block mt-1 text-xs text-muted-foreground">This action cannot be undone.</span>}
                        </p>
                        <div className="flex justify-end gap-2 mt-6 border-t border-border pt-4">
                            <button type="button" className="button button-secondary" onClick={() => setConfirmAction(null)}>Cancel</button>
                            <button
                                type="button"
                                className={`button ${confirmAction.status === "DELETE" || confirmAction.status === "REJECTED" ? "button-destructive" : "button-primary"}`}
                                onClick={executeAction}
                            >
                                {confirmAction.status === "DELETE" ? "Delete" : confirmAction.status === "APPROVED" ? "Approve" : "Reject"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
