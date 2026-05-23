-- Enable extensions
create extension if not exists "pgcrypto";

-- Roles enum for employees
do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'employee_role'
  ) then
    create type employee_role as enum ('STAFF', 'MANAGER', 'KITCHEN', 'CASHIER');
  end if;
end;
$$;

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  name text not null,
  city text not null,
  state text,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  branch_id uuid references branches(id),
  created_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  employee_code text,
  role employee_role not null,
  branch_id uuid not null references branches(id) on delete restrict,
  date_of_joining date not null,
  phone text not null,
  address text,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  bank_account_number text not null,
  bank_ifsc text not null,
  bank_name text not null,
  upi_id text,
  aadhaar text,
  pan text,
  pf_uan text,
  esi_number text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table employees enable row level security;
alter table branches enable row level security;
alter table brands enable row level security;

-- Helper for role checks using user_metadata
create or replace function is_role(role_name text)
returns boolean
language sql
stable
as $$
  select (auth.jwt() -> 'user_metadata' ->> 'role') = role_name;
$$;

create or replace function is_any_role(role_names text[])
returns boolean
language sql
stable
as $$
  select (auth.jwt() -> 'user_metadata' ->> 'role') = any(role_names);
$$;

-- Profiles policies
drop policy if exists "profiles self read" on profiles;
create policy "profiles self read" on profiles
  for select using (auth.uid() = id or is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

drop policy if exists "profiles self update" on profiles;
create policy "profiles self update" on profiles
  for update using (auth.uid() = id or is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Brands/Branches policies (admin only for now)
drop policy if exists "brands admin read" on brands;
create policy "brands admin read" on brands
  for select using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

drop policy if exists "brands admin write" on brands;
create policy "brands admin write" on brands
  for all using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

drop policy if exists "branches admin read" on branches;
create policy "branches admin read" on branches
  for select using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER','BRANCH_MANAGER']));

drop policy if exists "branches admin write" on branches;
create policy "branches admin write" on branches
  for all using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

-- Employees policies
drop policy if exists "employees read" on employees;
create policy "employees read" on employees
  for select using (
    is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER'])
    or (is_role('BRANCH_MANAGER') and branch_id = (select branch_id from profiles where id = auth.uid()))
  );

drop policy if exists "employees write" on employees;
create policy "employees write" on employees
  for insert with check (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));

drop policy if exists "employees update" on employees;
create policy "employees update" on employees
  for update using (is_any_role(array['SUPER_ADMIN','PAYROLL_MANAGER']));
