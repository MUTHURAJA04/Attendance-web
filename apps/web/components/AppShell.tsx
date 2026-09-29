"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { supabaseBrowser } from "../lib/supabase/client";
import { useAuth } from "./AuthGate";

type NavItem = { label: string; href: string; icon: string; roles?: string[] };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  { label: "Attendance", href: "/attendance", icon: "🕒" },
  { label: "Employees", href: "/employees", icon: "👥" },
  { label: "Payroll", href: "/payroll", icon: "💰", roles: ["SUPER_ADMIN", "PAYROLL_MANAGER"] },
  { label: "Branches", href: "/branches", icon: "🏢" },
  { label: "Holidays", href: "/holidays", icon: "📅" },
  { label: "Leaves", href: "/leaves", icon: "📄" },
  { label: "Loans & Advances", href: "/loans", icon: "💳", roles: ["SUPER_ADMIN", "PAYROLL_MANAGER"] },
  { label: "Incentives", href: "/incentives", icon: "🚀" },
  { label: "Reports", href: "/reports", icon: "📈", roles: ["SUPER_ADMIN", "PAYROLL_MANAGER"] },
];

import { useTenant } from "./TenantContext";
import { NotificationBell } from "./NotificationBell";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, email } = useAuth();
  const {
    organizations, brands, branches,
    selectedOrg, selectedBrand, selectedBranch,
    setSelectedOrg, setSelectedBrand, setSelectedBranch,
    isLoading
  } = useTenant();

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const initials = email ? email.substring(0, 2).toUpperCase() : "..";

  const filteredNav = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return role && item.roles.includes(role);
  });

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="app-layout print:block print:w-full print:min-h-0">
      <aside className="sidebar print:hidden">
        <div className="sidebar-header">
          Attendance & Payroll
        </div>
        <nav className="sidebar-nav">
          {filteredNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${pathname.startsWith(item.href) ? "active" : ""}`}
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="main-content print:p-0 print:m-0 print:w-full print:max-w-none">
        <header className="top-nav print:hidden">
          <div className="flex items-center gap-4">
            {/* Context Switcher Button */}
            {!isLoading && (
              <button
                className="button button-secondary text-xs h-8"
                onClick={() => setIsBranchModalOpen(true)}
              >
                🏢 {selectedBranch ? selectedBranch.name : "Set Working Branch"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 relative">
            <NotificationBell />

            <div
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title="Open Menu"
              className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs font-semibold cursor-pointer hover:bg-border transition-colors border border-border select-none"
            >
              {initials}
            </div>
            
            {isDropdownOpen && (
              <>
                {/* Backdrop to close dropdown when clicked outside */}
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                
                <div className="absolute right-0 top-full mt-2 w-52 rounded-lg bg-card border border-border shadow-xl z-50 p-2 flex flex-col gap-1 backdrop-blur-md">
                  <div className="px-3 py-2 border-b border-border/50 mb-1">
                    <div className="text-xs font-semibold truncate text-foreground">{email}</div>
                    <div className="text-[0.65rem] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">{role}</div>
                  </div>
                  
                  <Link
                    href="/select-brand"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary/10 text-sm text-primary font-semibold no-underline transition-colors w-full text-left"
                  >
                    🏢 Switch Brand / Branch
                  </Link>

                  <Link
                    href="/profile"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm text-foreground no-underline transition-colors w-full text-left"
                  >
                    👤 Profile
                  </Link>

                  {role && ["SUPER_ADMIN", "PAYROLL_MANAGER"].includes(role) && (
                    <Link
                      href="/hierarchy"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm text-foreground no-underline transition-colors w-full text-left"
                    >
                      🏢 Manage Brand
                    </Link>
                  )}

                  {role && ["SUPER_ADMIN", "PAYROLL_MANAGER", "BRANCH_MANAGER"].includes(role) && (
                    <Link
                      href="/wage-master"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm text-foreground no-underline transition-colors w-full text-left"
                    >
                      📋 Wage Master
                    </Link>
                  )}

                  {role && ["SUPER_ADMIN"].includes(role) && (
                    <Link
                      href="/settings"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm text-foreground no-underline transition-colors w-full text-left"
                    >
                      ⚙️ Settings
                    </Link>
                  )}

                  <Link
                    href="/logs"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm text-foreground no-underline transition-colors w-full text-left"
                  >
                    📜 Logs
                  </Link>

                  <button
                    onClick={async () => {
                      setIsDropdownOpen(false);
                      if (window.confirm("Are you sure you want to log out?")) {
                        await handleLogout();
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm text-destructive hover:text-destructive no-underline transition-colors w-full text-left bg-transparent border-0 cursor-pointer"
                  >
                    🚪 Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </header>
        <div className="page-container">
          {children}
        </div>
      </main>

      {/* Branch Selection Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-lg p-6 max-w-md w-full shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Set Working Branch</h2>
            <div className="flex flex-col gap-4">
              <div className="form-group">
                <label className="label text-xs">Organization</label>
                <select
                  className="input"
                  value={selectedOrg?.id || ""}
                  onChange={(e) => {
                    const org = organizations.find(o => o.id === e.target.value);
                    setSelectedOrg(org || null);
                  }}
                >
                  <option value="" disabled>Select Org</option>
                  {organizations.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label text-xs">Brand</label>
                <select
                  className="input"
                  value={selectedBrand?.id || ""}
                  onChange={(e) => {
                    const brand = brands.find(b => b.id === e.target.value);
                    setSelectedBrand(brand || null);
                  }}
                  disabled={!selectedOrg}
                >
                  <option value="" disabled>Select Brand</option>
                  {brands.filter(b => b.organization_id === selectedOrg?.id).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label text-xs">Branch</label>
                <select
                  className="input"
                  value={selectedBranch?.id || ""}
                  onChange={(e) => {
                    const branch = branches.find(b => b.id === e.target.value);
                    setSelectedBranch(branch || null);
                  }}
                  disabled={!selectedBrand}
                >
                  <option value="" disabled>Select Branch</option>
                  {branches.filter(b => b.brand_id === selectedBrand?.id).map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                className="button button-primary"
                onClick={() => setIsBranchModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
