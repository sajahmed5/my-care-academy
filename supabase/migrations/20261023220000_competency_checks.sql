-- ============================================================================
-- Spot checks and competency assessments.
-- ============================================================================
-- Step 4 of CARER-FILE.md, and the same engine as supervisions pointed at a
-- different question. A supervision asks how someone is getting on; a spot
-- check asks whether they can still do the thing safely — medication,
-- moving and handling, infection control — and is repeated on a schedule
-- because competence is not a certificate you earn once.
--
-- This is the record that training alone cannot give you. A certificate says
-- they passed a test about medication; a spot check says somebody watched
-- them give it.
--
-- As with supervisions there is no learner policy: the assessor's note about
-- a carer is the employer's record. What follows from it — "repeat the
-- medication check in three months" — becomes a record_action, which the
-- carer can see, because that is the part they need to act on.
-- ============================================================================

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('people.competency', 'people', 'Spot checks & competency', false, 20)
on conflict (key) do nothing;

-- In no package, deliberately: which plans include it is Saj's call on the
-- Packages screen.

create table public.competency_checks (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  -- Who watched. Nullable so the record outlives the assessor's account.
  assessor_id     uuid references public.users (id) on delete set null,
  -- What was checked. Deliberately unconstrained text, unlike outcome below:
  -- the list of areas is UI copy in lib/competency.ts and will grow with the
  -- market, and a check constraint would make "add infection control" a
  -- migration. A typo here costs a mislabelled row; a constraint costs a
  -- deploy every time the business learns something.
  area            text not null check (length(btrim(area)) > 0),
  -- The outcome is a closed set and must stay one: it is what a report counts.
  outcome         text not null
                    check (outcome in ('met', 'developing', 'not_met')),
  checked_on      date not null,
  notes           text,
  next_due        date,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index competency_checks_person_idx
  on public.competency_checks (user_id, checked_on desc);
create index competency_checks_due_idx
  on public.competency_checks (organisation_id, next_due);

create trigger competency_checks_set_updated_at
  before update on public.competency_checks
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Grants (changelog 45329) — RLS gates the rows, this is the outer gate.
-- ============================================================================
grant select, insert, update, delete on public.competency_checks to service_role;
grant select, insert, update, delete on public.competency_checks to authenticated;
-- nothing to anon.

-- ============================================================================
-- RLS — org-scoped and feature-gated, as supervisions are.
-- ============================================================================
alter table public.competency_checks enable row level security;

create policy competency_checks_platform_admin on public.competency_checks for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy competency_checks_org_admin on public.competency_checks for all to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('people.competency')
  )
  with check (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('people.competency')
  );
