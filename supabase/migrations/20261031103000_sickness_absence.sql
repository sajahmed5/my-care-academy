-- ============================================================================
-- HR pack: sickness absence and return to work (HR-PACK.md, 29 Oct 2026)
-- ============================================================================
-- Additive only.
--
-- An absence: start and return dates, the reason as a category,
-- self-certified up to 7 days or a fit note (with its end date) beyond that.
-- The return-to-work interview lives on the absence (one each, due within 3
-- days of coming back); long-term absences (over 4 weeks) get welfare
-- meetings and a record of any occupational health referral.
--
-- Triggers: a Bradford Factor score over the last 52 weeks, with trigger
-- points the company sets. Reaching one flags it to the manager; nothing
-- happens automatically.

alter table public.hr_settings
  add column if not exists self_report_sickness boolean not null default false,
  add column if not exists bradford_triggers integer[] not null default '{51,201,401}';

create table public.sickness_absences (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations (id) on delete cascade,
  user_id            uuid not null references public.users (id) on delete cascade,
  start_date         date not null,
  -- Their first day back; null while they're still off.
  returned_on        date,
  reason             text not null,
  reason_detail      text,
  certification      text not null default 'self' check (certification in ('self', 'fit_note', 'none')),
  fit_note_path      text,
  fit_note_name      text,
  fit_note_until     date,
  -- Left out of the Bradford score (pregnancy-related, disability-related, an
  -- injury at work), with the reason: counting those can be discrimination.
  excluded_from_triggers boolean not null default false,
  exclusion_reason   text,
  reported_by_self   boolean not null default false,
  reported_by        uuid references public.users (id) on delete set null,
  -- Return to work.
  rtw_status         text not null default 'none' check (rtw_status in ('none', 'held', 'not_needed')),
  rtw_held_on        date,
  rtw_by             uuid references public.users (id) on delete set null,
  rtw_answers        jsonb not null default '{}'::jsonb,
  -- Long-term sickness: occupational health.
  oh_referred_on     date,
  oh_notes           text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (returned_on is null or returned_on > start_date)
);
create index sickness_absences_person_idx on public.sickness_absences (user_id, start_date desc);
create index sickness_absences_org_idx on public.sickness_absences (organisation_id, start_date desc);
create trigger sickness_absences_set_updated_at
  before update on public.sickness_absences
  for each row execute function public.set_updated_at();

create table public.absence_welfare_meetings (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  absence_id      uuid not null references public.sickness_absences (id) on delete cascade,
  held_on         date not null,
  how             text,
  notes           text not null default '',
  held_by         uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index absence_welfare_meetings_absence_idx on public.absence_welfare_meetings (absence_id, held_on);

-- ------------------------------------------------------------------ grants

revoke all on public.sickness_absences, public.absence_welfare_meetings from anon, authenticated;
grant select, insert, update, delete on public.sickness_absences, public.absence_welfare_meetings to service_role;
grant select on public.sickness_absences, public.absence_welfare_meetings to authenticated;

-- --------------------------------------------------------------------- RLS
-- Writes go through server actions as the service role, which check the
-- person and the HR pack. No policy for the person themselves: the record
-- holds the manager's notes (return to work, welfare, occupational health),
-- so their own page reads only their dates and reason, as the service role.

alter table public.sickness_absences enable row level security;
create policy sickness_absences_platform_admin on public.sickness_absences for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy sickness_absences_console_read on public.sickness_absences for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));

alter table public.absence_welfare_meetings enable row level security;
create policy absence_welfare_meetings_platform_admin on public.absence_welfare_meetings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy absence_welfare_meetings_console_read on public.absence_welfare_meetings for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
