-- ============================================================================
-- Staff Audits, part 2: spot checks and competency assessments
-- (STAFF-AUDITS.md, agreed with Saj 29 Oct 2026)
-- ============================================================================
-- Additive only.
--
-- A spot check is now its own record, separate from competency: unannounced,
-- done on a phone in a client's home, the client picked from the client list,
-- a set of yes / no / not-applicable items each with a comment, an overall
-- outcome, and the carer's signature. The client's name is kept as it was on
-- the day, so the record still reads right if the client is later removed.
--
-- A competency assessment stays in competency_checks, one per skill area,
-- now with the area's own criteria and how each went (criteria).
--
-- A spot check or competency that wasn't met suggests training; a manager
-- confirms each course and staff_audit_training records who decided and why,
-- as incident_training does for complaints. Nothing is assigned on its own.
--
-- No carer policies: a carer never reads a spot check or an assessor's
-- comments (CARER-FILE.md §6).

create table public.spot_checks (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations (id) on delete cascade,
  user_id               uuid not null references public.users (id) on delete cascade,
  client_id             uuid references public.clients (id) on delete set null,
  client_name           text,
  checked_on            date not null,
  -- [{id, label, result: yes|no|na, comment}], the wording as asked.
  items                 jsonb not null default '[]'::jsonb,
  outcome               text not null check (outcome in ('met', 'developing', 'not_met')),
  notes                 text,
  next_due              date,
  assessor_id           uuid references public.users (id) on delete set null,
  carer_signature       text,
  carer_signed_name     text,
  carer_signed_at       timestamptz,
  carer_unsigned_reason text,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index spot_checks_person_idx on public.spot_checks (user_id, checked_on desc);
create index spot_checks_due_idx on public.spot_checks (organisation_id, next_due);
create index spot_checks_client_idx on public.spot_checks (client_id);
create trigger spot_checks_set_updated_at
  before update on public.spot_checks
  for each row execute function public.set_updated_at();

alter table public.competency_checks
  add column if not exists criteria jsonb not null default '[]'::jsonb;

create table public.staff_audit_training (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  source_type     text not null check (source_type in ('spot_check', 'competency')),
  source_id       uuid not null,
  course_id       uuid not null references public.courses (id) on delete cascade,
  reason          text,
  assigned_by     uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (source_type, source_id, course_id)
);
create index staff_audit_training_person_idx on public.staff_audit_training (user_id);

-- What a spot check agreed goes on the task list like a supervision's.
alter table public.record_actions drop constraint if exists record_actions_source_type_check;
alter table public.record_actions add constraint record_actions_source_type_check
  check (source_type in ('manual', 'supervision', 'competency', 'complaint', 'audit', 'spot_check'));

-- ------------------------------------------------------------------ grants

grant select, insert, update, delete on public.spot_checks to service_role;
revoke all on public.spot_checks from anon;
revoke all on public.spot_checks from authenticated;
grant select, insert, update, delete on public.spot_checks to authenticated;

grant select, insert, update, delete on public.staff_audit_training to service_role;
revoke all on public.staff_audit_training from anon;
revoke all on public.staff_audit_training from authenticated;
grant select, insert, delete on public.staff_audit_training to authenticated;

-- --------------------------------------------------------------------- RLS

alter table public.spot_checks enable row level security;
create policy spot_checks_platform_admin on public.spot_checks for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy spot_checks_console on public.spot_checks for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.competency')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.competency')));

alter table public.staff_audit_training enable row level security;
create policy staff_audit_training_platform_admin on public.staff_audit_training for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy staff_audit_training_console on public.staff_audit_training for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.competency')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.competency')));
