"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { supabaseBrowser } from "../lib/supabase/client";

type UserRole = "SUPER_ADMIN" | "PAYROLL_MANAGER" | "BRANCH_MANAGER" | "EMPLOYEE" | null;

interface AuthContextType {
  role: UserRole;
  email: string;
  userId: string;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  role: null,
  email: "",
  userId: "",
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
  // Middleware guarantees we have a valid session here.
  // No loading spinner or redirect needed — just hydrate user context.
  const [role, setRole] = useState<UserRole>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function hydrateUser() {
      const { data } = await supabaseBrowser.auth.getUser();
      const user = data.user;
      if (user) {
        setRole((user.user_metadata?.role as UserRole) || "EMPLOYEE");
        setEmail(user.email || "");
        setUserId(user.id);
      }
      setLoading(false);
    }

    hydrateUser();

    const { data: authListener } = supabaseBrowser.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          const userRole = (session.user.user_metadata?.role as UserRole) || "EMPLOYEE";
          setRole(userRole);
          setEmail(session.user.email || "");
          setUserId(session.user.id);
        }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // Render children immediately — middleware already validated auth.
  // Context values populate asynchronously but the shell renders instantly.
  return (
    <AuthContext.Provider value={{ role, email, userId, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
