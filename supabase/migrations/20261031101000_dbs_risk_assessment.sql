-- ============================================================================
-- Recruitment: the DBS risk assessment online (RECRUITMENT.md, HR-PACK.md)
-- ============================================================================
-- Until now the DBS risk assessment step was an upload or held on paper. This
-- holds it as a form, filled in by the office, one per candidate. Additive:
-- the live code never reads it.

create table public.candidate_dbs_assessments (
  candidate_id    uuid primary key references public.candidates (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft', 'complete')),
  answers         jsonb not null default '{}'::jsonb,
  decision        text check (decision in ('employ', 'employ_with_safeguards', 'do_not_employ')),
  completed_at    timestamptz,
  completed_by    uuid references public.users (id) on delete set null,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index candidate_dbs_assessments_org_idx on public.candidate_dbs_assessments (organisation_id);
create trigger candidate_dbs_assessments_set_updated_at
  before update on public.candidate_dbs_assessments
  for each row execute function public.set_updated_at();

-- Writes go through the service role in the recruitment actions, which check
-- the organisation and the HR pack themselves; the console reads under RLS.
revoke all on public.candidate_dbs_assessments from anon, authenticated;
grant select, insert, update, delete on public.candidate_dbs_assessments to service_role;
grant select on public.candidate_dbs_assessments to authenticated;

alter table public.candidate_dbs_assessments enable row level security;
create policy candidate_dbs_assessments_platform_admin on public.candidate_dbs_assessments for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_dbs_assessments_console_read on public.candidate_dbs_assessments for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
