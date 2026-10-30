-- ============================================================================
-- HR pack: holidays (HR-PACK.md, added 29 Oct 2026)
-- ============================================================================
-- Additive only. A record of leave taken against an allowance, for carers and
-- office staff alike: the office sets each person's allowance (days or hours)
-- per leave year; requests come from the person's own login or are entered by
-- the office; managers and office approve carers' leave, only managers approve
-- office staff's, and nobody approves their own. No accrual sums.

alter table public.hr_settings
  add column if not exists leave_year_start text not null default '01-01' check (leave_year_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  add column if not exists bank_holidays_from_allowance boolean not null default true,
  add column if not exists max_off_at_once integer check (max_off_at_once is null or max_off_at_once between 1 and 500),
  -- The company's own kinds of leave: [{ "key": "…", "label": "…", "fromAllowance": bool }].
  add column if not exists leave_types jsonb not null default '[]'::jsonb;

create table public.leave_allowances (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  -- The first day of the leave year it's for.
  year_start      date not null,
  amount          numeric(6, 2) not null check (amount >= 0 and amount <= 2000),
  unit            text not null default 'days' check (unit in ('days', 'hours')),
  note            text,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, year_start)
);
create index leave_allowances_org_idx on public.leave_allowances (organisation_id, year_start);
create trigger leave_allowances_set_updated_at
  before update on public.leave_allowances
  for each row execute function public.set_updated_at();

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  leave_type      text not null,
  start_date      date not null,
  end_date        date not null,
  -- How much it takes from the allowance, in the allowance's unit: set by
  -- the person or the office, since only they know the rota.
  amount          numeric(6, 2) not null default 0 check (amount >= 0 and amount <= 2000),
  unit            text not null default 'days' check (unit in ('days', 'hours')),
  note            text,
  status          text not null default 'requested' check (status in ('requested', 'approved', 'declined', 'cancelled')),
  decision_note   text,
  -- Approving past the company's limit on how many are off at once.
  over_limit      boolean not null default false,
  decided_by      uuid references public.users (id) on delete set null,
  decided_at      timestamptz,
  requested_by    uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_person_idx on public.leave_requests (user_id, start_date desc);
create index leave_requests_org_idx on public.leave_requests (organisation_id, status, start_date);
create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ grants

revoke all on public.leave_allowances, public.leave_requests from anon, authenticated;
grant select, insert, update, delete on public.leave_allowances, public.leave_requests to service_role;
grant select on public.leave_allowances, public.leave_requests to authenticated;

-- --------------------------------------------------------------------- RLS
-- Writes go through server actions as the service role (they check who may
-- approve whom). The person reads their own allowance and requests.

alter table public.leave_allowances enable row level security;
create policy leave_allowances_platform_admin on public.leave_allowances for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy leave_allowances_console_read on public.leave_allowances for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
create policy leave_allowances_own_read on public.leave_allowances for select to authenticated
  using (user_id = (select auth.uid()) and (select public.has_feature('recruitment.tracker')));

alter table public.leave_requests enable row level security;
create policy leave_requests_platform_admin on public.leave_requests for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy leave_requests_console_read on public.leave_requests for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
create policy leave_requests_own_read on public.leave_requests for select to authenticated
  using (user_id = (select auth.uid()) and (select public.has_feature('recruitment.tracker')));
