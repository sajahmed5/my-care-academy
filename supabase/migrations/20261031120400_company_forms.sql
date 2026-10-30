-- ============================================================================
-- Forms: a company's own forms (FORMS.md, "Editable")
-- ============================================================================
-- Our library is the starting point. A company can edit its own copy of a
-- library form and build its own forms — replacing the 24 Oct 2026 rule that
-- only we write forms. It can still ask us to build one.
--
--   form_templates.organisation_id   null for ours; set for a company's own
--                                    form, seen by that company only
--   form_templates.based_on_id       the library form a copy was made from,
--   form_templates.based_on_version  and its version then — so we can say
--                                    when ours has moved on
--   organisation_form_settings       per company, per library form: switched
--                                    off, and its own review period
--
-- A company's copy replaces ours in its list; switching a form off hides it
-- from the list without touching anything already filled in. Setting forms up
-- is manager-only in the app (Settings → Forms); in the database it is the
-- console, as every org-side policy is (AGENTS.md).
--
-- The old builder (forms, form_fields — one form, in Demo Care, never filled
-- in) is carried across into company forms, and its tables are left as they
-- are.
--
-- Safe for the live code: it reads published templates and none are a
-- company's yet; the narrowed read policy returns exactly what it did.
-- ============================================================================

alter table public.form_templates
  add column if not exists organisation_id uuid references public.organisations (id) on delete cascade,
  add column if not exists based_on_id uuid references public.form_templates (id) on delete set null,
  add column if not exists based_on_version integer,
  add column if not exists created_by uuid references public.users (id) on delete set null;

create index if not exists form_templates_org_idx
  on public.form_templates (organisation_id) where organisation_id is not null;
-- One copy of each library form per company.
create unique index if not exists form_templates_one_copy
  on public.form_templates (organisation_id, based_on_id) where organisation_id is not null and based_on_id is not null;

-- Library forms for every company with forms; a company's own for it alone.
drop policy if exists form_templates_read on public.form_templates;
create policy form_templates_read on public.form_templates for select to authenticated
  using (
    status = 'published'
    and (select public.has_feature('forms.builder'))
    and (organisation_id is null or organisation_id = (select public.current_org_id()))
  );

-- The console manages its own company's forms, drafts included.
drop policy if exists form_templates_company on public.form_templates;
create policy form_templates_company on public.form_templates for all to authenticated
  using (
    organisation_id is not null
    and organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('forms.builder'))
  )
  with check (
    organisation_id is not null
    and organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('forms.builder'))
  );

-- No delete: a form with answers is retired, never removed (responses
-- cascade from it).
grant insert, update on public.form_templates to authenticated;

create table if not exists public.organisation_form_settings (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  template_id     uuid not null references public.form_templates (id) on delete cascade,
  hidden          boolean not null default false,
  review_months   integer check (review_months between 1 and 60),
  updated_by      uuid references public.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (organisation_id, template_id)
);

revoke all on public.organisation_form_settings from anon;
revoke all on public.organisation_form_settings from authenticated;
grant select, insert, update, delete on public.organisation_form_settings to service_role;
grant select, insert, update, delete on public.organisation_form_settings to authenticated;

alter table public.organisation_form_settings enable row level security;

create policy organisation_form_settings_platform_admin on public.organisation_form_settings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- Anyone in the company can read them: a carer's completed form takes its
-- review date from the company's period.
create policy organisation_form_settings_read on public.organisation_form_settings for select to authenticated
  using (organisation_id = (select public.current_org_id()));

create policy organisation_form_settings_console on public.organisation_form_settings for all to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('forms.builder'))
  )
  with check (
    organisation_id = (select public.current_org_id())
    and (select public.is_console_user())
    and (select public.has_feature('forms.builder'))
  );

-- The old builder's forms become company forms, field ids kept so their
-- conditionals still point at the right question.
insert into public.form_templates (code, title, description, category, pack, audience, organisation_id, fields, status, sort_order)
select
  'ORG-' || upper(substr(replace(f.id::text, '-', ''), 1, 10)),
  f.title,
  f.description,
  'other',
  'full',
  'carer',
  f.organisation_id,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ff.id::text,
      'label', ff.label,
      'type', ff.type,
      'options', coalesce(ff.options, '[]'::jsonb),
      'required', ff.required,
      'conditional', ff.conditional,
      'sort_order', ff.sort_order
    ) order by ff.sort_order)
    from public.form_fields ff where ff.form_id = f.id
  ), '[]'::jsonb),
  case when f.status = 'published' then 'published' else 'draft' end,
  0
from public.forms f
on conflict (code) do nothing;
