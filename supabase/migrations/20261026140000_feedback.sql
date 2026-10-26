-- ============================================================================
-- Client and carer feedback surveys
-- ============================================================================
-- ROADMAP §4: survey links to families, service users and staff, with results
-- trended. The questions are code (lib/feedback.ts); these tables hold each
-- survey link an organisation sends and every answer it gets back.
--
--   feedback_surveys    one shareable link: which survey, a long random token
--                       that is the whole address, and whether it is still open
--   feedback_responses  one set of answers, anonymous — no name, no account
--
-- People answering have no account, and anon has no privilege on any table
-- (AGENTS.md). The public page at /survey/<token> reads the survey and writes
-- the answer as the service role, after checking the token is real and the
-- survey open. Console users manage their organisation's surveys and read the
-- answers.
--
-- A new feature, quality.feedback, beside audits in Pro and Enterprise.

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('quality.feedback', 'quality', 'Client & carer feedback', false, 20)
on conflict (key) do nothing;

insert into public.tier_features (tier_key, feature_key) values
  ('core_recruitment', 'quality.feedback'),
  ('full', 'quality.feedback')
on conflict do nothing;

create table public.feedback_surveys (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null check (kind in ('client', 'staff')),
  title           text,
  token           text not null unique check (length(token) >= 24),
  is_open         boolean not null default true,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index feedback_surveys_org_idx on public.feedback_surveys (organisation_id, created_at desc);

create table public.feedback_responses (
  id              uuid primary key default gen_random_uuid(),
  survey_id       uuid not null references public.feedback_surveys (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  answers         jsonb not null,
  submitted_at    timestamptz not null default now()
);
create index feedback_responses_survey_idx on public.feedback_responses (survey_id, submitted_at);

grant select, insert, update, delete on public.feedback_surveys to service_role;
grant select, insert, update, delete on public.feedback_responses to service_role;
revoke all on public.feedback_surveys from anon;
revoke all on public.feedback_responses from anon;
revoke delete, truncate, references, trigger on public.feedback_surveys from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.feedback_responses from authenticated;
grant select, insert, update on public.feedback_surveys to authenticated;
grant select on public.feedback_responses to authenticated;

alter table public.feedback_surveys enable row level security;
alter table public.feedback_responses enable row level security;

create policy feedback_surveys_platform_admin on public.feedback_surveys for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy feedback_surveys_console on public.feedback_surveys for all to authenticated
  using (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('quality.feedback'))
  )
  with check (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('quality.feedback'))
  );

create policy feedback_responses_platform_admin on public.feedback_responses for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy feedback_responses_console_read on public.feedback_responses for select to authenticated
  using (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('quality.feedback'))
  );
