-- ============================================================================
-- Staff Audits, part 1: supervisions and appraisals as real forms
-- (STAFF-AUDITS.md, agreed with Saj 29 Oct 2026)
-- ============================================================================
-- Additive only: the live code reads supervisions as it always has.
--
-- A supervision keeps the questions it was asked with their answers, as a
-- snapshot (answers), so editing the company's form later never rewrites a
-- record already signed. Last time's actions are reviewed at the start of the
-- next one (actions_review), and both people sign: the carer as before, the
-- manager now too.
--
-- A manager books the next one (staff_audit_bookings); the person is told the
-- date and who with, and can read their own bookings. Spot checks are never
-- booked — they stay unannounced. An appraisal booking comes with a short
-- self-assessment (appraisal_self_assessments) the person fills in on their
-- own login beforehand. That is all they can read: never the manager's
-- record (CARER-FILE.md §6).

alter table public.supervisions
  add column if not exists answers           jsonb not null default '[]'::jsonb,
  add column if not exists actions_review    jsonb not null default '[]'::jsonb,
  add column if not exists manager_signature text,
  add column if not exists manager_signed_name text,
  add column if not exists manager_signed_at timestamptz;

-- ---------------------------------------------------------------- bookings

create table public.staff_audit_bookings (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  kind            text not null check (kind in ('supervision', 'appraisal')),
  booked_on       date not null,
  -- Free text ("10:00", "after the 9am call"): a care manager books around a
  -- rota, not a calendar grid.
  booked_time     text,
  with_user_id    uuid references public.users (id) on delete set null,
  location        text,
  -- For the person: it goes in their email, so it is never the manager's notes.
  note            text,
  status          text not null default 'booked' check (status in ('booked', 'done', 'cancelled')),
  supervision_id  uuid references public.supervisions (id) on delete set null,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index staff_audit_bookings_person_idx on public.staff_audit_bookings (user_id, booked_on);
create index staff_audit_bookings_org_idx on public.staff_audit_bookings (organisation_id, status, booked_on);
create trigger staff_audit_bookings_set_updated_at
  before update on public.staff_audit_bookings
  for each row execute function public.set_updated_at();

alter table public.supervisions
  add column if not exists booking_id uuid references public.staff_audit_bookings (id) on delete set null;

-- ------------------------------------------------------- self-assessments

create table public.appraisal_self_assessments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  booking_id      uuid not null unique references public.staff_audit_bookings (id) on delete cascade,
  -- The questions as they were when the appraisal was booked.
  questions       jsonb not null default '[]'::jsonb,
  answers         jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index appraisal_self_assessments_person_idx on public.appraisal_self_assessments (user_id);
create trigger appraisal_self_assessments_set_updated_at
  before update on public.appraisal_self_assessments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ grants
-- AGENTS.md. Supabase still grants anon and authenticated by default on this
-- project, so both are revoked first and the narrow set granted back.

grant select, insert, update, delete on public.staff_audit_bookings to service_role;
revoke all on public.staff_audit_bookings from anon;
revoke all on public.staff_audit_bookings from authenticated;
grant select, insert, update, delete on public.staff_audit_bookings to authenticated;

grant select, insert, update, delete on public.appraisal_self_assessments to service_role;
revoke all on public.appraisal_self_assessments from anon;
revoke all on public.appraisal_self_assessments from authenticated;
-- Only the answers can be changed once it exists: the person fills them in,
-- and the questions stay as they were booked.
grant select, insert, delete on public.appraisal_self_assessments to authenticated;
grant update (answers, submitted_at) on public.appraisal_self_assessments to authenticated;

-- --------------------------------------------------------------------- RLS

alter table public.staff_audit_bookings enable row level security;
create policy staff_audit_bookings_platform_admin on public.staff_audit_bookings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy staff_audit_bookings_console on public.staff_audit_bookings for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.supervisions')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.supervisions')));
-- Their own booked dates, and nothing else.
create policy staff_audit_bookings_own_read on public.staff_audit_bookings for select to authenticated
  using (user_id = (select auth.uid()) and (select public.has_feature('people.supervisions')));

alter table public.appraisal_self_assessments enable row level security;
create policy appraisal_self_assessments_platform_admin on public.appraisal_self_assessments for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy appraisal_self_assessments_console on public.appraisal_self_assessments for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.supervisions')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.supervisions')));
create policy appraisal_self_assessments_own_read on public.appraisal_self_assessments for select to authenticated
  using (user_id = (select auth.uid()) and (select public.has_feature('people.supervisions')));
-- Theirs to fill in until the appraisal is held or called off.
create policy appraisal_self_assessments_own_update on public.appraisal_self_assessments for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_feature('people.supervisions'))
         and exists (select 1 from public.staff_audit_bookings b where b.id = booking_id and b.status = 'booked'))
  with check (user_id = (select auth.uid()) and (select public.has_feature('people.supervisions')));
