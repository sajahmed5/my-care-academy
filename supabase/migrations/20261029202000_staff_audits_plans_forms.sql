-- ============================================================================
-- Staff Audits, part 3: performance plans move in, and each company's own forms
-- (STAFF-AUDITS.md, agreed with Saj 29 Oct 2026)
-- ============================================================================
-- Additive only.
--
-- Performance plans belong to Staff Audits (Growth) now, under their own key,
-- people.performance_plans. A plan is raised from a supervision, spot check or
-- competency that wasn't met (raised_from_*); with Complaints & safeguarding
-- it can still come from a complaint (complaint_id, as before).
--
-- The old pips_org_admin policy (complaints.register) is left in place:
-- policies are OR'd, every package with complaints also has Staff Audits, and
-- the live code until this deploys still checks complaints.register. It can
-- be dropped once this is live.
--
-- staff_audit_forms holds a company's changes to our default forms — the
-- questions, a competency area's criteria, its own areas, and each due
-- period. No row means our default; a row replaces that one form.

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('people.performance_plans', 'people', 'Performance plans', false, 25)
on conflict (key) do nothing;

insert into public.tier_features (tier_key, feature_key) values
  ('core_forms', 'people.performance_plans'),
  ('core_recruitment', 'people.performance_plans'),
  ('full', 'people.performance_plans')
on conflict do nothing;

create policy pips_staff_audits on public.pips for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.performance_plans')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('people.performance_plans')));

alter table public.pips
  add column if not exists raised_from_type text
    check (raised_from_type is null or raised_from_type in ('supervision', 'spot_check', 'competency')),
  add column if not exists raised_from_id uuid;

-- ------------------------------------------------------------ company forms

create table public.staff_audit_forms (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null check (kind in ('supervision', 'appraisal', 'spot_check', 'competency')),
  -- The competency area; '' for the other forms.
  area_key        text not null default '',
  label           text,
  questions       jsonb not null default '[]'::jsonb,
  self_assessment jsonb not null default '[]'::jsonb,
  due_every       smallint not null check (due_every between 1 and 104),
  due_unit        text not null check (due_unit in ('weeks', 'months')),
  -- A competency area the company no longer assesses. Its records keep it.
  archived        boolean not null default false,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, kind, area_key)
);
create trigger staff_audit_forms_set_updated_at
  before update on public.staff_audit_forms
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.staff_audit_forms to service_role;
revoke all on public.staff_audit_forms from anon;
revoke all on public.staff_audit_forms from authenticated;
grant select, insert, update, delete on public.staff_audit_forms to authenticated;

alter table public.staff_audit_forms enable row level security;
create policy staff_audit_forms_platform_admin on public.staff_audit_forms for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy staff_audit_forms_console on public.staff_audit_forms for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and ((select public.has_feature('people.supervisions')) or (select public.has_feature('people.competency'))))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and ((select public.has_feature('people.supervisions')) or (select public.has_feature('people.competency'))));
