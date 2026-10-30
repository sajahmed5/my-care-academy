-- ============================================================================
-- Feedback surveys: rounds, wording, invitations, "you said, we did"
-- ============================================================================
-- FORMS.md, "Feedback surveys", agreed with Saj 29 Oct 2026:
--
--   Editable questions   each company words its own surveys, starting from
--                        today's two; a round keeps the questions it was sent
--                        with, so changing the wording later never muddles
--                        old results
--   Sent                 by email to families from the client list, or to
--                        staff, each with their own link; or by a printed QR
--                        code of the round's open link
--   Anonymous or named   staff surveys are always anonymous; a client survey
--                        can be named, linking each answer to the client, so
--                        a low score can be raised as a concern and praise
--                        logged as a compliment in one click
--   Rounds               a survey runs as a round (the annual survey) with
--                        its response rate
--   You said, we did     a one-page report of what people said and what was
--                        done about it
--
-- feedback_surveys was already one link per row; a row is now a round.
--
--   feedback_surveys.questions     the round's questions; null on a round
--                                  made before this, which uses the
--                                  original wording in lib/feedback.ts
--   feedback_surveys.named         a named client round
--   feedback_surveys.closes_on     when it stops taking answers
--   feedback_surveys.sent_to_count how many were handed the open link or QR
--                                  code, for a response rate on those
--   organisation_feedback_questions  the company's wording, per survey
--   feedback_invitations           one person's own link: a family (with the
--                                  client it is about) or a member of staff
--   feedback_responses.client_id / invitation_id
--                                  on a named round only
--   feedback_responses.complaint_id / compliment_id
--                                  what the office made of it
--   feedback_actions               "you said, we did"
--
-- Anonymity: an anonymous invitation records only that it was answered —
-- never which answer — and the answer keeps the day, not the time.
--
-- Additive and safe for the live code: it reads and writes none of the new
-- columns, and a round with no questions reads exactly as before.
-- ============================================================================

alter table public.feedback_surveys
  add column if not exists questions jsonb,
  add column if not exists named boolean not null default false,
  add column if not exists closes_on date,
  add column if not exists sent_to_count integer check (sent_to_count is null or sent_to_count >= 0);

-- Staff surveys are always anonymous.
alter table public.feedback_surveys drop constraint if exists feedback_surveys_staff_anonymous;
alter table public.feedback_surveys
  add constraint feedback_surveys_staff_anonymous check (kind = 'client' or named = false);

create table if not exists public.organisation_feedback_questions (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null check (kind in ('client', 'staff')),
  questions       jsonb not null,
  updated_by      uuid references public.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (organisation_id, kind)
);

create table if not exists public.feedback_invitations (
  id              uuid primary key default gen_random_uuid(),
  survey_id       uuid not null references public.feedback_surveys (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  token           text not null unique check (length(token) >= 24),
  client_id       uuid references public.clients (id) on delete set null,
  user_id         uuid references public.users (id) on delete set null,
  name            text,
  email           text,
  sent_at         timestamptz,
  responded       boolean not null default false,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists feedback_invitations_survey_idx on public.feedback_invitations (survey_id);
create index if not exists feedback_invitations_client_idx on public.feedback_invitations (client_id) where client_id is not null;

alter table public.feedback_responses
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists invitation_id uuid references public.feedback_invitations (id) on delete set null,
  add column if not exists respondent_name text,
  add column if not exists complaint_id uuid references public.complaints (id) on delete set null,
  add column if not exists compliment_id uuid references public.compliments (id) on delete set null;
create index if not exists feedback_responses_client_idx on public.feedback_responses (client_id) where client_id is not null;

create table if not exists public.feedback_actions (
  id              uuid primary key default gen_random_uuid(),
  survey_id       uuid not null references public.feedback_surveys (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  you_said        text not null check (length(btrim(you_said)) > 0),
  we_did          text,
  sort_order      integer not null default 0,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists feedback_actions_survey_idx on public.feedback_actions (survey_id, sort_order);

-- ----------------------------------------------------------------------------
-- Grants (AGENTS.md; this project still auto-grants, so revoke first)
-- ----------------------------------------------------------------------------
revoke all on public.organisation_feedback_questions from anon, authenticated;
revoke all on public.feedback_invitations from anon, authenticated;
revoke all on public.feedback_actions from anon, authenticated;
grant select, insert, update, delete on public.organisation_feedback_questions to service_role;
grant select, insert, update, delete on public.feedback_invitations to service_role;
grant select, insert, update, delete on public.feedback_actions to service_role;
grant select, insert, update, delete on public.organisation_feedback_questions to authenticated;
-- Invitations are made by the office and answered through the service role.
grant select, insert, update on public.feedback_invitations to authenticated;
grant select, insert, update, delete on public.feedback_actions to authenticated;
-- The office records what it made of an answer; the answer itself stays as given.
grant update (complaint_id, compliment_id) on public.feedback_responses to authenticated;

alter table public.organisation_feedback_questions enable row level security;
alter table public.feedback_invitations enable row level security;
alter table public.feedback_actions enable row level security;

create policy organisation_feedback_questions_platform_admin on public.organisation_feedback_questions for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy organisation_feedback_questions_console on public.organisation_feedback_questions for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback')));

create policy feedback_invitations_platform_admin on public.feedback_invitations for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy feedback_invitations_console on public.feedback_invitations for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback')))
  with check (
    (select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback'))
    and exists (select 1 from public.feedback_surveys s where s.id = survey_id and s.organisation_id = (select public.current_org_id()))
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.organisation_id = (select public.current_org_id())))
  );

create policy feedback_actions_platform_admin on public.feedback_actions for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy feedback_actions_console on public.feedback_actions for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback')))
  with check (
    (select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback'))
    and exists (select 1 from public.feedback_surveys s where s.id = survey_id and s.organisation_id = (select public.current_org_id()))
  );

create policy feedback_responses_console_link on public.feedback_responses for update to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id()) and (select public.has_feature('quality.feedback')));
