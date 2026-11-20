alter table public.assessment_reviews
  add column if not exists delivered_at timestamptz;

drop policy if exists "Participants can read their delivered assessment reviews"
  on public.assessment_reviews;
create policy "Participants can read their delivered assessment reviews"
  on public.assessment_reviews for select to authenticated
  using (
    delivered_at is not null
    and exists (
      select 1
      from public.assessment_sessions
      where assessment_sessions.id = assessment_id
        and assessment_sessions.user_id = (select auth.uid())
    )
  );

drop policy if exists "Participants can read their delivered assessment drafts"
  on public.assessment_review_drafts;
create policy "Participants can read their delivered assessment drafts"
  on public.assessment_review_drafts for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_reviews
      join public.assessment_sessions
        on assessment_sessions.id = assessment_reviews.assessment_id
      where assessment_reviews.assessment_id = assessment_review_drafts.assessment_id
        and assessment_reviews.delivered_at is not null
        and assessment_sessions.user_id = (select auth.uid())
    )
  );

comment on column public.assessment_reviews.delivered_at is
  'When the completed reviewer response became visible to the assessment owner.';
