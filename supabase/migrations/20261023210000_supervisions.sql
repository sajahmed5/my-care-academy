-- ============================================================================
-- Supervisions and appraisals.
-- ============================================================================
-- Step 3 of CARER-FILE.md. The most-asked-for evidence at inspection, and the
-- one every small provider keeps in a folder: when the supervision happened,
-- who held it, what was agreed, and when the next one is due.
--
-- It is also the template for the record types after it — spot checks, audits,
-- incidents — so the shape is deliberately plain: a dated record, held by
-- somebody, about somebody, with a summary, a next-due date, and actions that
-- live in record_actions rather than in a text field nobody can chase.
--
-- What it does NOT have is a learner read policy, deliberately. CARER-FILE.md
-- §6: a carer reading a manager's unfinished note about them is a serious
-- problem, not a small one. The actions agreed with them are theirs to see —
-- record_actions already lets them — and the note is not, until there is a
-- design for signing one off.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Catalogue: a category for what the employer holds about a person, and the
-- feature itself. Mirrored in lib/features.ts; tests/entitlements asserts the
-- two agree.
-- ----------------------------------------------------------------------------
insert into public.feature_categories (key, label, description, sort_order) values
  ('people', 'Staff records', 'What the employer records about a member of staff.', 45)
on conflict (key) do nothing;

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('people.supervisions', 'people', 'Supervisions & appraisals', false, 10)
on conflict (key) do nothing;

-- Deliberately ticked into no package. Which plans include supervisions is a
-- commercial decision for the Packages screen, and Saj has it.

create table public.supervisions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- Who it is about.
  user_id         uuid not null references public.users (id) on delete cascade,
  -- Who held it. Nullable because a supervisor may later be deleted, and the
  -- record of the supervision must outlive their account.
  supervisor_id   uuid references public.users (id) on delete set null,
  kind            text not null default 'supervision'
                    check (kind in ('supervision', 'appraisal', 'probation', 'return_to_work')),
  held_on         date not null,
  summary         text,
  -- When the next one is due. Null means "not scheduled", which is a real
  -- state and the one a manager most needs to see.
  next_due        date,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index supervisions_person_idx on public.supervisions (user_id, held_on desc);
create index supervisions_due_idx on public.supervisions (organisation_id, next_due);

create trigger supervisions_set_updated_at
  before update on public.supervisions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Grants (changelog 45329 — a new table grants its own or it is invisible to
-- supabase-js and PostgREST). RLS gates the rows; this is the outer gate.
-- ============================================================================
grant select, insert, update, delete on public.supervisions to service_role;
grant select, insert, update, delete on public.supervisions to authenticated;
-- nothing to anon.

-- ============================================================================
-- RLS — org-scoped AND feature-gated, the way observations are.
-- ============================================================================
alter table public.supervisions enable row level security;

create policy supervisions_platform_admin on public.supervisions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy supervisions_org_admin on public.supervisions for all to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('people.supervisions')
  )
  with check (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('people.supervisions')
  );
