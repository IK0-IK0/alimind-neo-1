alter table public.assessment_sessions
  drop constraint if exists assessment_sessions_question_order_check,
  add constraint assessment_sessions_question_order_check
    check (cardinality(question_order) in (20, 62));
