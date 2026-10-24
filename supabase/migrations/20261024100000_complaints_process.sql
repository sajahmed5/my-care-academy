-- ============================================================================
-- The complaint process: seven steps, configurable stages, one record.
-- ============================================================================
-- /org/incidents (20261023230000) is a register: what happened, who was named,
-- what came of it. It is the right shape for an accident or a near miss and
-- the wrong shape for a complaint, which is not an entry in a book but a
-- process with a clock on it — acknowledged in three working days, responded
-- to in twenty-eight, each thing raised answered separately, and nothing
-- closed until the work is finished. Regulation 16 asks for that process; the
-- register cannot hold it. So the register stays as it is, and a complaint
-- gets its own record here.
--
-- Four tables:
--
--   complaint_stages         the process itself, per organisation. Which
--                            stages exist, what each one opens, and which
--                            kinds of record it applies to. Configurable
--                            because every provider's process differs in
--                            its paperwork and in none of its obligations.
--   complaints               the record: who raised it, what about, when it
--                            reached us, when the response is due, and how
--                            it ended.
--   complaint_people         the staff named in it. Separate from the record
--                            because a complaint rarely concerns one person,
--                            and "named in it" is not "reported it".
--   complaint_stage_entries  one row per (complaint, stage): done, not
--                            needed, or still open, plus the answers to that
--                            stage's form.
--   complaint_documents      files uploaded against a stage.
--
-- The seven steps are NOT in the schema. A step is a grouping of the stages a
-- company has configured — Concern raised, Triage, Acknowledge, Investigate,
-- Findings, Outcome, Follow-up and close — derived in lib/complaints/steps.ts
-- from each stage's kind. Putting the step in a column would mean a company
-- that renames a stage could move it into the wrong part of the process, and
-- the step a stage belongs to is not a preference.
--
-- Actions agreed on a complaint are not a table here: they are record_actions
-- rows with source_type 'complaint' (20261023200000 left the constraint open
-- for exactly this). A complaint's actions then appear in the owner's own
-- list of what is outstanding, which is the only place anyone looks.
-- ============================================================================

-- ============================================================================
-- The process, per organisation.
-- ============================================================================
create table public.complaint_stages (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),
  -- What the stage opens. 'document' is the plain upload box and the fallback:
  -- a stage whose kind is unknown must still be usable, not blank.
  kind            text not null default 'document'
                    check (kind in (
                      'document', 'complaint_form', 'acknowledgement',
                      'meeting_minutes', 'action_plan', 'outcome_letter',
                      'duty_of_candour', 'monitoring_review'
                    )),
  -- Which kinds of record this stage is part of. A complaint ends in a
  -- written response; an issue ends in an action plan and a monitoring
  -- review. Empty means every kind.
  applies_to      text[] not null default array['complaint', 'safeguarding', 'issue'],
  sort_order      integer not null default 0,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index complaint_stages_org_idx
  on public.complaint_stages (organisation_id, sort_order);

create trigger complaint_stages_set_updated_at
  before update on public.complaint_stages
  for each row execute function public.set_updated_at();

-- ============================================================================
-- The record.
-- ============================================================================
create table public.complaints (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- COM-20261024-001. Shown to whoever raised it, so it has to be quotable
  -- over the phone and stable for the life of the record.
  reference       text not null,
  kind            text not null default 'complaint'
                    check (kind in ('complaint', 'safeguarding', 'issue')),
  status          text not null default 'open'
                    check (status in ('open', 'closed', 'withdrawn', 'cancelled')),
  -- Who raised it, and what they are to the service. Free text for the name:
  -- the people who complain are relatives and social workers, not users of
  -- this system, and a dropdown of nobody is worse than a box.
  raised_by_name  text,
  raised_by_role  text check (raised_by_role is null or raised_by_role in
                    ('client', 'family', 'social_worker', 'staff', 'other')),
  -- The person receiving care that it was about. This platform holds the
  -- provider's STAFF, not their clients, so this is a name and nothing more.
  about_name      text,
  category        text,
  occurred_on     date,
  -- When it reached us. The acknowledgement and response clocks both run from
  -- here, not from when it happened, which is what the regulation says.
  reported_on     date not null default current_date,
  -- Twenty-eight days from reported_on unless the office changes it.
  complete_by     date,
  description     text not null check (length(btrim(description)) > 0),
  desired_outcome text,
  -- How it ended, written at close.
  outcome_summary text,
  lessons_learned text,
  closed_on       date,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, reference)
);

