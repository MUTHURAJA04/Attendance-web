# Attendance Suite — Gemini Context (V2.0)

> Quick-reference for LLM assistants. Updated for Backend-Centric Logic & Performance.

---

## What This Project Is

A **multi-tenant Attendance, Payroll & HR system** for Indian restaurants. Built as a pnpm monorepo:

| Workspace | Stack | Role |
|-----------|-------|------|
| `apps/web` | Next.js 15, Tailwind 4 | Hybrid UI (Server Auth + Client Components) |
| `packages/shared` | TypeScript | Shared Zod schemas, roles, enums |
| `supabase/` | PostgreSQL + Deno | **Source of Truth** for Auth, DB, & Payroll Logic |

---

## Tenant Hierarchy & Auth

- **Scope:** `Organization → Brand → Branch → Employee`.
- **Context:** All queries must filter by `globalBranch` from `TenantContext`.
- **Roles:** `SUPER_ADMIN`, `PAYROLL_MANAGER`, `BRANCH_MANAGER`, `EMPLOYEE`.
- **Security:** RLS is strictly enforced via `is_role()` SQL helpers.
- **Auth Flow:** Next.js middleware (`middleware.ts`) checks session server-side via `@supabase/ssr` — no client-side loading flicker. `AuthGate` provides role context only.

---

## Core Database & Automation

### Tables
- **Core:** `organizations`, `brands`, `branches`, `profiles`, `employees`
- **Finance:** `attendance_logs`, `loans`, `leave_requests`, `payroll_periods`, `payslips`, `incentive_rules`

### DB Triggers (Automations)
- **Loan Write-off:** When `employees.status` transitions to `LEFT`, a DB trigger (`trg_employee_left_writeoff`) automatically updates all related `loans.status` to `WRITTEN_OFF` and creates `loan_writeoffs` records.
- **Audit:** All sensitive table changes are captured in `audit_logs` via Postgres hooks.

---

## Business Rules (Indian Compliance)

### Payroll Calculation (Edge Function Only)
Payroll is computed in the `calculate-payroll` Edge Function. The frontend must **never** define these formulas.

$$Gross\ Pay = Monthly\ Gross - (Absent\ Days \times Daily\ Rate \times 2) + Overtime$$

- **PF:** $12\%$ of $\min(Basic, \text{₹15,000})$
- **ESI:** $0.75\%$ of Gross (only if Gross < ₹21,000)
- **PT (TN):** Tiered based on Gross (Max ₹200 for > ₹15k)
- **Timezone:** All operations are anchored to `Asia/Kolkata`.

### Validations (Zod Shared)
- **Phone:** 10 digits | **Aadhaar:** 12 digits | **PAN:** Standard regex
- **CTC:** Must be $\ge$ TN minimum wage (₹13,350/month)

---

## Frontend Architecture

### Performance & Auth
- **Middleware:** `middleware.ts` uses `@supabase/ssr` to check `supabase.auth.getUser()` server-side before rendering. Prevents UI flickering.
- **AuthGate:** Thin client context provider — no loading spinner, no redirect logic. Just provides role/email/userId.
- **TenantContext:** Manages `selectedBranch` with persistence in `localStorage`.
- **Data Fetching:** Client-side with `useTenant()` hook for automatic branch scoping.

### Design System
Use `globals.css` utility classes:
- `.card`, `.button-primary`, `.pill-success`, `.stat-card`
- **Currency:** Always format as `en-IN` (e.g., ₹1,00,000).

---

## Route Map & Edge Functions

| Function | Logic |
|----------|-------|
| `calculate-payroll` | Heavy math for payslip generation |
| `employees` | CRUD with business validation |
| `roles` | Super Admin role management |
| `branches` | Branch listing and creation |

---

## Quick Rules

1. **Backend First:** Move all math and status transitions to Edge Functions or DB Triggers.
2. **Branch Scoping:** Always include `branch_id` in your Supabase filters.
3. **No "use client" Bloat:** Use Server Components for layouts and data fetching where possible.
4. **Timezone:** Never use local client time for calculations; always use `Asia/Kolkata`.
5. **Audit Trail:** Log every sensitive action via `logAudit()`.