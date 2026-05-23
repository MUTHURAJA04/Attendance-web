-- Promote an existing auth user to SUPER_ADMIN by email
-- Replace the email below if needed.

with target as (
  select id
  from auth.users
  where email = 'phsfboys@gmail.com'
)
update auth.users
set raw_user_meta_data = jsonb_set(
  coalesce(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"SUPER_ADMIN"',
  true
)
where id in (select id from target);

insert into profiles (id, role, branch_id)
select id, 'SUPER_ADMIN', null
from auth.users
where email = 'phsfboys@gmail.com'
on conflict (id)
do update set role = excluded.role, branch_id = excluded.branch_id;
