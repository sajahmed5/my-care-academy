-- Recruitment release 6 (RECRUITMENT.md): documents signed online, the
-- shadowing record, and the welcome pack.

-- A company's own wording for each part of the documents to sign. Every save
-- is a new version; a signed copy keeps the exact text it was signed on.
create table public.recruitment_documents (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  doc_key         text not null check (doc_key in ('role_acceptance', 'contract', 'refund_training')),
  part_id         text not null,
  version         integer not null check (version > 0),
  body            text not null,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organisation_id, doc_key, part_id, version)
);

-- One candidate's copy of one document: the wording frozen when it was sent,
-- each part's signature, and the company's countersignature.
create table public.candidate_signings (
  id               uuid primary key default gen_random_uuid(),
  candidate_id     uuid not null references public.candidates (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  doc_key          text not null check (doc_key in ('role_acceptance', 'contract', 'refund_training')),
  status           text not null default 'sent' check (status in ('sent', 'signed', 'countersigned')),
  snapshot         jsonb not null,
  state            jsonb not null default '{}',
  company          jsonb,
  sent_at          timestamptz not null default now(),
  sent_by          uuid references public.users (id) on delete set null,
  signed_at        timestamptz,
  countersigned_at timestamptz,
  countersigned_by uuid references public.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (candidate_id, doc_key)
);
create trigger candidate_signings_set_updated_at
  before update on public.candidate_signings
  for each row execute function public.set_updated_at();

-- The mentor's shadowing feedback, recorded by the office.
create table public.candidate_shadowing (
  candidate_id    uuid primary key references public.candidates (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft', 'complete')),
  answers         jsonb not null default '{}',
  completed_at    timestamptz,
  completed_by    uuid references public.users (id) on delete set null,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger candidate_shadowing_set_updated_at
  before update on public.candidate_shadowing
  for each row execute function public.set_updated_at();

-- The welcome pack: the company's guide and who to ring, emailed on hire.
alter table public.recruitment_settings
  add column welcome_guide    text,
  add column welcome_contacts jsonb not null default '[]',
  add column welcome_on_hire  boolean not null default true;

-- Grants (AGENTS.md): writes go through the service role after the app's
-- checks; console users read their own company's rows.
grant select, insert, update, delete on public.recruitment_documents to service_role;
grant select, insert, update, delete on public.candidate_signings to service_role;
grant select, insert, update, delete on public.candidate_shadowing to service_role;
revoke all on public.recruitment_documents from anon, authenticated;
revoke all on public.candidate_signings from anon, authenticated;
revoke all on public.candidate_shadowing from anon, authenticated;
grant select on public.recruitment_documents to authenticated;
grant select on public.candidate_signings to authenticated;
grant select on public.candidate_shadowing to authenticated;

alter table public.recruitment_documents enable row level security;
alter table public.candidate_signings enable row level security;
alter table public.candidate_shadowing enable row level security;

create policy recruitment_documents_platform_admin on public.recruitment_documents for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy recruitment_documents_console_read on public.recruitment_documents for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
create policy candidate_signings_platform_admin on public.candidate_signings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_signings_console_read on public.candidate_signings for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
create policy candidate_shadowing_platform_admin on public.candidate_shadowing for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_shadowing_console_read on public.candidate_shadowing for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));

-- The start date the office gives when it sends the documents to sign: it
-- goes into the contract and the welcome pack.
alter table public.candidates add column start_date date;
