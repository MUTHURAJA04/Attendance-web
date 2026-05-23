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
