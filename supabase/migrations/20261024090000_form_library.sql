-- ============================================================================
-- The forms library: forms we author, organisations assign, carers fill in.
-- ============================================================================
-- The forms feature shipped as a builder: a manager makes a form from one of
-- three templates in code, adds fields, and — because the fill page requires
-- org_admin — fills it in on the carer's behalf. Saj, 24 Oct 2026: that is the
-- wrong way round. We make the forms for companies; they use them. They do
-- not build forms.
--
-- So the model becomes the policies library's: one master, authored and
-- published by the platform, in categories; an organisation assigns a form to
-- a person with a due date; the carer completes it on their own login; the
-- response is evidence. The old builder's tables (forms, form_fields,
-- form_submissions) are left exactly as they are — organisations have forms
-- in them — and these are new tables beside them, not a migration of them.
--
-- Fields are held as JSON rather than rows, as the policies' blocks are. A
-- template is authored whole and read whole; nothing queries "every date
-- field across every form". The shape is lib/forms.ts's FormField, which the
-- builder already uses, so the fill-in UI needs no second model.
-- ============================================================================

create table public.form_templates (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  title         text not null,
  description   text,
  -- Where it files: recruitment, quality, review, care, hr, other. Free text
  -- with the list in lib/form-library.ts, as the policies' categories are.
  category      text not null check (length(btrim(category)) > 0),
  -- Which packages include it. forms.builder is the gate for everything;
  -- 'addon' forms arrive with the add-on they belong to.
  pack          text not null default 'full' check (pack in ('basic', 'full', 'addon')),
  collection    text,
  service_types text[],
  -- [{ id, label, type, options, required, conditional, sort_order }, …]
  fields        jsonb not null default '[]'::jsonb,
  version       integer not null default 1,
  status        text not null default 'draft'
                  check (status in ('draft', 'published', 'retired')),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index form_templates_category_idx on public.form_templates (category, sort_order);
create index form_templates_status_idx on public.form_templates (status);

create trigger form_templates_set_updated_at
  before update on public.form_templates
  for each row execute function public.set_updated_at();

-- An organisation asks a person to complete a form, by a date. The assignment
-- is the manager's record of having asked; the response below is the carer's
-- record of having done it. Kept apart so "asked and not done" is a state the
-- task list can show.
create table public.form_assignments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  template_id     uuid not null references public.form_templates (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  assigned_by     uuid references public.users (id) on delete set null,
  due_date        date,
  note            text,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  -- One open ask per person per form. Re-assigning after completion is a new
  -- row, which is the history.
  unique (template_id, user_id, completed_at)
);

create index form_assignments_person_idx
  on public.form_assignments (user_id, completed_at, due_date);
create index form_assignments_org_idx
  on public.form_assignments (organisation_id, completed_at, due_date);

create table public.form_responses (
  id               uuid primary key default gen_random_uuid(),
  assignment_id    uuid not null unique references public.form_assignments (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  template_id      uuid not null references public.form_templates (id) on delete cascade,
  -- The version they filled in. Revise the form and this stays true about
  -- the questions they were actually asked.
  template_version integer not null,
  user_id          uuid not null references public.users (id) on delete cascade,
  -- { [fieldId]: value }
  answers          jsonb not null default '{}'::jsonb,
  -- A typed name against a signature field, with the time it was typed.
  signed_name      text,
  submitted_at     timestamptz not null default now()
);

create index form_responses_person_idx on public.form_responses (user_id, submitted_at desc);
create index form_responses_org_idx on public.form_responses (organisation_id, template_id);

-- ============================================================================
-- Grants (changelog 45329). RLS gates the rows; this is the outer gate.
-- ============================================================================
grant select, insert, update, delete on public.form_templates to service_role;
grant select on public.form_templates to authenticated;
grant select, insert, update, delete on public.form_assignments to service_role;
grant select, insert, update, delete on public.form_assignments to authenticated;
grant select, insert, update, delete on public.form_responses to service_role;
grant select, insert on public.form_responses to authenticated;
-- nothing to anon. No update or delete on responses for anyone but the
-- service role: a completed form is a fact with a date, not a setting.

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.form_templates enable row level security;
alter table public.form_assignments enable row level security;
alter table public.form_responses enable row level security;

create policy form_templates_platform_admin on public.form_templates for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy form_templates_read on public.form_templates for select to authenticated
  using (status = 'published' and public.has_feature('forms.builder'));

create policy form_assignments_platform_admin on public.form_assignments for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy form_assignments_org_admin on public.form_assignments for all to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('forms.builder')
  )
  with check (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('forms.builder')
  );

-- A carer sees what they have been asked to do, and marks it done by
-- submitting — the update that sets completed_at is theirs to make, and is
-- the only write a carer has on this table.
create policy form_assignments_own_read on public.form_assignments for select to authenticated
  using (user_id = (select auth.uid()));

create policy form_assignments_own_complete on public.form_assignments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy form_responses_platform_admin on public.form_responses for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy form_responses_org_admin_read on public.form_responses for select to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
  );

-- The response is the carer's own — the insert runs as them and permits no
-- other user_id, which is what makes it evidence rather than a form a manager
-- filled in with somebody's name on it.
create policy form_responses_own_read on public.form_responses for select to authenticated
  using (user_id = (select auth.uid()));

create policy form_responses_own_insert on public.form_responses for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organisation_id = public.current_org_id()
  );

-- ============================================================================
-- The feature was named for the builder. It is the library now.
-- ============================================================================
update public.features set label = 'Forms library' where key = 'forms.builder';
