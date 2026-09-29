"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { supabaseBrowser } from "../lib/supabase/client";

export type UserRole =
  | "SUPER_ADMIN"
  | "BRAND_ADMIN"
  | "BRANCH_ADMIN"
  | "MANAGER"
  | "BRANCH_STAFF"
  | "BRANCH_MANAGER"
  | "PAYROLL_MANAGER"
  | "EMPLOYEE"
  | null;

interface AuthContextType {
  role: UserRole;
  email: string;
  userId: string;
  brandId: string | null;
  branchId: string | null;
  brandIds: string[];
  branchIds: string[];
  fullName: string;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  role: null,
  email: "",
  userId: "",
  brandId: null,
  branchId: null,
  brandIds: [],
  branchIds: [],
  fullName: "",
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

/** Check if current user has one of the allowed roles */
export function useHasRole(...roles: UserRole[]) {
  const { role } = useAuth();
  return roles.includes(role);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function hydrateUser() {
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data.user;
      if (user) {
        const meta = user.user_metadata || {};
        const metaRole = (meta.role as UserRole) || "BRANCH_STAFF";

        setEmail(user.email || "");
        setUserId(user.id);
        setFullName(meta.full_name || "");
        setBrandId(meta.brand_id || null);
        setBranchId(meta.branch_id || null);

        const initialBrandIds = Array.isArray(meta.brand_ids)
          ? meta.brand_ids
          : meta.brand_id
          ? [meta.brand_id]
          : [];
        const initialBranchIds = Array.isArray(meta.branch_ids)
          ? meta.branch_ids
          : meta.branch_id
          ? [meta.branch_id]
          : [];

        setBrandIds(initialBrandIds);
        setBranchIds(initialBranchIds);

        // Fetch profile to get authoritative role, brand, branch, brand_ids, branch_ids
        try {
          const { data: profile } = await supabaseBrowser
            .from("profiles")
            .select("role, brand_id, branch_id, brand_ids, branch_ids, full_name, email")
            .eq("id", user.id)
            .maybeSingle();

          if (profile) {
            setRole((profile.role as UserRole) || metaRole);
            if (profile.brand_id) setBrandId(profile.brand_id);
            if (profile.branch_id) setBranchId(profile.branch_id);
            if (profile.full_name) setFullName(profile.full_name);

            const pBrandIds = Array.isArray(profile.brand_ids) && profile.brand_ids.length > 0
              ? profile.brand_ids
              : profile.brand_id ? [profile.brand_id] : initialBrandIds;

            const pBranchIds = Array.isArray(profile.branch_ids) && profile.branch_ids.length > 0
              ? profile.branch_ids
              : profile.branch_id ? [profile.branch_id] : initialBranchIds;

            setBrandIds(pBrandIds);
            setBranchIds(pBranchIds);
          } else {
            setRole(metaRole);
          }
        } catch {
          setRole(metaRole);
        }
      }
      setLoading(false);
    }

    hydrateUser();

    const { data: authListener } = supabaseBrowser.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          const user = session.user;
          const meta = user.user_metadata || {};
          setRole((meta.role as UserRole) || "BRANCH_STAFF");
          setEmail(user.email || "");
          setUserId(user.id);
          setFullName(meta.full_name || "");
          setBrandId(meta.brand_id || null);
          setBranchId(meta.branch_id || null);
          setBrandIds(Array.isArray(meta.brand_ids) ? meta.brand_ids : (meta.brand_id ? [meta.brand_id] : []));
          setBranchIds(Array.isArray(meta.branch_ids) ? meta.branch_ids : (meta.branch_id ? [meta.branch_id] : []));
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ role, email, userId, brandId, branchId, brandIds, branchIds, fullName, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}
