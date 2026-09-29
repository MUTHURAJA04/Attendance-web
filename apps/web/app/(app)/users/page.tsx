"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../../components/AuthGate";
import { useTenant } from "../../../components/TenantContext";
import { type Role } from "@attendance/shared";

interface UserProfileItem {
  id: string;
  full_name: string;
  email: string;
  role: Role | string;
  brand_id: string | null;
  brand_ids?: string[];
  brand_name: string | null;
  brand_names_list?: string[];
  branch_id: string | null;
  branch_ids?: string[];
  branch_name: string | null;
  branch_names_list?: string[];
  is_active: boolean;
  created_at: string;
}

export default function UsersManagementPage() {
  const { userId: currentUserId, role: callerRole, loading: authLoading } = useAuth();
  const { brands, branches, isLoading: tenantLoading } = useTenant();

  const [users, setUsers] = useState<UserProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("ALL");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "BRANCH_ADMIN" as Role,
    brand_ids: [] as string[],
    branch_ids: [] as string[],
    is_active: true,
  });

  const isSuperAdmin = callerRole === "SUPER_ADMIN";

  // Fetch Users from API
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/users?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch users");
      setUsers(data.users || []);
    } catch (err: any) {
      setFeedback({ type: "error", msg: err.message || "Could not load users" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchUsers();
    }
  }, [isSuperAdmin]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingUserId(null);
    setModalError(null);
    const initialBrandId = brands[0]?.id ?? "";
    const brandBranches = branches.filter((br) => br.brand_id === initialBrandId);

    setFormData({
      full_name: "",
      email: "",
      password: "",
      role: "BRANCH_ADMIN",
      brand_ids: initialBrandId ? [initialBrandId] : [],
      branch_ids: brandBranches[0]?.id ? [brandBranches[0].id] : [],
      is_active: true,
    });
    setFeedback(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (user: UserProfileItem) => {
    setEditingUserId(user.id);
    setModalError(null);

    const initialBrandIds = user.brand_ids && user.brand_ids.length > 0
      ? user.brand_ids
      : user.brand_id ? [user.brand_id] : [];

    const initialBranchIds = user.branch_ids && user.branch_ids.length > 0
      ? user.branch_ids
      : user.branch_id ? [user.branch_id] : [];

    setFormData({
      full_name: user.full_name,
      email: user.email,
      password: "",
      role: (user.role as Role) || "BRANCH_ADMIN",
      brand_ids: initialBrandIds,
      branch_ids: initialBranchIds,
      is_active: user.is_active,
    });
    setFeedback(null);
    setIsModalOpen(true);
  };

  // Toggle brand in multi-select
  const handleToggleBrand = (brandId: string) => {
    setFormData((prev) => {
      const exists = prev.brand_ids.includes(brandId);
      const updatedBrandIds = exists
        ? prev.brand_ids.filter((id) => id !== brandId)
        : [...prev.brand_ids, brandId];

      // Automatically unselect any branch whose brand was unselected
      const validBranchIds = prev.branch_ids.filter((branchId) => {
        const branch = branches.find((b) => b.id === branchId);
        return branch && updatedBrandIds.includes(branch.brand_id);
      });

      return {
        ...prev,
        brand_ids: updatedBrandIds,
        branch_ids: validBranchIds,
      };
    });
  };

  // Toggle branch in multi-select
  const handleToggleBranch = (branchId: string) => {
    setFormData((prev) => {
      const exists = prev.branch_ids.includes(branchId);
      const updated = exists
        ? prev.branch_ids.filter((id) => id !== branchId)
        : [...prev.branch_ids, branchId];
      return { ...prev, branch_ids: updated };
    });
  };

  // Submit Create / Edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    setModalError(null);

    try {
      if (!editingUserId && (!formData.email || !formData.password)) {
        setModalError("Email and Password are required for new users.");
        setSubmitting(false);
        return;
      }

      if (formData.role === "BRAND_ADMIN" && formData.brand_ids.length === 0) {
        setModalError("Please select at least one brand.");
        setSubmitting(false);
        return;
      }

      if (
        (formData.role === "BRANCH_ADMIN" || formData.role === "MANAGER" || formData.role === "BRANCH_STAFF") &&
        formData.branch_ids.length === 0
      ) {
        setModalError("Please select at least one branch.");
        setSubmitting(false);
        return;
      }

      const payload = {
        full_name: formData.full_name,
        role: formData.role,
        brand_ids: formData.role === "SUPER_ADMIN" ? [] : formData.brand_ids,
        branch_ids: (formData.role === "SUPER_ADMIN" || formData.role === "BRAND_ADMIN") ? [] : formData.branch_ids,
        is_active: formData.is_active,
        ...(formData.password ? { password: formData.password } : {}),
      };

      if (editingUserId) {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingUserId,
            ...payload,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update user");

        // Optimistically update local users state immediately
        const brandNamesList = payload.brand_ids.map((bid: string) => brands.find((b) => b.id === bid)?.name).filter(Boolean) as string[];
        const branchNamesList = payload.branch_ids.map((brid: string) => branches.find((b) => b.id === brid)?.name).filter(Boolean) as string[];

        setUsers((prev) =>
          prev.map((u) => {
            if (u.id !== editingUserId) return u;
            return {
              ...u,
              full_name: payload.full_name,
              role: payload.role,
              brand_id: payload.brand_ids[0] || null,
              branch_id: payload.branch_ids[0] || null,
              brand_ids: payload.brand_ids,
              branch_ids: payload.branch_ids,
              brand_names_list: brandNamesList,
              branch_names_list: branchNamesList,
              brand_name: brandNamesList.join(", "),
              branch_name: branchNamesList.join(", "),
              is_active: payload.is_active,
            };
          })
        );

        setFeedback({ type: "success", msg: "User updated successfully" });
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            ...payload,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create user");
        setFeedback({ type: "success", msg: "User created successfully" });
      }

      setIsModalOpen(false);
      await fetchUsers();

      // If updating the currently logged-in user, refresh page to sync tenant hierarchy
      if (currentUserId && editingUserId === currentUserId) {
        window.location.reload();
      }
    } catch (err: any) {
      setModalError(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle User Active Status
  const handleToggleStatus = async (user: UserProfileItem) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          is_active: !user.is_active,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to toggle status");
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u))
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete User
  const handleDeleteUser = async (user: UserProfileItem) => {
    if (!window.confirm(`Delete user "${user.full_name}" (${user.email})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users?id=${user.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setFeedback({ type: "success", msg: `User "${user.full_name}" removed` });
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Available child branches under selected brands
  const availableChildBranches = useMemo(() => {
    return branches.filter((br) => formData.brand_ids.includes(br.brand_id));
  }, [branches, formData.brand_ids]);

  // Counts by role
  const counts = useMemo(() => {
    return {
      ALL: users.length,
      SUPER_ADMIN: users.filter((u) => u.role === "SUPER_ADMIN").length,
      BRAND_ADMIN: users.filter((u) => u.role === "BRAND_ADMIN").length,
      BRANCH_ADMIN: users.filter((u) => u.role === "BRANCH_ADMIN" || u.role === "BRANCH_MANAGER").length,
      MANAGER: users.filter((u) => u.role === "MANAGER" || u.role === "PAYROLL_MANAGER").length,
      BRANCH_STAFF: users.filter((u) => u.role === "BRANCH_STAFF" || u.role === "EMPLOYEE").length,
    };
  }, [users]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.brand_name && u.brand_name.toLowerCase().includes(q)) ||
        (u.branch_name && u.branch_name.toLowerCase().includes(q));

      const matchesRole =
        filterRole === "ALL" ||
        u.role === filterRole ||
        (filterRole === "BRANCH_ADMIN" && u.role === "BRANCH_MANAGER") ||
        (filterRole === "MANAGER" && u.role === "PAYROLL_MANAGER") ||
        (filterRole === "BRANCH_STAFF" && u.role === "EMPLOYEE");

      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, filterRole]);

  // Super Admin Check
  if (!authLoading && !isSuperAdmin) {
    return (
      <div className="card max-w-[420px] mx-auto my-12 text-center p-6 space-y-2">
        <h2 className="text-base font-bold text-foreground">Access Restricted</h2>
        <p className="text-xs text-muted-foreground">
          Only the <strong>Super Admin</strong> can access user accounts and permissions.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Users</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage user accounts, roles, and branch assignments.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="button button-primary"
        >
          + Add User
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between mb-5 ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
              : "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800"
          }`}
        >
          <span>{feedback.msg}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-80 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Role Filter Tabs (Styled like Employees status tabs) */}
      <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-lg mb-6 w-fit">
        {[
          { key: "ALL", label: "All" },
          { key: "SUPER_ADMIN", label: "Super Admin" },
          { key: "BRAND_ADMIN", label: "Brand Admin" },
          { key: "BRANCH_ADMIN", label: "Branch Admin" },
          { key: "MANAGER", label: "Manager" },
          { key: "BRANCH_STAFF", label: "Staff" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilterRole(tab.key)}
            className={`px-3 py-1.5 text-xs rounded-md transition-all cursor-pointer ${
              filterRole === tab.key
                ? "bg-background shadow-sm font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            <span className="ml-1 text-[0.68rem] text-muted-foreground">
              ({counts[tab.key as keyof typeof counts] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* Search and Action Bar */}
      <div className="flex justify-between items-center mb-4 gap-3">
        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input h-9 text-xs w-full max-w-xs"
        />

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{filteredUsers.length} users</span>
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="text-xs hover:text-foreground cursor-pointer font-medium"
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-card rounded-xl border border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">User</th>
                <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Role</th>
                <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Brand</th>
                <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Branch</th>
                <th className="py-3 px-6 text-left font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Status</th>
                <th className="py-3 px-6 text-right font-medium text-xs uppercase tracking-widest text-muted-foreground whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground text-xs">
                    Loading user accounts...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground text-xs">
                    No users found for this filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const brandList = u.brand_names_list || (u.brand_name ? u.brand_name.split(", ") : []);
                  const branchList = u.branch_names_list || (u.branch_name ? u.branch_name.split(", ") : []);

                  return (
                    <tr key={u.id} className={`transition-colors hover:bg-muted/30 ${!u.is_active ? "opacity-60" : ""}`}>
                      {/* Name & Email */}
                      <td className="py-3 px-6">
                        <div className="flex flex-col">
                          <strong className="font-medium text-foreground text-sm">{u.full_name}</strong>
                          <span className="text-muted-foreground text-xs">{u.email || "—"}</span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-6">
                        <span className="pill text-xs !bg-secondary !text-secondary-foreground">
                          {u.role}
                        </span>
                      </td>

                      {/* Brand(s) (Shortened with badge for multiple) */}
                      <td className="py-3 px-6">
                        {u.role === "SUPER_ADMIN" ? (
                          <span className="text-muted-foreground text-xs italic">All Brands</span>
                        ) : brandList.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : brandList.length === 1 ? (
                          <span className="text-foreground text-xs font-medium">{brandList[0]}</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground text-xs font-medium">{brandList[0]}</span>
                            <span
                              className="pill text-[0.65rem] !bg-secondary !text-secondary-foreground cursor-help"
                              title={brandList.join(", ")}
                            >
                              +{brandList.length - 1}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Branch(es) (Shortened with badge for multiple) */}
                      <td className="py-3 px-6">
                        {u.role === "SUPER_ADMIN" ? (
                          <span className="text-muted-foreground text-xs italic">All Branches</span>
                        ) : u.role === "BRAND_ADMIN" ? (
                          <span className="text-muted-foreground text-xs italic">All Brand Branches</span>
                        ) : branchList.length === 0 ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : branchList.length === 1 ? (
                          <span className="text-foreground text-xs font-medium">{branchList[0]}</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-foreground text-xs font-medium">{branchList[0]}</span>
                            <span
                              className="pill text-[0.65rem] !bg-secondary !text-secondary-foreground cursor-help"
                              title={branchList.join(", ")}
                            >
                              +{branchList.length - 1}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-6">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          className={`pill text-xs cursor-pointer transition-colors ${
                            u.is_active ? "pill-success" : "pill-destructive"
                          }`}
                          title="Click to toggle status"
                        >
                          {u.is_active ? "Active" : "Disabled"}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(u)}
                            className="button button-secondary h-8 text-xs bg-background cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="button button-secondary h-8 text-xs text-destructive hover:bg-destructive/10 bg-background cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit Modal (Matching Project Modal Style) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 grid place-items-center z-50 overflow-y-auto py-10">
          <div className="card w-full max-w-[480px] my-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">
                {editingUserId ? "Edit User" : "Add New User"}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm cursor-pointer p-1 -mr-1"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {modalError && (
              <div className="p-3 bg-red-50 text-red-900 border border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800 rounded-lg text-xs mb-4">
                {modalError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="form-group">
                <label className="label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rajesh Kumar"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="input"
                />
              </div>

              {/* Email */}
              <div className="form-group">
                <label className="label">Email Address *</label>
                <input
                  type="email"
                  required
                  disabled={Boolean(editingUserId)}
                  placeholder="user@restaurant.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input disabled:opacity-50"
                />
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="label">
                  {editingUserId ? "Reset Password (leave blank to keep current)" : "Password *"}
                </label>
                <input
                  type="password"
                  required={!editingUserId}
                  placeholder={editingUserId ? "••••••••" : "Min 6 characters"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input font-mono"
                />
              </div>

              {/* Role */}
              <div className="form-group">
                <label className="label">Role Assignment *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                  className="input"
                >
                  <option value="SUPER_ADMIN">Super Admin </option>
                  <option value="BRAND_ADMIN">Brand Admin</option>
                  <option value="BRANCH_ADMIN">Branch Admin</option>
                  <option value="MANAGER">Manager</option>
                  <option value="BRANCH_STAFF">Branch Staff</option>
                </select>
              </div>

              {/* Brand Assignment (For BRAND_ADMIN) */}
              {formData.role === "BRAND_ADMIN" && (
                <div className="form-group space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="label">Brand Assignment</label>
                    <span className="text-xs text-muted-foreground">
                      {formData.brand_ids.length} selected
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg border border-border bg-muted/30 max-h-36 overflow-y-auto">
                    {brands.length === 0 ? (
                      <p className="text-xs text-muted-foreground col-span-2 py-2 text-center">No brands available</p>
                    ) : (
                      brands.map((b) => {
                        const isChecked = formData.brand_ids.includes(b.id);
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleToggleBrand(b.id)}
                            className={`px-3 py-1.5 rounded-md text-xs text-left transition-all cursor-pointer flex items-center justify-between border ${
                              isChecked
                                ? "bg-primary text-primary-foreground border-primary font-medium"
                                : "bg-card border-border/80 text-muted-foreground hover:text-foreground hover:border-border"
                            }`}
                          >
                            <span className="truncate">{b.name}</span>
                            <span className="text-[0.7rem] ml-1">{isChecked ? "✓" : "+"}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Brand & Branch Assignment (For BRANCH_ADMIN, MANAGER, STAFF) */}
              {formData.role !== "SUPER_ADMIN" && formData.role !== "BRAND_ADMIN" && (
                <>
                  {/* Select Brand */}
                  <div className="form-group space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="label">Brand Assignment</label>
                      <span className="text-xs text-muted-foreground">
                        {formData.brand_ids.length} selected
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-2 rounded-lg border border-border bg-muted/30 max-h-32 overflow-y-auto">
                      {brands.length === 0 ? (
                        <p className="text-xs text-muted-foreground col-span-2 py-2 text-center">No brands available</p>
                      ) : (
                        brands.map((b) => {
                          const isChecked = formData.brand_ids.includes(b.id);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => handleToggleBrand(b.id)}
                              className={`px-3 py-1.5 rounded-md text-xs text-left transition-all cursor-pointer flex items-center justify-between border ${
                                isChecked
                                  ? "bg-primary text-primary-foreground border-primary font-medium"
                                  : "bg-card border-border/80 text-foreground hover:text-foreground hover:border-border"
                              }`}
                            >
                              <span className="truncate">{b.name}</span>
                              <span className="text-[0.7rem] ml-1">{isChecked ? "✓" : "+"}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Select Branch (Minimal flat list of child branches) */}
                  <div className="form-group space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="label">Branch Assignment</label>
                      <span className="text-xs text-muted-foreground">
                        {formData.branch_ids.length} selected
                      </span>
                    </div>

                    <div className="p-2 rounded-lg border border-border bg-muted/30 max-h-44 overflow-y-auto">
                      {formData.brand_ids.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Select a brand above to view branches
                        </p>
                      ) : availableChildBranches.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No branches available under selected brand(s)
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                          {availableChildBranches.map((br) => {
                            const isChecked = formData.branch_ids.includes(br.id);
                            return (
                              <button
                                key={br.id}
                                type="button"
                                onClick={() => handleToggleBranch(br.id)}
                                className={`px-3 py-1.5 rounded-md text-xs text-left transition-all cursor-pointer flex items-center justify-between border ${
                                  isChecked
                                    ? "bg-primary text-primary-foreground border-primary font-medium"
                                    : "bg-card border-border/80 text-foreground hover:text-foreground hover:border-border"
                                }`}
                              >
                                <span className="truncate">{br.name}</span>
                                <span className="text-[0.7rem] ml-1 shrink-0">{isChecked ? "✓" : "+"}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="modal-user-status"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded cursor-pointer"
                />
                <label htmlFor="modal-user-status" className="text-xs text-foreground cursor-pointer select-none">
                  Active account (Allow login)
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-border mt-5">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : editingUserId ? "Save Changes" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
