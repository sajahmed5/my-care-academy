-- ============================================================================
-- HR pack: probation reviews, and what the rest of the pack builds on
-- (HR-PACK.md, agreed 29 Oct 2026)
-- ============================================================================
-- Additive only: the live code reads none of these.
--
-- hr_settings     the company's HR setup (probation length and review points
--                 here; absence, holidays and cases add their own columns).
-- staff_employment one row per member of staff: their start date, job title
--                 and where their probation stands. Hiring fills it in.
-- probation_reviews a review held (or booked) on a due date.
-- hr_letters      every HR letter: drafted, checked by a person, emailed and
--                 kept as a PDF. The carer reads the ones sent to them.
--
-- Everything is the HR pack, gated on recruitment.tracker (in every package
-- since 30 Oct 2026; the pack is never split, so it has one key).

create table public.hr_settings (
  organisation_id         uuid primary key references public.organisations (id) on delete cascade,
  probation_months        integer not null default 6 check (probation_months between 1 and 24),
  probation_review_months integer[] not null default '{1,3,6}',
  -- The company's own wording, per letter: { "<kind>": { "subject": "…", "body": "…" } }.
  letter_templates        jsonb not null default '{}'::jsonb,
  letter_signatory_name   text,
  letter_signatory_title  text,
  updated_by              uuid references public.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger hr_settings_set_updated_at
  before update on public.hr_settings
  for each row execute function public.set_updated_at();

create table public.staff_employment (
  user_id          uuid primary key references public.users (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  start_date       date,
  job_title        text,
  probation_status text not null default 'in_probation'
                   check (probation_status in ('in_probation', 'passed', 'extended', 'not_passed', 'none')),
  -- When probation ends: start + the company's length, moved on by an extension.
  probation_ends_on date,
  updated_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index staff_employment_org_idx on public.staff_employment (organisation_id);
create trigger staff_employment_set_updated_at
  before update on public.staff_employment
  for each row execute function public.set_updated_at();

create table public.probation_reviews (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  -- The review point this answers: start date + n months, or the end of probation.
  due_on          date not null,
  is_final        boolean not null default false,
  booked_on       date,
  booked_time     text,
  status          text not null default 'draft' check (status in ('booked', 'draft', 'held')),
  held_on         date,
  held_by         uuid references public.users (id) on delete set null,
  -- What the site knew on the day (training, induction, audits), kept as it was.
  facts           jsonb not null default '{}'::jsonb,
  answers         jsonb not null default '{}'::jsonb,
  outcome         text check (outcome in ('on_track', 'concerns', 'passed', 'extended', 'not_passed')),
  extend_months   integer check (extend_months between 1 and 6),
  outcome_reason  text,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, due_on)
);
create index probation_reviews_org_idx on public.probation_reviews (organisation_id, status);
create trigger probation_reviews_set_updated_at
  before update on public.probation_reviews
  for each row execute function public.set_updated_at();

create table public.hr_letters (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  kind            text not null,
  -- What it belongs to: a probation review, a case, a leaver record.
  source_type     text,
  source_id       uuid,
  subject         text not null default '',
  body            text not null default '',
  -- Paragraphs the company can't edit away (ACAS: the right to be accompanied,
  -- the right to appeal), sent after the body.
  fixed           jsonb not null default '[]'::jsonb,
  status          text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at         timestamptz,
  sent_to         text,
  sent_by         uuid references public.users (id) on delete set null,
  pdf_path        text,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index hr_letters_person_idx on public.hr_letters (user_id, created_at desc);
create index hr_letters_source_idx on public.hr_letters (source_type, source_id);
create trigger hr_letters_set_updated_at
  before update on public.hr_letters
  for each row execute function public.set_updated_at();

-- Letter PDFs and, later, fit notes and case evidence. Private; written and
-- read as the service role after the action has checked the organisation.
insert into storage.buckets (id, name, public)
values ('hr-docs', 'hr-docs', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------------ grants
-- AGENTS.md. This project still auto-grants, so revoke first.

revoke all on public.hr_settings, public.staff_employment, public.probation_reviews, public.hr_letters from anon, authenticated;
grant select, insert, update, delete on public.hr_settings, public.staff_employment, public.probation_reviews, public.hr_letters to service_role;
-- The console reads under RLS; every write goes through a server action as
-- the service role, which checks the role (settings are managers only).
grant select on public.hr_settings, public.staff_employment, public.probation_reviews, public.hr_letters to authenticated;

-- --------------------------------------------------------------------- RLS

alter table public.hr_settings enable row level security;
create policy hr_settings_platform_admin on public.hr_settings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_settings_console_read on public.hr_settings for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));

alter table public.staff_employment enable row level security;
create policy staff_employment_platform_admin on public.staff_employment for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy staff_employment_console_read on public.staff_employment for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
create policy staff_employment_own_read on public.staff_employment for select to authenticated
  using (user_id = (select auth.uid()) and (select public.has_feature('recruitment.tracker')));

alter table public.probation_reviews enable row level security;
create policy probation_reviews_platform_admin on public.probation_reviews for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy probation_reviews_console_read on public.probation_reviews for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
-- No policy for the carer: the review is the manager's record. They are told
-- the booked date by email, and their own page reads only that date as the
-- service role.

alter table public.hr_letters enable row level security;
create policy hr_letters_platform_admin on public.hr_letters for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_letters_console_read on public.hr_letters for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
-- The carer reads the letters sent to them, never a draft.
create policy hr_letters_own_read on public.hr_letters for select to authenticated
  using (user_id = (select auth.uid()) and status = 'sent' and (select public.has_feature('recruitment.tracker')));
