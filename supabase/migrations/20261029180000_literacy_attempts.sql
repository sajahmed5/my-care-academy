-- ============================================================================
-- The literacy test (RECRUITMENT.md, release 3, 29 Oct 2026)
-- ============================================================================
-- Brought across from MyRoster (154_literacy_attempts). The office unlocks an
-- attempt — a QR code to scan in the office (15 minutes to start) or a link
-- by email (3 days) — and the candidate takes it with no account: the link's
-- token, stored only as a hash, opens that one attempt. The clock is the
-- server's: deadline_at is stamped when they press Begin.

create table public.literacy_attempts (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  candidate_id     uuid not null references public.candidates (id) on delete cascade,
  attempt_no       integer not null default 1,
  mode             text not null default 'office' check (mode in ('office', 'remote')),
  status           text not null default 'unlocked' check (status in ('unlocked', 'in_progress', 'submitted', 'cancelled')),
  token_hash       text unique,
  token_expires_at timestamptz,
  unlocked_by      uuid references public.users (id) on delete set null,
  unlocked_at      timestamptz not null default now(),
  started_at       timestamptz,
  deadline_at      timestamptz,
  submitted_at     timestamptz,
  ended_by         text check (ended_by in ('candidate', 'time')),
  answers          jsonb not null default '{}'::jsonb,
  score            integer,
  max_score        integer,
  percent          integer,
  passed           boolean,
  left_page_count  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (candidate_id, attempt_no)
);
create index literacy_attempts_org_idx on public.literacy_attempts (organisation_id);
create trigger literacy_attempts_set_updated_at
  before update on public.literacy_attempts
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.literacy_attempts to service_role;
revoke all on public.literacy_attempts from anon;
revoke all on public.literacy_attempts from authenticated;
grant select on public.literacy_attempts to authenticated;

alter table public.literacy_attempts enable row level security;
create policy literacy_attempts_platform_admin on public.literacy_attempts for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy literacy_attempts_console_read on public.literacy_attempts for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
