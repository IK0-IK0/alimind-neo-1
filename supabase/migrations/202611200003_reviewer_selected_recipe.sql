alter table public.assessment_review_drafts
  add column if not exists selected_recipe text not null default ''
    check (char_length(selected_recipe) <= 5000);
