"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "../../../../../lib/supabase/client";
import { useTenant } from "../../../../../components/TenantContext";
import type { AttendanceStatus } from "../../../../../lib/types";

interface PunchLog {
  id: string;
  check_in: string;
  check_out: string | null;
  status: string;
}

interface EmployeeDailyData {
  employee_id: string;
  full_name: string;
  logs: PunchLog[];
  leave: { id: string; status: string } | null;
  isEditing: boolean;
  editForm: {
    punches: { id: string | null; check_in: string; check_out: string; status: AttendanceStatus }[];
    status: AttendanceStatus;
  };
}

export default function DailyAttendancePage() {
  const params = useParams();
  const router = useRouter();
  const dateParam = params.date as string; // Format: YYYY-MM-DD
  const { selectedBranch: globalBranch, isLoading: tenantLoading } = useTenant();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeDailyData[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    if (tenantLoading || !dateParam) return;
    setLoading(true);

    const startIST = `${dateParam}T00:00:00+05:30`;
    const endIST = `${dateParam}T23:59:59+05:30`;

    let empQuery = supabaseBrowser.from("employees").select("id, full_name").eq("status", "ACTIVE");
    let logsQuery = supabaseBrowser.from("attendance_logs").select("id, employee_id, check_in, check_out, status").gte("check_in", startIST).lte("check_in", endIST).order("check_in", { ascending: true });
    let leavesQuery = supabaseBrowser.from("leave_requests").select("id, employee_id, start_date, end_date, status, employees!inner(branch_id)").in("status", ["APPROVED", "PENDING"]).lte("start_date", dateParam).gte("end_date", dateParam);

    if (globalBranch) {
      empQuery = empQuery.eq("branch_id", globalBranch.id);
      logsQuery = logsQuery.eq("branch_id", globalBranch.id);
      leavesQuery = leavesQuery.eq("employees.branch_id", globalBranch.id);
    }

    const [empRes, logsRes, leavesRes] = await Promise.all([empQuery, logsQuery, leavesQuery]);
    
    const empData = empRes.data || [];
    const logData = logsRes.data || [];
    const leaveData = leavesRes.data || [];

    const processedData: EmployeeDailyData[] = empData.map(emp => {
      const empLogs = logData.filter(l => l.employee_id === emp.id);
      const empLeave = leaveData.find(l => l.employee_id === emp.id);
      
      return {
        employee_id: emp.id,
        full_name: emp.full_name,
        logs: empLogs,
        leave: empLeave ? { id: empLeave.id, status: empLeave.status } : null,
        isEditing: false,
        editForm: { punches: [], status: "PRESENT" }
      };
    });

    setEmployees(processedData);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [dateParam, globalBranch, tenantLoading]);

  const toggleEdit = (empId: string) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.employee_id !== empId) return { ...emp, isEditing: false };
      if (!emp.isEditing) {
        // Entering edit mode: setup form state
        const punches = emp.logs.length > 0 ? emp.logs.map(l => ({
          id: l.id,
          check_in: new Date(l.check_in).toTimeString().substring(0, 5),
          check_out: l.check_out ? new Date(l.check_out).toTimeString().substring(0, 5) : "",
          status: l.status as AttendanceStatus
        })) : [{ id: null, check_in: "09:00", check_out: "18:00", status: "PRESENT" as AttendanceStatus }];
        
        return { 
          ...emp, 
          isEditing: true, 
          editForm: { punches, status: punches[0].status } 
        };
      }
      return { ...emp, isEditing: false };
    }));
  };

  const updateEditForm = (empId: string, punchIndex: number, field: string, value: string) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.employee_id !== empId) return emp;
      const newPunches = [...emp.editForm.punches];
      (newPunches[punchIndex] as any)[field] = value;
      return { ...emp, editForm: { ...emp.editForm, punches: newPunches } };
    }));
  };

  const addPunchToForm = (empId: string) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.employee_id !== empId) return emp;
      return { 
        ...emp, 
        editForm: { 
          ...emp.editForm, 
          punches: [...emp.editForm.punches, { id: null, check_in: "12:00", check_out: "16:00", status: emp.editForm.punches[0]?.status || "PRESENT" }] 
        } 
      };
    }));
  };

  const removePunchFromForm = (empId: string, punchIndex: number) => {
    setEmployees(prev => prev.map(emp => {
      if (emp.employee_id !== empId) return emp;
      const newPunches = [...emp.editForm.punches];
      newPunches.splice(punchIndex, 1);
      return { ...emp, editForm: { ...emp.editForm, punches: newPunches } };
    }));
  };

  const handleSavePunches = async (empId: string) => {
    const emp = employees.find(e => e.employee_id === empId);
    if (!emp) return;

    if (emp.editForm.punches.length > 0 && emp.leave) {
      const confirmed = window.confirm(
        `This employee has an existing Leave Request for today. Adding manual punches will automatically delete their leave request. Do you want to proceed?`
      );
      if (!confirmed) return;
      
      // Delete the conflicting leave request
      setSaving(true);
      await supabaseBrowser.from("leave_requests").delete().eq("id", emp.leave.id);
    } else {
      setSaving(true);
    }
    
    // First, delete existing logs for this day for this employee to cleanly replace them
    const startIST = `${dateParam}T00:00:00+05:30`;
    const endIST = `${dateParam}T23:59:59+05:30`;
    await supabaseBrowser.from("attendance_logs")
      .delete()
      .eq("employee_id", empId)
      .gte("check_in", startIST)
      .lte("check_in", endIST);

    // Insert new punches
    if (emp.editForm.punches.length > 0) {
      const inserts = emp.editForm.punches.map(p => ({
        employee_id: empId,
        branch_id: globalBranch?.id,
        check_in: new Date(`${dateParam}T${p.check_in}:00+05:30`).toISOString(),
        check_out: p.check_out ? new Date(`${dateParam}T${p.check_out}:00+05:30`).toISOString() : null,
        status: p.status,
        source: "MANUAL"
      }));
      await supabaseBrowser.from("attendance_logs").insert(inserts);
    }
    
    setSaving(false);
    await loadData();
  };

  const calculateHours = (logs: PunchLog[]) => {
    let totalMs = 0;
    logs.forEach(l => {
      if (l.check_in && l.check_out) {
        totalMs += (new Date(l.check_out).getTime() - new Date(l.check_in).getTime());
      }
    });
    if (totalMs === 0) return "-";
    const hrs = totalMs / (1000 * 60 * 60);
    return `${hrs.toFixed(1)} hrs`;
  };

  if (!dateParam) return <div>Invalid date</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/attendance" className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium">
              ← Back to Monthly Grid
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Daily Attendance Review</h1>
          <p className="text-muted-foreground mt-1">
            {new Date(dateParam).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading attendance data...</div>
          ) : employees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No employees found.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Header Row */}
              <div className="flex items-center justify-between px-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="w-1/4">Employee</div>
                <div className="w-1/4">Punches</div>
                <div className="w-1/6">Total Hours</div>
                <div className="w-1/5">Status</div>
                <div className="w-24 text-right">Actions</div>
              </div>

              {employees.map(emp => (
                <div key={emp.employee_id} className={`border border-border rounded-xl overflow-hidden transition-colors ${emp.isEditing ? 'border-primary/50 shadow-sm' : 'hover:border-border/80'}`}>
                  
                  {/* Row Header */}
                  <div className="flex items-center justify-between p-4 bg-card">
                    <div className="w-1/4 font-semibold">{emp.full_name}</div>
                    
                    <div className="w-1/4">
                      {emp.logs.length > 0 ? (
                        <div className="text-sm font-medium">
                          {emp.logs.map((l, i) => (
                            <div key={i}>
                              {new Date(l.check_in).toTimeString().substring(0, 5)} - {l.check_out ? new Date(l.check_out).toTimeString().substring(0, 5) : "TBD"}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No punches</div>
                      )}
                    </div>
                    
                    <div className="w-1/6 font-medium text-sm">
                      {calculateHours(emp.logs)}
                    </div>

                    <div className="w-1/5">
                      {emp.logs.length > 0 ? (
                        <span className="pill text-[0.65rem] !bg-emerald-100 !text-emerald-800">Present</span>
                      ) : emp.leave ? (
                        <span className={`pill text-[0.65rem] ${emp.leave.status === 'APPROVED' ? '!bg-indigo-100 !text-indigo-800' : '!bg-pink-100 !text-pink-800'}`}>
                          {emp.leave.status === 'APPROVED' ? 'Appr. Leave' : 'Unappr. Leave'}
                        </span>
                      ) : (
                        <span className="pill text-[0.65rem] !bg-red-100 !text-red-800">Uninformed</span>
                      )}
                    </div>
                    
                    <div className="w-24 flex justify-end">
                      <button onClick={() => toggleEdit(emp.employee_id)} className="button button-secondary text-xs px-3 py-1">
                        {emp.isEditing ? "Cancel" : "Modify"}
                      </button>
                    </div>
                  </div>

                  {/* Edit Panel */}
                  {emp.isEditing && (
                    <div className="bg-muted/20 p-4 border-t border-border flex flex-col gap-4">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Manual Punches Override</div>
                      
                      {emp.editForm.punches.map((punch, idx) => (
                        <div key={idx} className="flex items-end gap-4">
                          <div className="form-group flex-1">
                            <label className="label text-xs">IN Time</label>
                            <input type="time" className="input py-1.5" value={punch.check_in} onChange={e => updateEditForm(emp.employee_id, idx, 'check_in', e.target.value)} />
                          </div>
                          <div className="form-group flex-1">
                            <label className="label text-xs">OUT Time</label>
                            <input type="time" className="input py-1.5" value={punch.check_out} onChange={e => updateEditForm(emp.employee_id, idx, 'check_out', e.target.value)} />
                          </div>
                          <div className="form-group flex-1">
                            <label className="label text-xs">Status</label>
                            <select className="input py-1.5" value={punch.status} onChange={e => updateEditForm(emp.employee_id, idx, 'status', e.target.value)}>
                              <option value="PRESENT">Present</option>
                              <option value="HALF_DAY">Half Day</option>
                              <option value="LATE">Late</option>
                              <option value="OT">Overtime</option>
                            </select>
                          </div>
                          <button onClick={() => removePunchFromForm(emp.employee_id, idx)} className="button button-secondary text-destructive px-3 py-1.5 h-[34px]">✕</button>
                        </div>
                      ))}
                      
                      <div className="flex justify-between items-center mt-2">
                        <button onClick={() => addPunchToForm(emp.employee_id)} className="text-primary text-xs font-semibold hover:underline">+ Add Split Shift Punch</button>
                        <button onClick={() => handleSavePunches(emp.employee_id)} disabled={saving} className="button button-primary text-xs px-4 py-1.5">
                          {saving ? "Saving..." : "Save Punches"}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
