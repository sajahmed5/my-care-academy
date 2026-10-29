-- ============================================================================
-- One front door for concerns (COMPLAINTS-SAFEGUARDING.md, agreed 29 Oct 2026)
-- ============================================================================
-- Everything is raised in one place as a concern, then triaged into one of
-- five types, each with its own process: complaint, safeguarding, issue,
-- accident, near miss. The record stays the `complaints` row it has always
-- been — renaming a table that live code reads is not additive — and gains:
--
--   kind 'concern'           raised, not yet triaged. The reference it was
--                            given (CON-…) is kept for life once triaged,
--                            since it may already have been quoted back.
--   kind 'accident',         two new types, each with its own stages.
--     'near_miss'
--   triaged_at, triaged_by   when it was decided what this is, and by whom.
--   client_id                the client it is about, from the client list.
--   legacy_incident_id       the incidents row it was copied from, so the
--                            copy below can be run again without doubling.
--
-- The incidents register (20261023230000) is merged in: its rows (none on
-- 29 Oct 2026) are copied here with their people and the training assigned
-- from them. The incidents tables are left as they are, readable, until the
-- code that reads them is released; the copy is idempotent so it can be run
-- again after that release to catch anything recorded in between.
--
-- Training a manager assigned because of a concern gets its own table,
-- complaint_training, as incident_training was for the register: the
-- platform suggests, a person decides, and this keeps who and why.
-- ============================================================================

alter table public.complaints drop constraint complaints_kind_check;
alter table public.complaints add constraint complaints_kind_check
  check (kind in ('concern', 'complaint', 'safeguarding', 'issue', 'accident', 'near_miss'));

alter table public.complaints
  add column if not exists triaged_at timestamptz,
  add column if not exists triaged_by uuid references public.users (id) on delete set null,
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists legacy_incident_id uuid unique;

create index if not exists complaints_client_idx on public.complaints (client_id) where client_id is not null;
create index if not exists complaints_kind_idx on public.complaints (organisation_id, kind);

-- Records made before the front door were triaged when they were recorded.
update public.complaints set triaged_at = created_at where triaged_at is null and kind <> 'concern';

-- The stage kinds an accident and a near miss open.
alter table public.complaint_stages drop constraint complaint_stages_kind_check;
alter table public.complaint_stages add constraint complaint_stages_kind_check
  check (kind in (
    'document', 'complaint_form', 'acknowledgement', 'meeting_minutes',
    'action_plan', 'outcome_letter', 'duty_of_candour', 'monitoring_review',
    'accident_report', 'near_miss_report', 'incident_actions'
  ));

-- Organisations that already have the process get the new stages, after
-- their own. A company that has none is given the full set on first use.
insert into public.complaint_stages (organisation_id, name, kind, applies_to, sort_order)
select o.organisation_id, s.name, s.kind, s.applies_to, o.top + s.n * 10
from (
  select organisation_id, max(sort_order) as top
  from public.complaint_stages group by organisation_id
) o
cross join (values
  (1, 'Accident Report', 'accident_report', array['accident']),
  (2, 'Near Miss Report', 'near_miss_report', array['near_miss']),
  (3, 'Actions and Training', 'incident_actions', array['accident', 'near_miss'])
) as s (n, name, kind, applies_to)
where not exists (
  select 1 from public.complaint_stages x
  where x.organisation_id = o.organisation_id and x.kind = s.kind
);

-- "Other" is somewhere to put files on any record.
update public.complaint_stages
set applies_to = applies_to || array['accident', 'near_miss']
where kind = 'document' and lower(btrim(name)) = 'other' and not ('accident' = any (applies_to));

-- ============================================================================
-- Training assigned because of a concern.
-- ============================================================================
create table public.complaint_training (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  reason       text,
  assigned_by  uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (complaint_id, user_id, course_id)
);
create index complaint_training_user_idx on public.complaint_training (user_id);

grant select, insert, update, delete on public.complaint_training to service_role;
revoke all on public.complaint_training from anon;
revoke all on public.complaint_training from authenticated;
grant select, insert, delete on public.complaint_training to authenticated;

alter table public.complaint_training enable row level security;
create policy complaint_training_platform_admin on public.complaint_training for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
-- Reachable only through a complaint, whose own policy applies to the subquery.
create policy complaint_training_console on public.complaint_training for all to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id))
  with check (exists (select 1 from public.complaints c where c.id = complaint_id));

-- ============================================================================
-- The incidents register, copied in. Idempotent: run again to catch more.
-- ============================================================================
insert into public.complaints (
  organisation_id, reference, kind, status, category, occurred_on, reported_on,
  description, outcome_summary, closed_on, created_by, created_at, triaged_at, legacy_incident_id
)
select
  i.organisation_id,
  -- Numbered over every incident, not just the ones still to copy, so a
  -- second run gives an incident the same reference the first would have.
  'INC-' || to_char(i.occurred_on, 'YYYYMMDD') || '-' || lpad(i.n::text, 3, '0'),
  i.kind,
  case when i.status = 'closed' then 'closed' else 'open' end,
  i.category,
  i.occurred_on,
  i.occurred_on,
  i.summary,
  i.outcome,
  i.closed_on,
  i.created_by,
  i.created_at,
  i.created_at,
  i.id
from (
  select *, row_number() over (partition by organisation_id, occurred_on order by created_at, id) as n
  from public.incidents
) i
where not exists (select 1 from public.complaints c where c.legacy_incident_id = i.id)
on conflict do nothing;

insert into public.complaint_people (complaint_id, user_id, involvement, created_at)
select c.id, p.user_id, p.involvement, p.created_at
from public.incident_people p
join public.complaints c on c.legacy_incident_id = p.incident_id
on conflict do nothing;

insert into public.complaint_training (complaint_id, user_id, course_id, reason, assigned_by, created_at)
select c.id, t.user_id, t.course_id, t.reason, t.assigned_by, t.created_at
from public.incident_training t
join public.complaints c on c.legacy_incident_id = t.incident_id
on conflict do nothing;
