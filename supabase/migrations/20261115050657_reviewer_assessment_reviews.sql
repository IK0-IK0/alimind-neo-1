create table if not exists public.assessment_reviews (
  assessment_id uuid primary key references public.assessment_sessions (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);

create table if not exists public.assessment_review_drafts (
  assessment_id uuid primary key references public.assessment_reviews (assessment_id) on delete cascade,
  response_draft text not null default ''
    check (char_length(response_draft) <= 5000),
  recommendation_draft text not null default ''
    check (char_length(recommendation_draft) <= 5000)
);

create index if not exists assessment_reviews_reviewer_status_updated
  on public.assessment_reviews (reviewer_id, status, updated_at desc);

alter table public.assessment_sessions enable row level security;

create policy "Reviewers can read completed assessment sessions"
  on public.assessment_sessions for select to authenticated
  using (
    status = 'completed'
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'reviewer'
    )
  );

alter table public.assessment_reviews enable row level security;

revoke all on table public.assessment_reviews from anon;
grant select, insert, update on table public.assessment_reviews to authenticated;
revoke all on table public.assessment_review_drafts from anon;
grant select, insert, update on table public.assessment_review_drafts to authenticated;

create policy "Reviewers can read assessment review status"
  on public.assessment_reviews for select to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'reviewer'
    )
  );

create policy "Reviewers can claim completed assessments"
  on public.assessment_reviews for insert to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and status = 'in_progress'
    and completed_at is null
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'reviewer'
    )
    and exists (
      select 1
      from public.assessment_sessions
      where assessment_sessions.id = assessment_id
        and assessment_sessions.status = 'completed'
    )
  );

create policy "Assigned reviewers can update their assessment reviews"
  on public.assessment_reviews for update to authenticated
  using (
    reviewer_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'reviewer'
    )
  )
  with check (
    reviewer_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_role = 'reviewer'
    )
    and exists (
      select 1
      from public.assessment_sessions
      where assessment_sessions.id = assessment_id
        and assessment_sessions.status = 'completed'
    )
  );

alter table public.assessment_review_drafts enable row level security;

create policy "Reviewers can read authorized assessment drafts"
  on public.assessment_review_drafts for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_reviews
      join public.profiles on profiles.id = (select auth.uid())
      where assessment_reviews.assessment_id = assessment_review_drafts.assessment_id
        and profiles.account_role = 'reviewer'
        and (assessment_reviews.reviewer_id = (select auth.uid()) or assessment_reviews.status = 'completed')
    )
  );

create policy "Assigned reviewers can create assessment drafts"
  on public.assessment_review_drafts for insert to authenticated
  with check (
    exists (
      select 1
      from public.assessment_reviews
      join public.profiles on profiles.id = (select auth.uid())
      where assessment_reviews.assessment_id = assessment_review_drafts.assessment_id
        and assessment_reviews.reviewer_id = (select auth.uid())
        and assessment_reviews.status = 'in_progress'
        and profiles.account_role = 'reviewer'
    )
  );

create policy "Assigned reviewers can update assessment drafts"
  on public.assessment_review_drafts for update to authenticated
  using (
    exists (
      select 1
      from public.assessment_reviews
      join public.profiles on profiles.id = (select auth.uid())
      where assessment_reviews.assessment_id = assessment_review_drafts.assessment_id
        and assessment_reviews.reviewer_id = (select auth.uid())
        and assessment_reviews.status = 'in_progress'
        and profiles.account_role = 'reviewer'
    )
  )
  with check (
    exists (
      select 1
      from public.assessment_reviews
      join public.profiles on profiles.id = (select auth.uid())
      where assessment_reviews.assessment_id = assessment_review_drafts.assessment_id
        and assessment_reviews.reviewer_id = (select auth.uid())
        and assessment_reviews.status = 'in_progress'
        and profiles.account_role = 'reviewer'
    )
  );

comment on table public.assessment_reviews is
  'Reviewer assignment and status for completed assessment submissions.';
comment on table public.assessment_review_drafts is
  'Internal reviewer drafts; only the assigned reviewer and reviewers of completed reviews can read them.';
