-- ============================================================================
-- Actions: the one list of what is outstanding for a person.
-- ============================================================================
-- Step 2 of CARER-FILE.md. The platform already knows a dozen things are due
-- for a carer — training overdue, a certificate expiring — and tells you on a
-- different screen for each. This is the table behind the single list, and the
-- thing that makes the features feel like one product rather than seven tabs.
--
-- What it holds is only the half that has nowhere else to live: an action
-- somebody wrote down. "Book Jane onto moving and handling." "Chase the second
-- reference." Later: the actions agreed in a supervision, or after a complaint.
--
-- What it deliberately does NOT hold is anything already derived. Training due
-- dates and certificate expiries are computed from enrolments and certificates
-- today; copying them in here would mean two sources of the same fact, and
-- within a week they would disagree. lib/person-tasks.ts unions the derived
-- rows with these at read time. If that ever gets slow, the fix is a view, not
-- a sync job.
--
-- Not feature-gated. The list is mostly a view over training, which every
-- package includes, and gating it would hide a carer's own overdue course
-- behind an upsell. What is paid for is what feeds it: supervision actions
-- exist only for organisations that have supervisions.
-- ============================================================================

create table public.record_actions (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- Who the action is FOR. An action about a carer belongs in that carer's
  -- file whoever wrote it down.
  user_id         uuid not null references public.users (id) on delete cascade,
  title           text not null check (length(btrim(title)) > 0),
  detail          text,
  -- Nullable: "chase this when you can" is a real state, and a fabricated due
  -- date would show up as overdue and train people to ignore the list.
  due_date        date,
  -- Where it came from. 'manual' is all that can occur today; the rest are
  -- listed so the constraint does not have to change under a feature that is
  -- already shipping. No foreign key on source_id — the tables it will point
  -- at do not exist yet, and a polymorphic FK cannot be declared anyway.
  source_type     text not null default 'manual'
                    check (source_type in ('manual', 'supervision', 'competency', 'complaint')),
  source_id       uuid,
  created_by      uuid references public.users (id) on delete set null,
  completed_at    timestamptz,
  completed_by    uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- The carer file's query: everything outstanding for one person, soonest
-- first. Completed actions stay — they are the evidence that it was done.
create index record_actions_person_idx
  on public.record_actions (user_id, completed_at, due_date);
-- An organisation-wide "what is outstanding" view, which the dashboard will
-- want long before anyone asks for it.
create index record_actions_org_idx
  on public.record_actions (organisation_id, completed_at, due_date);

create trigger record_actions_set_updated_at
  before update on public.record_actions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Grants (changelog 45329: a new table grants its own, or it is invisible to
-- supabase-js and PostgREST — including after a db reset or on a preview
-- branch). RLS below gates the rows; this is the outer gate.
-- ============================================================================
grant select, insert, update, delete on public.record_actions to service_role;
grant select, insert, update, delete on public.record_actions to authenticated;
-- nothing to anon.

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.record_actions enable row level security;

create policy record_actions_platform_admin on public.record_actions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy record_actions_org_admin on public.record_actions for all to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
  )
  with check (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
  );

-- A carer sees what is outstanding for them, and nothing about anyone else.
-- Read only: an action is agreed with a manager, so marking one done is the
-- manager's call until there is a deliberate design for the carer doing it.
create policy record_actions_own_read on public.record_actions for select to authenticated
  using (user_id = (select auth.uid()));
