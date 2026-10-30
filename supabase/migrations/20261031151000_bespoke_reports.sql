-- ============================================================================
-- Bespoke reports, part 2: the reports we build (BESPOKE-REPORTS.md, 29 Oct 2026)
-- ============================================================================
-- Each report is built by us with the platform report builder and saved to
-- one company: only that company ever sees it. The definition is data, not
-- code (lib/bespoke/definition.ts): which data, the filters, columns,
-- grouping and charts, section by section. The rows themselves are read live
-- whenever the report is opened, downloaded or sent.
--
-- managers_only keeps a report to the company's managers; otherwise office
-- staff see it too. Like the rest of the console, the database lets any
-- console user read the row (is_console_user()) and the app enforces the
-- manager-only part (AGENTS.md, Console roles).
--
-- Writes are ours, through the service role after
-- requireRole("platform_admin"), apart from managers_only, which the
-- company's manager sets from Settings (also through the service role).

create table public.bespoke_reports (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  request_id      uuid references public.report_requests (id) on delete set null,
  title           text not null check (length(title) between 1 and 150),
  description     text check (description is null or length(description) <= 2000),
  definition      jsonb not null default '{"version": 1, "sections": []}'::jsonb,
  managers_only   boolean not null default false,
  created_by      uuid references public.users (id) on delete set null,
  updated_by      uuid references public.users (id) on delete set null,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index bespoke_reports_org_idx on public.bespoke_reports (organisation_id) where archived_at is null;
create index bespoke_reports_request_idx on public.bespoke_reports (request_id);
create trigger bespoke_reports_set_updated_at
  before update on public.bespoke_reports
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.bespoke_reports to service_role;
revoke all on public.bespoke_reports from anon;
revoke all on public.bespoke_reports from authenticated;
grant select on public.bespoke_reports to authenticated;

alter table public.bespoke_reports enable row level security;

create policy bespoke_reports_platform_admin on public.bespoke_reports for select to authenticated
  using ((select public.is_platform_admin()));
create policy bespoke_reports_console_read on public.bespoke_reports for select to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and archived_at is null
    and (select public.is_console_user())
    and (select public.has_feature('reports.bespoke'))
  );
