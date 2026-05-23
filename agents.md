# Attendance & Payroll Suite — Agent Context Document

> **Source of Truth for AI Agents.** Comprehensive architectural guide. Read this before modifying the codebase.

---

## 1. Project Overview

**Name:** attendance-suite  
**Architecture:** Multi-tenant Monorepo (pnpm)  
**Primary Domain:** Indian F&B industry (Tamil Nadu compliance: PF, ESI, PT, Minimum Wage).

### Workspace Structure
- **apps/web/**: Next.js 15 (Hybrid Auth + Client Pages)
- **packages/shared/**: Shared Zod schemas, roles, enums
- **supabase/migrations/**: DB Triggers (Loan write-offs, audit logs)
- **supabase/functions/**: Deno Edge Functions (Payroll Math, Employee CRUD)

---

## 2. Technology Stack & Standards

| Layer | Technology | Standard |
|-------|-----------|----------|
| **Frontend** | Next.js 15 (App Router) | Server-side Auth + "use client" feature pages |
| **Backend** | Supabase + Deno | Edge Functions are the ONLY place for math/logic |
| **Auth** | @supabase/ssr | middleware.ts handles session (No UI flicker) |
| **Database** | PostgreSQL | RLS enabled; is_role() SQL helpers |
| **Timezone** | Asia/Kolkata | Use explicit +05:30 offset in all queries |
| **Currency** | en-IN (₹) | Use .toLocaleString("en-IN") |

---

## 3. Architecture & Auth Flow

### 3.1 Tenant Hierarchy
**Organization → Brand → Branch → Employee**
- **Scoping:** All queries MUST filter by branch_id via globalBranch from TenantContext.
- **Persistence:** Branch selection is stored in localStorage.

### 3.2 Authentication & RLS
- **Middleware:** middleware.ts checks the session server-side. If no session, it redirects before the client renders.
- **AuthGate:** A thin Context Provider that passes user_metadata.role to the UI.
- **Roles:** SUPER_ADMIN, PAYROLL_MANAGER, BRANCH_MANAGER, EMPLOYEE.
- **RLS:** Policies check auth.jwt() -> 'user_metadata' ->> 'role'.

---

## 4. Key Business Logic

### 4.1 Payroll Engine (Edge Function: calculate-payroll)
**Calculation is strictly backend-only.**
- **Formula:** Gross = MonthlyGross - (AbsentDays * DailyRate * 2) + Overtime
- **Statutory Deductions:**
    - **PF:** 12% of min(Basic, ₹15,000).
    - **ESI:** 0.75% of Gross (only if Gross < ₹21,000).
    - **PT (TN):** Tiered (Max ₹200 for > ₹15k).
- **Daily Rate:** Computed as MonthlyGross / WorkingDaysInMonth.

### 4.2 Loan Automation (DB Trigger: trg_employee_left_writeoff)
- **Status Change:** When an employee status is updated to 'LEFT':
    1. **Trigger** automatically sets all ACTIVE loans to WRITTEN_OFF.
    2. **Trigger** inserts records into loan_writeoffs.
- **Restoration:** If status returns to ACTIVE, loans must be restored via a database-level action to ensure consistency.

---

## 5. Frontend Patterns

### 5.1 Page Composition
- **Layouts:** Use Server Components for auth/headers.
- **Feature Pages:** Use "use client" with useState/useEffect.
- **Data Fetching:** Use supabaseBrowser with .eq("branch_id", globalBranch.id).

### 5.2 Design System (globals.css)
- **Classes:** Use .card, .button-primary, .pill-success, .stat-card.
- **Validation:** Use shared Zod schemas from @attendance/shared.
    - Phone: 10 digits
    - Aadhaar: 12 digits
    - PAN: ^[A-Z]{5}[0-9]{4}[A-Z]{1}$
    - IFSC: ^[A-Z]{4}0[A-Z0-9]{6}$

---

## 6. Edge Functions Reference

| Function | Logic |
|----------|-------|
| **calculate-payroll** | Heavy math, payslip generation, loan updates. |
| **employees** | Privileged CRUD, maps camelCase to snake_case. |
| **roles** | Atomic updates to auth.users and profiles. |

---

## 7. Critical Rules for Agents

1. **No Client-Side Math:** All salary and deduction logic belongs in Edge Functions.
2. **Standardize Time:** Never use new Date() for DB queries; always use Asia/Kolkata offsets.
3. **Branch Scoping:** Every query MUST be scoped to a branch_id.
4. **No Flicker:** Do not add loading spinners to AuthGate; handle redirects in middleware.ts.
5. **UI Consistency:** Use existing .pill and .card classes before writing raw Tailwind.
6. **Audit Logs:** Call logAudit() for every sensitive change (Salary, Status, Loans).