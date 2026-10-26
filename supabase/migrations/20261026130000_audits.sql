-- ============================================================================
-- Audits on a schedule
-- ============================================================================
-- ROADMAP §4: medication, care plan and infection control audits — templated,
-- recurring, findings become actions. The same engine as spot checks, pointed
-- at the service rather than a person. The templates are code (lib/audits.ts);
-- this table holds each audit carried out.
--
--   kind        which template (medication, care_plan, infection_control);
--               text, not a constraint, so adding a template is not a migration
--   subject     what it was about: a person's medicines, a care plan, a site
--   answers     { question id: yes | no | na }
--   score       share of applicable questions met, 0–100, kept for reports
--   next_due    when this kind is next due, defaulting from the template
--
-- A new feature, quality.audits, in a new "Quality" category, ticked into Pro
-- and Enterprise beside spot checks (a default the Packages screen can change).
-- record_actions accepts 'audit' as a source, so a finding's action sits in
-- its owner's task list like any other.
--
-- Grants per AGENTS.md, with Supabase's automatic grant revoked explicitly.

insert into public.feature_categories (key, label, description, sort_order) values
  ('quality', 'Quality', 'How the service checks itself: audits and feedback.', 50)
on conflict (key) do nothing;

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('quality.audits', 'quality', 'Audits', false, 10)
on conflict (key) do nothing;

insert into public.tier_features (tier_key, feature_key) values
  ('core_recruitment', 'quality.audits'),
  ('full', 'quality.audits')
on conflict do nothing;

alter table public.record_actions drop constraint if exists record_actions_source_type_check;
alter table public.record_actions add constraint record_actions_source_type_check
  check (source_type in ('manual', 'supervision', 'competency', 'complaint', 'audit'));

create table public.audits (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null check (length(btrim(kind)) > 0),
  subject         text,
  held_on         date not null,
  auditor_id      uuid references public.users (id) on delete set null,
  answers         jsonb not null default '{}'::jsonb,
  score           integer check (score is null or score between 0 and 100),
  notes           text,
  next_due        date,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index audits_org_idx on public.audits (organisation_id, kind, held_on desc);

create trigger audits_set_updated_at
  before update on public.audits
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.audits to service_role;
revoke all on public.audits from anon;
revoke delete, truncate, references, trigger on public.audits from authenticated;
grant select, insert, update on public.audits to authenticated;

alter table public.audits enable row level security;

create policy audits_platform_admin on public.audits for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy audits_console on public.audits for all to authenticated
  using (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('quality.audits'))
  )
  with check (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('quality.audits'))
  );
