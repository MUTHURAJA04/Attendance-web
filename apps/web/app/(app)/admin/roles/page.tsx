"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabaseBrowser } from "../../../../lib/supabase/client";
import { callEdgeFunction } from "../../../../lib/supabase/edge";
import { ROLE_LABELS, Role } from "@attendance/shared";

type UserSummary = {
  id: string;
  email: string;
  metadataRole: Role | null;
  profileRole: Role | null;
  branchId: string | null;
};

export default function RoleManagementPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [branchId, setBranchId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  async function loadUsers() {
    setLoadingUsers(true);
    const result = await callEdgeFunction<{ users: UserSummary[] }>(
      supabaseBrowser,
      "roles",
      { method: "GET" }
    );

    if (result.error) {
      setMessage(result.error || "Failed to load users.");
      setLoadingUsers(false);
      return;
    }

    setUsers((result.data?.users ?? []) as UserSummary[]);
    setLoadingUsers(false);
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    const result = await callEdgeFunction<{
      user: { id: string; role: Role; profileRole: Role; branchId: string | null };
    }>(supabaseBrowser, "roles", {
      method: "PATCH",
      body: {
        userId,
        role,
        branchId: branchId || null
      }
    });

    if (result.error) {
      setMessage(result.error || "Failed to update role.");
      setLoading(false);
      return;
    }

    if (!result.data?.user) {
      setMessage("Failed to update role.");
      setLoading(false);
      return;
    }

    setMessage("Role updated successfully.");
    setUsers((prev) =>
      prev.map((user) =>
        user.id === result.data!.user.id
          ? {
            ...user,
            metadataRole: result.data!.user.role as Role,
            profileRole: result.data!.user.profileRole as Role,
            branchId: result.data!.user.branchId ?? null
          }
          : user
      )
    );
    setLoading(false);
  }

  function onSelectUser(summary: UserSummary) {
    setUserId(summary.id);
    setRole((summary.metadataRole ?? summary.profileRole ?? "EMPLOYEE") as Role);
    setBranchId(summary.branchId ?? "");
    setMessage(null);
  }

  return (
    <div>
      <div className="mb-8">
        <h1>Role Management</h1>
        <p>Assign system roles to Supabase auth users (Super Admin only).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="mb-4">Users</h2>
          {loadingUsers ? <p className="text-muted-foreground">Loading users...</p> : null}
          {!loadingUsers && users.length === 0 ? <p className="text-muted-foreground">No users found.</p> : null}
          <div className="flex flex-col gap-2">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className="flex justify-between items-center p-3 rounded border border-border hover:bg-muted transition-colors text-left w-full"
                onClick={() => onSelectUser(user)}
              >
                <span className="font-medium text-sm">{user.email || user.id}</span>
                <div className="flex gap-2">
                  <span className="pill">{user.metadataRole ?? "No role"}</span>
                  <span className="text-muted-foreground text-xs">{user.branchId ? `Branch: ${user.branchId.slice(0, 8)}...` : "No branch"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4">Update Role</h2>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="form-group">
              <label className="label">Supabase User ID</label>
              <input className="input" value={userId} onChange={(event) => setUserId(event.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Role</label>
              <select className="input" value={role} onChange={(event) => setRole(event.target.value as Role)}>
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="label">Branch ID (optional)</label>
              <input className="input" value={branchId} onChange={(event) => setBranchId(event.target.value)} />
            </div>
            <button className="button button-primary w-full" type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Role"}
            </button>
            {message ? (
              <div className={`p-3 rounded text-sm ${message.includes("success") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                {message}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
