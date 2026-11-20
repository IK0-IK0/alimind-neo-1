-- Restore Supabase Auth as the credential store and preserve existing data.
-- Seed passwords are represented only by their Auth bcrypt hashes.
drop trigger if exists create_profile_after_auth_user_insert on auth.users;
drop trigger if exists sync_profile_after_auth_user_metadata_update on auth.users;

do $$
declare
  seed record;
  seed_user_id uuid;
begin
  for seed in
    select * from (values
      (
        'alimind.pipeline.test@example.com',
        '$2b$10$eG/qAuwpY30lM4inj5QNW.yE56JTS0kB2gANXQwr./tUOfhHIK47m',
        'Test User'
      ),
      (
        'reviewer@example.com',
        '$2b$10$7ZP6Gan9utOqWGae6ZZ33.7uf6QC5D32tkaMkKzGbwqJaW5q0Z/ty',
        'Reviewer Account'
      )
    ) as seeds(email, password_hash, display_name)
  loop
    select id into seed_user_id
    from auth.users
    where lower(email) = lower(seed.email)
    limit 1;

    if seed_user_id is null then
      seed_user_id := gen_random_uuid();
      insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        seed_user_id, 'authenticated', 'authenticated', seed.email,
        seed.password_hash, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', seed.display_name), now(), now()
      );
    else
      update auth.users
      set email_confirmed_at = coalesce(email_confirmed_at, now())
      where id = seed_user_id;
    end if;

    insert into auth.identities (
      user_id, provider_id, identity_data, provider
    )
    select
      seed_user_id,
      seed.email,
      jsonb_build_object(
        'sub', seed_user_id::text,
        'email', seed.email,
        'email_verified', true
      ),
      'email'
    where not exists (
      select 1 from auth.identities
      where user_id = seed_user_id and provider = 'email'
    )
    on conflict do nothing;
  end loop;
end;
$$;

-- Temporarily remove profile-based foreign keys so legacy profile IDs can be
-- replaced with their matching Auth user IDs without deleting assessment data.
alter table public.assessment_sessions
  drop constraint if exists assessment_sessions_user_id_fkey;
alter table public.assessment_reviews
  drop constraint if exists assessment_reviews_reviewer_id_fkey;

update public.assessment_sessions as sessions
set user_id = users.id
from public.profiles as profiles
join auth.users as users on lower(users.email) = lower(profiles.email)
where sessions.user_id = profiles.id
  and sessions.user_id <> users.id;

update public.assessment_reviews as reviews
set reviewer_id = users.id
from public.profiles as profiles
join auth.users as users on lower(users.email) = lower(profiles.email)
where reviews.reviewer_id = profiles.id
  and reviews.reviewer_id <> users.id;

update public.profiles as profiles
set id = users.id
from auth.users as users
where lower(users.email) = lower(profiles.email)
  and profiles.id <> users.id;

do $$
begin
  if exists (
    select 1 from public.assessment_sessions as sessions
    left join auth.users as users on users.id = sessions.user_id
    where users.id is null
  ) then
    raise exception 'Cannot restore Auth ownership: an assessment session has no matching Auth user.';
  end if;
  if exists (
    select 1 from public.assessment_reviews as reviews
    left join auth.users as users on users.id = reviews.reviewer_id
    where users.id is null
  ) then
    raise exception 'Cannot restore reviewer ownership: an assessment review has no matching Auth user.';
  end if;
end;
$$;

-- Remove only unreferenced legacy profile rows that have no Auth account.
delete from public.profiles as profiles
where not exists (
  select 1 from auth.users as users where users.id = profiles.id
);

alter table public.profiles
  drop constraint if exists profiles_email_unique,
  drop constraint if exists profiles_email_format,
  drop constraint if exists profiles_password_length,
  drop constraint if exists profiles_id_fkey,
  drop column if exists email,
  drop column if exists password_hash;

alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

alter table public.assessment_sessions
  add constraint assessment_sessions_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.assessment_reviews
  add constraint assessment_reviews_reviewer_id_fkey
  foreign key (reviewer_id) references public.profiles (id) on delete cascade;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'there'
      ),
      100
    )
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        updated_at = now();
  return new;
end;
$$;

revoke all on function public.sync_profile_from_auth_user()
  from public, anon, authenticated;

create trigger create_profile_after_auth_user_insert
  after insert on auth.users
  for each row execute function public.sync_profile_from_auth_user();
create trigger sync_profile_after_auth_user_metadata_update
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth_user();

insert into public.profiles (id, display_name)
select
  users.id,
  left(
    coalesce(
      nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
      'there'
    ),
    100
  )
from auth.users as users
on conflict (id) do nothing;

update public.profiles as profiles
set account_role = case
  when lower(users.email) = 'reviewer@example.com' then 'reviewer'
  else 'user'
end,
updated_at = now()
from auth.users as users
where profiles.id = users.id
  and lower(users.email) in (
    'alimind.pipeline.test@example.com',
    'reviewer@example.com'
  );

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

alter table public.assessment_sessions enable row level security;
revoke all on table public.assessment_sessions from anon;
grant select, insert, update, delete on table public.assessment_sessions to authenticated;
drop policy if exists "Users can read their own assessment sessions"
  on public.assessment_sessions;
create policy "Users can read their own assessment sessions"
  on public.assessment_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own assessment sessions"
  on public.assessment_sessions;
create policy "Users can create their own assessment sessions"
  on public.assessment_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own assessment sessions"
  on public.assessment_sessions;
create policy "Users can update their own assessment sessions"
  on public.assessment_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own assessment sessions"
  on public.assessment_sessions;
create policy "Users can delete their own assessment sessions"
  on public.assessment_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Reviewers can read completed assessment sessions"
  on public.assessment_sessions;
create policy "Reviewers can read completed assessment sessions"
  on public.assessment_sessions for select to authenticated
  using (
    status = 'completed'
    and exists (
      select 1 from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'reviewer'
    )
  );

alter table public.assessment_reviews enable row level security;
alter table public.assessment_review_drafts enable row level security;
revoke all on table public.assessment_reviews from anon;
grant select, insert, update on table public.assessment_reviews to authenticated;
revoke all on table public.assessment_review_drafts from anon;
grant select, insert, update on table public.assessment_review_drafts to authenticated;

comment on column public.profiles.account_role is
  'Application role. New accounts default to user; assign reviewer only through a trusted administrative database operation.';
