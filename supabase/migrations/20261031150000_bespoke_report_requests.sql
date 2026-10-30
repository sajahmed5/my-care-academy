-- ============================================================================
-- Bespoke reports, part 1: the company's request (BESPOKE-REPORTS.md, 29 Oct 2026)
-- ============================================================================
-- An Enterprise manager asks for a report on the Reports page: what they want
-- to know, who it's for, how often and in what format. We build it within 10
-- working days; requests are unlimited. The request shows where it is (asked,
-- being built, ready) and both sides can message on it.
--
-- report_requests          one request, with the date it is due by.
-- report_request_messages  the conversation on it, theirs and ours.
--
-- Writes go through the service role: the company's after
-- requireRole("org_admin") and the feature check, ours after
-- requireRole("platform_admin"). Signed-in users only ever read.

insert into public.feature_categories (key, label, sort_order) values
  ('reports', 'Reports', 60)
on conflict (key) do nothing;

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('reports.bespoke', 'reports', 'Bespoke reports', false, 60)
on conflict (key) do nothing;

insert into public.tier_features (tier_key, feature_key) values
  ('full', 'reports.bespoke')
on conflict do nothing;

create table public.report_requests (
  id              uuid primary key default gen_random_uuid(),
  request_no      bigint generated always as identity unique,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  title           text not null check (length(title) between 1 and 150),
  question        text not null check (length(question) between 1 and 4000),
  audience        text not null check (audience in ('cqc', 'council', 'directors', 'staff', 'other')),
  audience_other  text check (audience_other is null or length(audience_other) <= 200),
  frequency       text not null check (frequency in ('one_off', 'weekly', 'monthly')),
  format          text not null check (format in ('screen', 'pdf', 'excel')),
  status          text not null default 'asked' check (status in ('asked', 'building', 'ready', 'withdrawn')),
  -- Ten working days from the day it was asked (lib/bespoke/working-days.ts).
  due_on          date not null,
  requested_by    uuid references public.users (id) on delete set null,
  building_at     timestamptz,
  ready_at        timestamptz,
  withdrawn_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index report_requests_org_idx on public.report_requests (organisation_id, created_at desc);
create index report_requests_open_idx on public.report_requests (due_on) where status in ('asked', 'building');
create trigger report_requests_set_updated_at
  before update on public.report_requests
  for each row execute function public.set_updated_at();

create table public.report_request_messages (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.report_requests (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  author_id       uuid references public.users (id) on delete set null,
  -- Ours (platform admin) or theirs. Kept as a flag, not read from the
  -- author's role, so a message still reads right after the author has gone.
  from_us         boolean not null default false,
  body            text not null check (length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index report_request_messages_request_idx on public.report_request_messages (request_id, created_at);

-- Grants (AGENTS.md): the service role writes; signed-in users read under RLS;
-- nothing for anon, revoked explicitly as Supabase still grants it here.
grant select, insert, update, delete on public.report_requests to service_role;
grant select, insert, update, delete on public.report_request_messages to service_role;
revoke all on public.report_requests from anon;
revoke all on public.report_request_messages from anon;
revoke all on public.report_requests from authenticated;
revoke all on public.report_request_messages from authenticated;
grant select on public.report_requests to authenticated;
grant select on public.report_request_messages to authenticated;

alter table public.report_requests enable row level security;
alter table public.report_request_messages enable row level security;

create policy report_requests_platform_admin on public.report_requests for select to authenticated
  using ((select public.is_platform_admin()));
create policy report_requests_console_read on public.report_requests for select to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('reports.bespoke'))
  );

create policy report_request_messages_platform_admin on public.report_request_messages for select to authenticated
  using ((select public.is_platform_admin()));
create policy report_request_messages_console_read on public.report_request_messages for select to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('reports.bespoke'))
  );
