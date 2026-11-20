create table if not exists public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('in_progress', 'completed', 'abandoned')),
  question_order text[] not null check (cardinality(question_order) = 20),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  consent_version text not null,
  consent_accepted_at timestamptz not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (octet_length(answers::text) <= 262144),
  check (octet_length(messages::text) <= 1048576)
);

create index if not exists assessment_sessions_user_started
  on public.assessment_sessions (user_id, started_at desc);

create unique index if not exists assessment_sessions_one_active_per_user
  on public.assessment_sessions (user_id)
  where status = 'in_progress';

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
