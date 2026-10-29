-- Recruitment release 7 (RECRUITMENT.md): each company's own questions,
-- literacy test and letter wording. New columns on tables that already have
-- their grants and policies.

-- The company's own questions on the application, interview and reference
-- forms ({application: [...], interview: [...], reference: [...]}), our
-- general interview questions it doesn't ask, its literacy test (time, pass
-- mark, questions switched off, its own questions) and its letter wording
-- (rejection reasons, offer conditions).
alter table public.recruitment_settings
  add column custom_questions  jsonb not null default '{}',
  add column interview_hidden  text[] not null default '{}',
  add column literacy_settings jsonb,
  add column letter_settings   jsonb;

-- The test as it stood when the attempt was unlocked: its questions with the
-- answers, time limit and pass mark, so a later edit never changes how an
-- attempt is marked. Null on attempts made before this: they use our test.
alter table public.literacy_attempts add column test jsonb;
