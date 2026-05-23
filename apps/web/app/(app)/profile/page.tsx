"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS, Role } from "@attendance/shared";
import { supabaseBrowser } from "../../../lib/supabase/client";

type ProfileState = {
  id: string;
  email: string;
  role: Role | "UNKNOWN";
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileState | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data.user;
      if (!user) return;

      setProfile({
        id: user.id,
        email: user.email ?? "",
        role: (user.user_metadata?.role as Role | undefined) ?? "UNKNOWN"
      });
    }

    loadProfile();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1>Profile</h1>
        <p>Account details for the current session.</p>
      </div>

      <div className="card">
        {!profile ? <p className="text-muted-foreground">Loading profile...</p> : null}
        {profile ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center py-3 border-b border-border">
              <span className="text-muted-foreground text-sm">Email</span>
              <strong>{profile.email}</strong>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border">
              <span className="text-muted-foreground text-sm">User ID</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">{profile.id}</code>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-muted-foreground text-sm">Role</span>
              <span className="pill pill-success">
                {profile.role === "UNKNOWN" ? "Unknown" : ROLE_LABELS[profile.role]}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
