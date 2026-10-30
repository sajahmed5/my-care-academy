-- ============================================================================
-- Bespoke reports, part 3: scheduled sending (BESPOKE-REPORTS.md, 29 Oct 2026)
-- ============================================================================
-- A report emailed on a schedule to named people — a monthly PDF to the
-- registered manager and the directors, say. A company's manager sets it up
-- under Settings → Bespoke reports; /api/cron/reports sends what is due.
--
-- report_schedules  how often (weekly on a weekday, or monthly on a day from
--                   1 to 28), PDF or Excel, and who to (a name and an email
--                   each — directors often have no login). next_send_on is
--                   the UK day it goes next.
-- report_sends      one row per email sent (or failed), for the manager to
--                   see and for us to trace.
--
-- Writes go through the service role: the manager's after
-- requireRole("org_admin"), the cron's after CRON_SECRET.

create table public.report_schedules (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  report_id       uuid not null references public.bespoke_reports (id) on delete cascade,
  frequency       text not null check (frequency in ('weekly', 'monthly')),
  -- 1 = Monday … 7 = Sunday, for weekly.
  weekday         smallint check (weekday between 1 and 7),
  -- 1 to 28, so every month has the day, for monthly.
  day_of_month    smallint check (day_of_month between 1 and 28),
  format          text not null default 'pdf' check (format in ('pdf', 'xlsx')),
  recipients      jsonb not null default '[]'::jsonb check (jsonb_typeof(recipients) = 'array' and jsonb_array_length(recipients) <= 20),
  active          boolean not null default true,
  next_send_on    date not null,
  last_sent_at    timestamptz,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((frequency = 'weekly') = (weekday is not null)),
  check ((frequency = 'monthly') = (day_of_month is not null))
);
create index report_schedules_report_idx on public.report_schedules (report_id);
create index report_schedules_due_idx on public.report_schedules (next_send_on) where active;
create trigger report_schedules_set_updated_at
  before update on public.report_schedules
  for each row execute function public.set_updated_at();

create table public.report_sends (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  report_id       uuid not null references public.bespoke_reports (id) on delete cascade,
  schedule_id     uuid references public.report_schedules (id) on delete set null,
  sent_at         timestamptz not null default now(),
  recipients      text[] not null default '{}',
  format          text not null check (format in ('pdf', 'xlsx')),
  ok              boolean not null,
  error           text check (error is null or length(error) <= 500),
  -- Sent by the schedule, or by a manager pressing Send now.
  sent_by         uuid references public.users (id) on delete set null
);
create index report_sends_report_idx on public.report_sends (report_id, sent_at desc);

grant select, insert, update, delete on public.report_schedules to service_role;
grant select, insert, update, delete on public.report_sends to service_role;
revoke all on public.report_schedules from anon;
revoke all on public.report_sends from anon;
revoke all on public.report_schedules from authenticated;
revoke all on public.report_sends from authenticated;
grant select on public.report_schedules to authenticated;
grant select on public.report_sends to authenticated;

alter table public.report_schedules enable row level security;
alter table public.report_sends enable row level security;

create policy report_schedules_platform_admin on public.report_schedules for select to authenticated
  using ((select public.is_platform_admin()));
create policy report_schedules_console_read on public.report_schedules for select to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('reports.bespoke'))
  );

create policy report_sends_platform_admin on public.report_sends for select to authenticated
  using ((select public.is_platform_admin()));
create policy report_sends_console_read on public.report_sends for select to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('reports.bespoke'))
  );
