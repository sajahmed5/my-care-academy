-- ============================================================================
-- Interviews and references (RECRUITMENT.md, release 4, 29 Oct 2026)
-- ============================================================================
-- Brought across from MyRoster (152_candidate_references, and the interview
-- kind of 153_candidate_forms). The interview record is the office's; the
-- candidate never sees it. A referee answers from an emailed link with no
-- account: the token is stored only as its hash, and the public page writes
-- through the service role after checking it.

create table public.candidate_interviews (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  candidate_id    uuid not null unique references public.candidates (id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft', 'complete')),
  answers         jsonb not null default '{}'::jsonb,
  overall_score   integer check (overall_score between 1 and 5),
  outcome         text,
  completed_at    timestamptz,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index candidate_interviews_org_idx on public.candidate_interviews (organisation_id);
create trigger candidate_interviews_set_updated_at
  before update on public.candidate_interviews
  for each row execute function public.set_updated_at();

create table public.candidate_references (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations (id) on delete cascade,
  candidate_id        uuid not null references public.candidates (id) on delete cascade,
  -- Reference 1 / 2 / 3: which step it answers.
  position            integer not null check (position between 1 and 3),
  referee_type        text not null default 'Character reference',
  referee_name        text not null,
  referee_position    text,
  organisation        text,
  email               text,
  phone               text,
  relationship        text,
  candidate_job_title text,
  employed_from       text,
  employed_to         text,
  status              text not null default 'not_requested'
                        check (status in ('not_requested', 'requested', 'received', 'unusable')),
  requested_at        timestamptz,
  requested_by        uuid references public.users (id) on delete set null,
  reminder_count      integer not null default 0,
  last_reminded_at    timestamptz,
  opened_at           timestamptz,
  received_at         timestamptz,
  answers             jsonb,
  token_hash          text unique,
  token_expires_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (candidate_id, position)
);
create index candidate_references_org_idx on public.candidate_references (organisation_id);
create index candidate_references_chase_idx on public.candidate_references (status, requested_at) where status = 'requested';
create trigger candidate_references_set_updated_at
  before update on public.candidate_references
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.candidate_interviews to service_role;
grant select, insert, update, delete on public.candidate_references to service_role;
revoke all on public.candidate_interviews from anon;
revoke all on public.candidate_references from anon;
revoke all on public.candidate_interviews from authenticated;
revoke all on public.candidate_references from authenticated;
grant select on public.candidate_interviews to authenticated;
grant select on public.candidate_references to authenticated;

alter table public.candidate_interviews enable row level security;
alter table public.candidate_references enable row level security;
create policy candidate_interviews_platform_admin on public.candidate_interviews for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_interviews_console_read on public.candidate_interviews for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
create policy candidate_references_platform_admin on public.candidate_references for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_references_console_read on public.candidate_references for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
