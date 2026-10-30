-- ============================================================================
-- Service audits, part 5: the monthly governance report
-- (SERVICE-AUDITS.md, Monthly governance report)
-- ============================================================================
-- Additive only.
--
-- The report itself is worked out each time it is opened, from what exists:
-- audits and QAs, their open actions, concerns and compliments, Staff Audits
-- and training. What is kept is the part a person writes: the summary at the
-- top, one per company per month — drafted by AI if the company has switched
-- AI on (billed at 1.5 times cost, lib/ai.ts), always read and edited by a
-- person before it is saved.
--
--   month      the first day of the month the report covers

create table public.governance_reports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  month           date not null check (extract(day from month) = 1),
  summary         text not null default '',
  ai_drafted      boolean not null default false,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, month)
);
create trigger governance_reports_set_updated_at
  before update on public.governance_reports
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.governance_reports to service_role;
revoke all on public.governance_reports from anon;
revoke all on public.governance_reports from authenticated;
grant select, insert, update on public.governance_reports to authenticated;

alter table public.governance_reports enable row level security;
create policy governance_reports_platform_admin on public.governance_reports for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy governance_reports_console on public.governance_reports for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')));
