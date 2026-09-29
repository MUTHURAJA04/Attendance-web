"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { supabaseBrowser } from "../lib/supabase/client";
import { useAuth, type UserRole } from "./AuthGate";
import { useTenant } from "./TenantContext";
import { NotificationBell } from "./NotificationBell";

type NavItem = { label: string; href: string; icon: string; roles?: string[] };

const ALL_ROLES = [
  "SUPER_ADMIN",
  "BRAND_ADMIN",
  "BRANCH_ADMIN",
  "BRANCH_MANAGER",
  "MANAGER",
  "PAYROLL_MANAGER",
  "BRANCH_STAFF",
  "EMPLOYEE",
];

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "📊",
    roles: ["SUPER_ADMIN", "BRAND_ADMIN", "BRANCH_ADMIN", "BRANCH_MANAGER", "MANAGER", "PAYROLL_MANAGER"],
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: "🕒",
    roles: ALL_ROLES,
  },
  {
    label: "Employees",
    href: "/employees",
    icon: "👥",
    roles: ALL_ROLES,
  },
  {
    label: "Payroll",
    href: "/payroll",
    icon: "💰",
    roles: ["SUPER_ADMIN", "BRAND_ADMIN", "BRANCH_ADMIN", "PAYROLL_MANAGER"], // Blocked for MANAGER and BRANCH_STAFF
  },
  {
    label: "Branches",
    href: "/branches",
    icon: "🏢",
    roles: ["SUPER_ADMIN", "BRAND_ADMIN", "MANAGER"],
  },
  {
    label: "Holidays",
    href: "/holidays",
    icon: "📅",
    roles: ALL_ROLES,
  },
  {
    label: "Leaves",
    href: "/leaves",
    icon: "📄",
    roles: ALL_ROLES,
  },
  {
    label: "Loans & Advances",
    href: "/loans",
    icon: "💳",
    roles: ["SUPER_ADMIN", "BRAND_ADMIN", "BRANCH_ADMIN", "PAYROLL_MANAGER"], // Blocked for MANAGER and BRANCH_STAFF
  },
  {
    label: "Incentives",
    href: "/incentives",
    icon: "🚀",
    roles: ["SUPER_ADMIN", "BRAND_ADMIN", "BRANCH_ADMIN", "BRANCH_MANAGER", "MANAGER", "PAYROLL_MANAGER"],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: "📈",
    roles: ["SUPER_ADMIN", "BRAND_ADMIN", "BRANCH_ADMIN", "PAYROLL_MANAGER"], // Blocked for MANAGER and BRANCH_STAFF
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, email, brandId, branchId, brandIds = [], branchIds = [] } = useAuth();
  const {
    organizations,
    brands,
    branches,
    selectedOrg,
    selectedBrand,
    selectedBranch,
    setSelectedOrg,
    setSelectedBrand,
    setSelectedBranch,
    isLoading,
  } = useTenant();

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const initials = email ? email.substring(0, 2).toUpperCase() : "..";

  const isSuperAdmin = role === "SUPER_ADMIN";
  const isBrandAdmin = role === "BRAND_ADMIN";
  const isBranchAdmin = role === "BRANCH_ADMIN" || role === "BRANCH_MANAGER";
  const isBranchStaff = role === "BRANCH_STAFF" || role === "EMPLOYEE";

  const effectiveBrandIds = brandIds.length > 0 ? brandIds : brandId ? [brandId] : [];
  const effectiveBranchIds = branchIds.length > 0 ? branchIds : branchId ? [branchId] : [];

  const canSwitchWorkspace = isSuperAdmin || isBrandAdmin || (isBranchAdmin && effectiveBranchIds.length > 1);

  // Filter sidebar items according to user role
  const filteredNav = NAV_ITEMS.filter((item) => {
    if (!item.roles) return true;
    return role ? item.roles.includes(role) : true;
  });

  const handleLogout = async () => {
    await supabaseBrowser.auth.signOut();
    router.push("/login");
  };

  // Filter available brands and branches in the branch selector modal based on role
  const selectableBrands = isSuperAdmin
    ? brands.filter((b) => !selectedOrg || b.organization_id === selectedOrg.id)
    : isBrandAdmin && effectiveBrandIds.length > 0
    ? brands.filter((b) => effectiveBrandIds.includes(b.id))
    : brands;

  const selectableBranches = isSuperAdmin
    ? branches.filter((b) => !selectedBrand || b.brand_id === selectedBrand.id)
    : isBrandAdmin
    ? branches.filter((b) => !selectedBrand || b.brand_id === selectedBrand.id)
    : isBranchAdmin && effectiveBranchIds.length > 0
    ? branches.filter((b) => effectiveBranchIds.includes(b.id))
    : branches;

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
                onClick={() => {
                  if (canSwitchWorkspace) {
                    setIsBranchModalOpen(true);
                  }
                }}
                title={
                  canSwitchWorkspace
                    ? "Click to switch branch"
                    : "Locked to your assigned branch"
                }
              >
                🏢 {selectedBranch ? selectedBranch.name : "Set Working Branch"}
                {canSwitchWorkspace && <span className="text-[0.65rem] text-muted-foreground ml-1">▼</span>}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 relative">
            <NotificationBell />

            {/* Profile Avatar Button */}
            <div
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              title="Open Menu"
              className="w-8 h-8 rounded-full bg-muted grid place-items-center text-xs font-semibold cursor-pointer hover:bg-border transition-colors border border-border select-none"
            >
              {initials}
            </div>

            {/* Profile Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />

                <div className="absolute right-0 top-full mt-2 w-56 rounded-lg bg-card border border-border shadow-xl z-50 p-2 flex flex-col gap-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 border-b border-border/50 mb-1">
                    <div className="text-xs font-semibold truncate text-foreground">{email}</div>
                    <div className="text-[0.65rem] text-primary font-bold uppercase tracking-wider mt-0.5">
                      {role?.replace("_", " ")}
                    </div>
                  </div>

                  {/* Switch Brand / Branch */}
                  {canSwitchWorkspace && (
                    <Link
                      href="/select-brand"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-primary/10 text-xs text-primary font-semibold no-underline transition-colors w-full text-left"
                    >
                      🏢 Switch Brand / Branch
                    </Link>
                  )}

                  {/* Profile */}
                  <Link
                    href="/profile"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-xs text-foreground no-underline transition-colors w-full text-left"
                  >
                    👤 Profile
                  </Link>

                  {/* Users (RBAC User Management - STRICTLY SUPER_ADMIN ONLY) */}
                  {role === "SUPER_ADMIN" && (
                    <Link
                      href="/users"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-xs text-foreground font-semibold no-underline transition-colors w-full text-left"
                    >
                      👥 Users
                    </Link>
                  )}

                  {/* Manage Brand / Hierarchy */}
                  {role && ["SUPER_ADMIN", "BRAND_ADMIN", "PAYROLL_MANAGER"].includes(role) && (
                    <Link
                      href="/hierarchy"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-xs text-foreground no-underline transition-colors w-full text-left"
                    >
                      🏢 Manage Brand
                    </Link>
                  )}

                  {/* Wage Master */}
                  {role && ["SUPER_ADMIN", "BRAND_ADMIN", "BRANCH_ADMIN", "BRANCH_MANAGER", "MANAGER", "PAYROLL_MANAGER"].includes(role) && (
                    <Link
                      href="/wage-master"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-xs text-foreground no-underline transition-colors w-full text-left"
                    >
                      📋 Wage Master
                    </Link>
                  )}

                  {/* Settings */}
                  {role && ["SUPER_ADMIN"].includes(role) && (
                    <Link
                      href="/settings"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-xs text-foreground no-underline transition-colors w-full text-left"
                    >
                      ⚙️ Settings
                    </Link>
                  )}

                  {/* Logs */}
                  {role && ["SUPER_ADMIN", "BRAND_ADMIN", "PAYROLL_MANAGER"].includes(role) && (
                    <Link
                      href="/logs"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-xs text-foreground no-underline transition-colors w-full text-left"
                    >
                      📜 Logs
                    </Link>
                  )}

                  <button
                    onClick={async () => {
                      setIsDropdownOpen(false);
                      if (window.confirm("Are you sure you want to log out?")) {
                        await handleLogout();
                      }
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-xs text-destructive hover:text-destructive no-underline transition-colors w-full text-left bg-transparent border-0 cursor-pointer pt-1.5 border-t border-border/40 mt-1"
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

      {/* Branch Selection Modal (Super Admin & Brand Admin) */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-lg p-6 max-w-md w-full shadow-lg">
            <h2 className="text-base font-bold mb-4">Set Working Branch</h2>
            <div className="flex flex-col gap-4">
              {/* Organization (Super Admin only) */}
              {isSuperAdmin && (
                <div className="form-group">
                  <label className="label text-xs">Organization</label>
                  <select
                    className="input text-xs"
                    value={selectedOrg?.id || ""}
                    onChange={(e) => {
                      const org = organizations.find((o) => o.id === e.target.value);
                      setSelectedOrg(org || null);
                    }}
                  >
                    <option value="" disabled>Select Org</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Brand (Super Admin only can switch) */}
              {isSuperAdmin && (
                <div className="form-group">
                  <label className="label text-xs">Brand</label>
                  <select
                    className="input text-xs"
                    value={selectedBrand?.id || ""}
                    onChange={(e) => {
                      const brand = brands.find((b) => b.id === e.target.value);
                      setSelectedBrand(brand || null);
                    }}
                    disabled={!selectedOrg}
                  >
                    <option value="" disabled>Select Brand</option>
                    {selectableBrands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Branch */}
              <div className="form-group">
                <label className="label text-xs">Branch</label>
                <select
                  className="input text-xs"
                  value={selectedBranch?.id || ""}
                  onChange={(e) => {
                    const branch = branches.find((b) => b.id === e.target.value);
                    setSelectedBranch(branch || null);
                  }}
                  disabled={isSuperAdmin && !selectedBrand}
                >
                  <option value="" disabled>Select Branch</option>
                  {selectableBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                className="button button-primary text-xs"
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
