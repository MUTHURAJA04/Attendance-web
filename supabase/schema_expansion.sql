-- Expansion Schema for Attendance & Payroll Suite
-- 1. Multi-branch & Roles (Enhanced)
-- Already have brands, branches, profiles, employees.
-- 2. Attendance Management
create table if not exists attendance_logs (
    id uuid primary key default gen_random_uuid(),
    employee_id uuid not null references employees(id) on delete cascade,
    branch_id uuid not null references branches(id),
    check_in timestamptz not null,
    check_out timestamptz,
    status text not null default 'PRESENT',
    -- PRESENT, ABSENT, HALF_DAY, LATE, OT, LEAVE_APPROVED, LEAVE_UNAPPROVED
    source text default 'BIOMETRIC',
    -- BIOMETRIC, MANUAL, MOBILE
    metadata jsonb,
    created_at timestamptz not null default now()
);
-- 3. Global Holiday Module
create table if not exists global_holidays (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    date date not null,
    branch_id uuid references branches(id),
    -- Null means all branches
    type text not null default 'PAID',
    -- PAID, UNPAID, COMP_OFF
    created_at timestamptz not null default now()
);
-- 4. Incentive & Sales Module
create table if not exists branch_daily_sales (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references branches(id),
    date date not null,
    sales_amount decimal(12, 2) not null,
    created_at timestamptz not null default now(),
    unique(branch_id, date)
);
create table if not exists incentive_rules (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid references branches(id),
    role_id text,
    -- Can link to employee_role enum text
    target_amount decimal(12, 2),
    incentive_amount decimal(12, 2),
    type text not null default 'FIXED',
    -- FIXED, PERCENTAGE, SLAB
    created_at timestamptz not null default now()
);
-- 5. Loan & Advance Management
create table if not exists loans (
    id uuid primary key default gen_random_uuid(),
    employee_id uuid not null references employees(id),
    amount decimal(12, 2) not null,
    tenure_months int not null,
    monthly_emi decimal(12, 2) not null,
    balance_amount decimal(12, 2) not null,
    status text not null default 'ACTIVE',
    -- ACTIVE, CLOSED
    created_at timestamptz not null default now()
);
-- 6. Leave Management
create table if not exists leave_requests (
    id uuid primary key default gen_random_uuid(),
    employee_id uuid not null references employees(id),
    type text not null,
    -- CASUAL, SICK, PAID, LOP
    start_date date not null,
    end_date date not null,
    reason text,
    status text not null default 'PENDING',
    -- PENDING, APPROVED, REJECTED
    approved_by uuid references auth.users(id),
    created_at timestamptz not null default now()
);
-- 7. Payroll Engine
create table if not exists payroll_periods (
    id uuid primary key default gen_random_uuid(),
    month int not null,
    year int not null,
    status text not null default 'OPEN',
    -- OPEN, PROCESSING, LOCKED
    locked_at timestamptz,
    locked_by uuid references auth.users(id),
    unique(month, year)
);
create table if not exists payslips (
    id uuid primary key default gen_random_uuid(),
    employee_id uuid not null references employees(id),
    period_id uuid not null references payroll_periods(id),
    basic_pay decimal(12, 2) not null,
    hra decimal(12, 2) not null,
    allowances decimal(12, 2) not null,
    incentives decimal(12, 2) default 0,
    overtime_pay decimal(12, 2) default 0,
    gross_pay decimal(12, 2) not null,
    pf_deduction decimal(12, 2) default 0,
    esi_deduction decimal(12, 2) default 0,
    pt_deduction decimal(12, 2) default 0,
    tds_deduction decimal(12, 2) default 0,
    loan_deduction decimal(12, 2) default 0,
    net_pay decimal(12, 2) not null,
    pdf_url text,
    created_at timestamptz not null default now()
);
-- RLS Policies (Basic fallback)
alter table attendance_logs enable row level security;
alter table global_holidays enable row level security;
alter table branch_daily_sales enable row level security;
alter table incentive_rules enable row level security;
alter table loans enable row level security;
alter table leave_requests enable row level security;
alter table payroll_periods enable row level security;
alter table payslips enable row level security;