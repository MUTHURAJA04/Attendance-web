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
