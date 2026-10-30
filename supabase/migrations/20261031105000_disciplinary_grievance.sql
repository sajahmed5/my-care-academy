-- ============================================================================
-- HR pack: disciplinary and grievance (HR-PACK.md, agreed 29 Oct 2026)
-- ============================================================================
-- Additive only. Both follow the ACAS Code of Practice. One case file each:
-- the case (stage, suspension, investigation, hearing, outcome, appeal, the
-- legal reminders), its notes and evidence, its meetings with minutes signed
-- by the employee (or their refusal recorded), and witness statements typed
-- and signed on the spot or written by the witness from a link. Letters are
-- hr_letters with source_type 'case'.
--
-- Who sees a case: managers, by default; a manager can give named office
-- workers access (hr_settings.case_office_access). Nobody sees a case about
-- themselves: a grievance about a manager is handled by someone else and that
-- manager can't see it. The employee reads the letters sent to them, never
-- the investigation notes or witness statements.

alter table public.hr_settings
  add column if not exists case_office_access uuid[] not null default '{}',
  add column if not exists warning_first_months integer not null default 6 check (warning_first_months between 1 and 36),
  add column if not exists warning_final_months integer not null default 12 check (warning_final_months between 1 and 36),
  add column if not exists hearing_notice_days integer not null default 5 check (hearing_notice_days between 1 and 30),
  add column if not exists appeal_days integer not null default 5 check (appeal_days between 1 and 30),
  add column if not exists grievance_ack_days integer not null default 5 check (grievance_ack_days between 1 and 30);

create table public.hr_cases (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references public.organisations (id) on delete cascade,
  ref                  text not null,
  kind                 text not null check (kind in ('disciplinary', 'grievance')),
  -- Disciplinary only: misconduct, or poor performance.
  subtype              text check (subtype in ('conduct', 'capability')),
  -- The employee: the subject of a disciplinary, the one raising a grievance.
  user_id              uuid not null references public.users (id) on delete cascade,
  -- A grievance about someone: they can't see the case.
  about_user_id        uuid references public.users (id) on delete set null,
  summary              text not null,
  raised_via           text not null default 'office' check (raised_via in ('office', 'own_login', 'in_writing')),
  raised_on            date not null default current_date,
  raised_by            uuid references public.users (id) on delete set null,
  -- Where it came from: a complaint, a spot check, an absence trigger…
  linked_type          text,
  linked_id            uuid,
  linked_label         text,
  stage                text not null,
  -- Suspension: on full pay, a precaution.
  suspended_on         date,
  suspension_reason    text,
  suspension_review_on date,
  suspension_ended_on  date,
  -- Investigation.
  investigator_id      uuid references public.users (id) on delete set null,
  investigation_report text,
  recommendation       text check (recommendation in ('no_case', 'informal', 'hearing')),
  -- The hearing (disciplinary) or meeting (grievance).
  hearing_on           date,
  hearing_time         text,
  hearing_place        text,
  invited_on           date,
  -- Outcome.
  outcome              text check (outcome in ('no_action', 'first_written', 'final_written', 'dismissal', 'upheld', 'partly_upheld', 'not_upheld')),
  outcome_on           date,
  outcome_notes        text,
  decided_by           uuid references public.users (id) on delete set null,
  warning_expires_on   date,
  -- Appeal: heard by a different manager.
  appeal_received_on   date,
  appeal_grounds       text,
  appeal_manager_id    uuid references public.users (id) on delete set null,
  appeal_hearing_on    date,
  appeal_outcome       text check (appeal_outcome in ('upheld', 'not_upheld', 'varied')),
  appeal_outcome_notes text,
  appeal_decided_on    date,
  closed_on            date,
  -- Legal reminders: the site reminds, the manager confirms (HR-PACK.md).
  dbs_referral         text not null default 'unknown' check (dbs_referral in ('unknown', 'needed', 'not_needed', 'done')),
  dbs_referral_on      date,
  cqc_notice           text not null default 'unknown' check (cqc_notice in ('unknown', 'needed', 'not_needed', 'done')),
  cqc_notice_on        date,
  la_notice            text not null default 'unknown' check (la_notice in ('unknown', 'needed', 'not_needed', 'done')),
  la_notice_on         date,
  reminded_on          date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organisation_id, ref)
);
create index hr_cases_org_idx on public.hr_cases (organisation_id, closed_on);
create index hr_cases_person_idx on public.hr_cases (user_id);
create trigger hr_cases_set_updated_at
  before update on public.hr_cases
  for each row execute function public.set_updated_at();

