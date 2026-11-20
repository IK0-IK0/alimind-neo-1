alter table public.profiles
  add column if not exists account_role text not null default 'user'
  check (account_role in ('user', 'reviewer'));

comment on column public.profiles.account_role is
  'Application role. New accounts default to user; assign reviewer only through a trusted administrative database operation.';
