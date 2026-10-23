-- ============================================================================
-- Complaints, accidents and safeguarding concerns.
-- ============================================================================
-- Step 5 of CARER-FILE.md, and the feature that has been tickable on the
-- Packages screen since 20261023120000 with no pages behind it. It is built or
-- it comes off the matrix; this is built.
--
-- Three tables, because three different things are being recorded:
--
--   incidents          what happened, and what came of it.
--   incident_people    who was involved. A complaint rarely concerns exactly
--                      one carer, and "the carer named in it" is a different
--                      fact from "the carer who reported it".
--   incident_training  the training a manager decided to assign because of it,
--                      with their reason.
--
-- That third table is the point of the whole step. The platform can see that a
-- medication complaint and the Medication Awareness course are related; what
-- it must not do is assign the course automatically. A complaint that turns
-- out to be unfounded would already have produced a training record, and
-- "training assigned automatically on receipt of complaint" reads badly in
-- front of a tribunal, where "manager reviewed the complaint and assigned
-- refresher training on 3 November, because X" reads correctly. So the
-- platform suggests, a human accepts, and this table is the evidence of who
-- decided and why.
--
-- No learner policies, as with supervisions and spot checks: a complaint
-- naming a carer is the employer's record. The training that follows appears
-- in their training list like any other, which is the part they must act on.
-- ============================================================================

create table public.incidents (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null
                    check (kind in ('complaint', 'accident', 'near_miss', 'safeguarding')),
  -- What it was about. Free text with the list in lib/incidents.ts, as the
  -- competency areas are: this is what drives the training suggestion, and the
  -- mapping will be tuned long before the schema should move.
  category        text not null check (length(btrim(category)) > 0),
  occurred_on     date not null,
  summary         text not null check (length(btrim(summary)) > 0),
  -- What came of it. Empty until it is closed, which is the honest state.
  outcome         text,
  status          text not null default 'open'
                    check (status in ('open', 'investigating', 'closed')),
  closed_on       date,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index incidents_org_idx on public.incidents (organisation_id, occurred_on desc);
create index incidents_status_idx on public.incidents (organisation_id, status);

create table public.incident_people (
  incident_id uuid not null references public.incidents (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  involvement text not null default 'involved'
                check (involvement in ('involved', 'witness', 'reported')),
  created_at  timestamptz not null default now(),
  primary key (incident_id, user_id)
);

create index incident_people_user_idx on public.incident_people (user_id);

create table public.incident_training (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  course_id   uuid not null references public.courses (id) on delete cascade,
  -- Why the manager decided this. Not optional in spirit — the UI asks for it
  -- — but nullable in the column, because a blank reason is better than a
  -- fabricated one and far better than a refused save that loses the decision.
  reason      text,
  assigned_by uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (incident_id, user_id, course_id)
);

create index incident_training_user_idx on public.incident_training (user_id);

create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Grants (changelog 45329). RLS gates the rows; this is the outer gate.
-- ============================================================================
grant select, insert, update, delete on public.incidents to service_role;
grant select, insert, update, delete on public.incidents to authenticated;
grant select, insert, update, delete on public.incident_people to service_role;
grant select, insert, update, delete on public.incident_people to authenticated;
grant select, insert, update, delete on public.incident_training to service_role;
grant select, insert, update, delete on public.incident_training to authenticated;
-- nothing to anon.

-- ============================================================================
-- RLS — org-scoped and gated on complaints.register.
-- ============================================================================
alter table public.incidents enable row level security;
alter table public.incident_people enable row level security;
alter table public.incident_training enable row level security;

create policy incidents_platform_admin on public.incidents for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy incidents_org_admin on public.incidents for all to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('complaints.register')
  )
  with check (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('complaints.register')
  );

-- The child tables carry no organisation_id of their own: an incident is the
-- thing that belongs to an organisation, and a row here is reachable only
-- through one. The subquery is against incidents, whose own policy applies.
create policy incident_people_platform_admin on public.incident_people for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy incident_people_org_admin on public.incident_people for all to authenticated
  using (
    exists (select 1 from public.incidents i where i.id = incident_id)
  )
  with check (
    exists (select 1 from public.incidents i where i.id = incident_id)
  );

create policy incident_training_platform_admin on public.incident_training for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy incident_training_org_admin on public.incident_training for all to authenticated
  using (
    exists (select 1 from public.incidents i where i.id = incident_id)
  )
  with check (
    exists (select 1 from public.incidents i where i.id = incident_id)
  );