create table public.hr_case_notes (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  case_id         uuid not null references public.hr_cases (id) on delete cascade,
  kind            text not null default 'note' check (kind in ('note', 'evidence', 'event')),
  body            text not null default '',
  file_path       text,
  file_name       text,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index hr_case_notes_case_idx on public.hr_case_notes (case_id, created_at);

create table public.hr_case_meetings (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations (id) on delete cascade,
  case_id             uuid not null references public.hr_cases (id) on delete cascade,
  kind                text not null check (kind in ('investigation', 'hearing', 'meeting', 'appeal')),
  held_on             date not null,
  attendees           text,
  accompanied_by      text,
  minutes             text not null default '',
  employee_signature  text,
  employee_signed_name text,
  employee_signed_at  timestamptz,
  refused_to_sign     boolean not null default false,
  refused_note        text,
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index hr_case_meetings_case_idx on public.hr_case_meetings (case_id, held_on);
create trigger hr_case_meetings_set_updated_at
  before update on public.hr_case_meetings
  for each row execute function public.set_updated_at();

create table public.hr_case_statements (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  case_id          uuid not null references public.hr_cases (id) on delete cascade,
  witness_name     text not null,
  witness_email    text,
  method           text not null check (method in ('typed', 'link')),
  statement        text not null default '',
  signature        text,
  signed_name      text,
  signed_at        timestamptz,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'signed')),
  token_hash       text unique,
  token_expires_at timestamptz,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index hr_case_statements_case_idx on public.hr_case_statements (case_id);
create trigger hr_case_statements_set_updated_at
  before update on public.hr_case_statements
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- who sees a case

-- One rule, used by every policy below: a console user of the company with
-- the HR pack who is a manager or a named office worker, and is neither the
-- employee nor the person a grievance is about. security definer so it can
-- read hr_settings and hr_cases whatever the caller's own policies say.
create or replace function public.can_see_hr_case(p_case uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hr_cases c
    left join public.hr_settings s on s.organisation_id = c.organisation_id
    where c.id = p_case
      and c.organisation_id = public.current_org_id()
      and public.is_console_user()
      and public.has_feature('recruitment.tracker')
      and c.user_id <> (select auth.uid())
      and c.about_user_id is distinct from (select auth.uid())
      and (public.current_user_role() = 'org_admin' or (select auth.uid()) = any (coalesce(s.case_office_access, '{}')))
  );
$$;
revoke all on function public.can_see_hr_case(uuid) from public, anon;
grant execute on function public.can_see_hr_case(uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ grants

revoke all on public.hr_cases, public.hr_case_notes, public.hr_case_meetings, public.hr_case_statements from anon, authenticated;
grant select, insert, update, delete on public.hr_cases, public.hr_case_notes, public.hr_case_meetings, public.hr_case_statements to service_role;
grant select on public.hr_cases, public.hr_case_notes, public.hr_case_meetings, public.hr_case_statements to authenticated;

-- --------------------------------------------------------------------- RLS

alter table public.hr_cases enable row level security;
create policy hr_cases_platform_admin on public.hr_cases for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_cases_console_read on public.hr_cases for select to authenticated
  using (public.can_see_hr_case(id));

alter table public.hr_case_notes enable row level security;
create policy hr_case_notes_platform_admin on public.hr_case_notes for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_case_notes_console_read on public.hr_case_notes for select to authenticated
  using (public.can_see_hr_case(case_id));

alter table public.hr_case_meetings enable row level security;
create policy hr_case_meetings_platform_admin on public.hr_case_meetings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_case_meetings_console_read on public.hr_case_meetings for select to authenticated
  using (public.can_see_hr_case(case_id));

alter table public.hr_case_statements enable row level security;
create policy hr_case_statements_platform_admin on public.hr_case_statements for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_case_statements_console_read on public.hr_case_statements for select to authenticated
  using (public.can_see_hr_case(case_id));

-- A case's letters are as private as the case: the console reads one only
-- when it can see the case. Every other letter as before.
drop policy if exists hr_letters_console_read on public.hr_letters;
create policy hr_letters_console_read on public.hr_letters for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker'))
         and (source_type is distinct from 'case' or public.can_see_hr_case(source_id)));
