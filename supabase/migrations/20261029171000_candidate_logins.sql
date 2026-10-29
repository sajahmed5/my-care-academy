-- ============================================================================
-- Candidate logins (RECRUITMENT.md, release 2b, 29 Oct 2026)
-- ============================================================================
-- A candidate's account has the role 'candidate' and NO organisation on
-- public.users: every org-scoped policy keys on current_org_id(), so a
-- candidate can read nothing of the company they're applying to. Their
-- candidate record points at their account instead, and the candidate pages
-- read through the service role after checking that link. Hired, the account
-- becomes the company's learner — one login from applicant to carer.

alter table public.candidates
  add column user_id uuid references public.users (id) on delete set null;
create index candidates_user_idx on public.candidates (user_id) where user_id is not null;
