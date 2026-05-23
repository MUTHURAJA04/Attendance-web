"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "../../../lib/supabase/client";
import { useTenant } from "../../../components/TenantContext";
import { useAuth } from "../../../components/AuthGate";

interface WageRole {
  id: string;
  branch_id: string;
  role_name: string;
  basic_salary: number;
  da: number;
  created_at: string;
}

export default function WageMasterPage() {
  const { selectedBranch, isLoading: isTenantLoading } = useTenant();
  const { role } = useAuth();

  const [rolesList, setRolesList] = useState<WageRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    role_name: "",
    basic_salary: "",
    da: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const canWrite = role && ["SUPER_ADMIN", "PAYROLL_MANAGER"].includes(role);

  async function loadData() {
    if (!selectedBranch?.id) return;
    setLoading(true);
    const { data, error } = await supabaseBrowser
      .from("wage_master")
      .select("*")
      .eq("branch_id", selectedBranch.id)
      .order("role_name", { ascending: true });

    if (error) {
      console.error("Failed to load wage master roles:", error);
    } else {
      setRolesList((data as WageRole[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (selectedBranch?.id) {
      loadData();
    } else if (!isTenantLoading) {
      setLoading(false);
    }
  }, [selectedBranch, isTenantLoading]);

  const resetForm = () => {
    setForm({ role_name: "", basic_salary: "", da: "" });
    setEditingId(null);
    setErrors({});
  };

  const openAdd = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (wr: WageRole) => {
    setForm({
      role_name: wr.role_name,
      basic_salary: String(wr.basic_salary),
      da: String(wr.da),
    });
    setEditingId(wr.id);
    setErrors({});
    setShowModal(true);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.role_name.trim()) {
      newErrors.role_name = "Role name is required";
    }
    
    const basic = Number(form.basic_salary);
    if (isNaN(basic) || basic < 0) {
      newErrors.basic_salary = "Must be a positive number";
    }

    const da = Number(form.da);
    if (isNaN(da) || da < 0) {
      newErrors.da = "Must be a positive number";
    }

    // Check for duplicate role name (excluding the one we're editing)
    const isDuplicate = rolesList.some(
      (r) =>
        r.role_name.toLowerCase().trim() === form.role_name.toLowerCase().trim() &&
        r.id !== editingId
    );
    if (isDuplicate) {
      newErrors.role_name = "A role with this name already exists in this branch";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !selectedBranch?.id) return;

    const payload = {
      branch_id: selectedBranch.id,
      role_name: form.role_name.trim(),
      basic_salary: Number(form.basic_salary) || 0,
      da: Number(form.da) || 0,
    };

    if (editingId) {
      const { error } = await supabaseBrowser
        .from("wage_master")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        alert("Failed to update role: " + error.message);
      }
    } else {
      const { error } = await supabaseBrowser
        .from("wage_master")
        .insert([payload]);
      if (error) {
        alert("Failed to create role: " + error.message);
      }
    }

    setShowModal(false);
    resetForm();
    loadData();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the "${name}" role?`)) return;
    const { error } = await supabaseBrowser
      .from("wage_master")
      .delete()
      .eq("id", id);
    if (error) {
      alert("Failed to delete role: " + error.message);
    } else {
      loadData();
    }
  };

  if (isTenantLoading) {
    return <div className="centered py-12">Loading Wage Master...</div>;
  }

  if (!selectedBranch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-2xl mb-4 select-none">🏢</div>
        <h2 className="text-xl font-bold mb-2">No Active Branch Selected</h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          Please select a branch from the working branch context switcher in the top nav bar to load and manage operational minimum wages.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Branch Config</span>
            <span className="text-muted-foreground text-xs">•</span>
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{selectedBranch.name}</span>
          </div>
          <h1>Wage Master</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure default operational roles and state-compliant minimum wages (Basic Salary + Dearness Allowance) for this branch.
          </p>
        </div>
        {canWrite && (
          <button className="button button-primary shrink-0" onClick={openAdd}>
            + Add Operational Role
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden shadow-sm border border-border">
        <table className="role-table">
          <thead>
            <tr>
              <th>Role Type / Designation</th>
              <th>Basic Salary (min)</th>
              <th>Dearness Allowance (DA)</th>
              <th>Total Minimum Wage</th>
              {canWrite && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className="centered py-8">
                  Loading roles and wages...
                </td>
              </tr>
            ) : rolesList.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 5 : 4} className="centered py-8 text-muted-foreground italic">
                  No roles configured for {selectedBranch.name} yet. {canWrite && "Click '+ Add Operational Role' to define one."}
                </td>
              </tr>
            ) : (
              rolesList.map((r) => {
                const total = r.basic_salary + r.da;
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td>
                      <strong className="text-foreground font-semibold">{r.role_name}</strong>
                    </td>
                    <td>₹{r.basic_salary.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td>₹{r.da.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className="pill pill-success font-medium">
                        ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="button button-secondary h-8 text-xs font-medium"
                            onClick={() => openEdit(r)}
                          >
                            Edit
                          </button>
                          <button
                            className="button button-secondary h-8 text-xs font-medium text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(r.id, r.role_name)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="card w-full max-w-[450px] shadow-2xl border border-border bg-card text-card-foreground animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-1">
              {editingId ? "Edit Operational Role" : "Add Operational Role"}
            </h2>
            <p className="text-xs text-muted-foreground mb-6">
              Define the minimum base pay configuration for this role type.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="label text-xs font-semibold uppercase tracking-wider mb-1">Role Name / Designation *</label>
                <input
                  className={`input ${errors.role_name ? "border-destructive focus:border-destructive focus:ring-destructive/20" : ""}`}
                  required
                  value={form.role_name}
                  onChange={(e) => setForm({ ...form, role_name: e.target.value })}
                  placeholder="e.g. Dosa Master, Senior Chef, Cashier"
                />
                {errors.role_name && (
                  <span className="text-xs text-destructive mt-1 font-medium">{errors.role_name}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="label text-xs font-semibold uppercase tracking-wider min-h-[32px] flex items-end pb-1">Basic Salary *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₹</span>
                    <input
                      className={`input pl-7 w-full ${errors.basic_salary ? "border-destructive focus:border-destructive" : ""}`}
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={form.basic_salary}
                      onChange={(e) => setForm({ ...form, basic_salary: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.basic_salary && (
                    <span className="text-xs text-destructive mt-1 font-medium">{errors.basic_salary}</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="label text-xs font-semibold uppercase tracking-wider min-h-[32px] flex items-end pb-1">DA (Dearness Allowance) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₹</span>
                    <input
                      className={`input pl-7 w-full ${errors.da ? "border-destructive focus:border-destructive" : ""}`}
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={form.da}
                      onChange={(e) => setForm({ ...form, da: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.da && (
                    <span className="text-xs text-destructive mt-1 font-medium">{errors.da}</span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6 border-t border-border pt-4">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary">
                  {editingId ? "Save Changes" : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
