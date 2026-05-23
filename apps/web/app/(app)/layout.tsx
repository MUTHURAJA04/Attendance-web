import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";
import { AppShell } from "../../components/AppShell";
import { TenantProvider } from "../../components/TenantContext";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <TenantProvider>
        <AppShell>{children}</AppShell>
      </TenantProvider>
    </AuthGate>
  );
}