create index complaints_org_idx
  on public.complaints (organisation_id, reported_on desc);
create index complaints_status_idx
  on public.complaints (organisation_id, status);

create trigger complaints_set_updated_at
  before update on public.complaints
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Who is named in it.
-- ============================================================================
create table public.complaint_people (
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  involvement  text not null default 'involved'
                 check (involvement in ('involved', 'witness', 'reported')),
  created_at   timestamptz not null default now(),
  primary key (complaint_id, user_id)
);

create index complaint_people_user_idx on public.complaint_people (user_id);

-- ============================================================================
-- Where each stage has got to, and what was answered on it.
-- ============================================================================
create table public.complaint_stage_entries (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  stage_id     uuid not null references public.complaint_stages (id) on delete cascade,
  -- 'na' is "we decided this one does not apply", which is a decision someone
  -- made and can be asked about. 'pending' is nobody's decision.
  status       text not null default 'pending'
                 check (status in ('pending', 'done', 'na')),
  -- Why it was marked not needed, and any note on a document stage.
  notes        text,
  -- The stage form's answers, keyed by question id. Schemas live in code
  -- (lib/complaints/forms.ts): a question is a thing the app renders and
  -- validates, so a new one is a deploy, not a row.
  form_answers jsonb not null default '{}'::jsonb,
  updated_by   uuid references public.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (complaint_id, stage_id)
);

create index complaint_stage_entries_complaint_idx
  on public.complaint_stage_entries (complaint_id);

create trigger complaint_stage_entries_set_updated_at
  before update on public.complaint_stage_entries
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Files held against a stage.
-- ============================================================================
create table public.complaint_documents (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  stage_id     uuid references public.complaint_stages (id) on delete set null,
  file_path    text not null,
  file_name    text not null,
  file_size    integer,
  mime         text,
  uploaded_by  uuid references public.users (id) on delete set null,
  uploaded_at  timestamptz not null default now()
);

create index complaint_documents_complaint_idx
  on public.complaint_documents (complaint_id);

-- ============================================================================
-- Grants (changelog 45329). RLS gates the rows; this is the outer gate.
-- ============================================================================
grant select, insert, update, delete on public.complaint_stages to service_role;
grant select, insert, update, delete on public.complaint_stages to authenticated;
grant select, insert, update, delete on public.complaints to service_role;
grant select, insert, update, delete on public.complaints to authenticated;
grant select, insert, update, delete on public.complaint_people to service_role;
grant select, insert, update, delete on public.complaint_people to authenticated;
grant select, insert, update, delete on public.complaint_stage_entries to service_role;
grant select, insert, update, delete on public.complaint_stage_entries to authenticated;
grant select, insert, update, delete on public.complaint_documents to service_role;
grant select, insert, update, delete on public.complaint_documents to authenticated;
-- nothing to anon.

-- ============================================================================
-- RLS — org-scoped and gated on complaints.register, as the register is.
-- ============================================================================
alter table public.complaint_stages enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_people enable row level security;
alter table public.complaint_stage_entries enable row level security;
alter table public.complaint_documents enable row level security;

create policy complaint_stages_platform_admin on public.complaint_stages for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy complaint_stages_org_admin on public.complaint_stages for all to authenticated
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

create policy complaints_platform_admin on public.complaints for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy complaints_org_admin on public.complaints for all to authenticated
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

-- The child tables carry no organisation_id: a row here is reachable only
-- through a complaint, whose own policy applies to the subquery. A learner
-- sees no complaints, so `exists` is false for them on every row.
create policy complaint_people_platform_admin on public.complaint_people for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy complaint_people_org_admin on public.complaint_people for all to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id))
  with check (exists (select 1 from public.complaints c where c.id = complaint_id));

create policy complaint_entries_platform_admin on public.complaint_stage_entries for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy complaint_entries_org_admin on public.complaint_stage_entries for all to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id))
  with check (exists (select 1 from public.complaints c where c.id = complaint_id));

create policy complaint_documents_platform_admin on public.complaint_documents for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy complaint_documents_org_admin on public.complaint_documents for all to authenticated
  using (exists (select 1 from public.complaints c where c.id = complaint_id))
  with check (exists (select 1 from public.complaints c where c.id = complaint_id));

-- ============================================================================
-- Private bucket for the files held against a stage. Service-role upload and
-- signed URLs only, as the observation evidence and candidate documents are.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('complaint-documents', 'complaint-documents', false)
on conflict (id) do nothing;
