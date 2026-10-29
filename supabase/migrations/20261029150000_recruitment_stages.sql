-- ============================================================================
-- Recruitment in four stages (RECRUITMENT.md, release 1, 29 Oct 2026)
-- ============================================================================
-- The tracker was a column per document. It becomes four stages of steps —
-- application, interview, checks, sign-up — each step with a state. A step's
-- row in candidate_documents now says where it stands, with or without a
-- file: until a step's online form is built, the office uploads the paper
-- copy and confirms it, as before.
--
--   no row                          not started
--   not_required                    not needed (with the reason)
--   review_status 'submitted'       waiting on the office (the candidate sent it)
--   review_status 'sent_back'       sent back, with review_note
--   review_status 'confirmed'       done
--
-- Every row held today is a file the office uploaded, so it is confirmed.
-- Three old checklist keys become their new steps; the rest keep their key.

alter table public.candidate_documents
  drop constraint if exists candidate_documents_file_or_waiver;
alter table public.candidate_documents
  add constraint candidate_documents_waiver_has_no_file check (not (not_required and file_path is not null)),
  add column review_status text not null default 'confirmed'
    check (review_status in ('submitted', 'sent_back', 'confirmed')),
  add column review_note text,
  add column uploaded_by_candidate boolean not null default false,
  add column reviewed_by uuid references public.users (id) on delete set null,
  add column reviewed_at timestamptz,
  add column updated_at timestamptz not null default now();

create trigger candidate_documents_set_updated_at
  before update on public.candidate_documents
  for each row execute function public.set_updated_at();

update public.candidate_documents set doc_type = 'proof_address_1' where doc_type = 'proof_address';
update public.candidate_documents set doc_type = 'share_code' where doc_type = 'right_to_work';
update public.candidate_documents set doc_type = 'reference_1' where doc_type = 'references';

-- The candidate: the role they applied for, where they heard about it, and
-- whether their DBS shows a conviction (which adds the risk assessment step).
alter table public.candidates
  add column role_applied text,
  add column source text,
  add column dbs_conviction boolean not null default false,
  add column hired_at timestamptz,
  add column rejected_at timestamptz;

-- ============================================================================
-- Each company's recruitment settings. One row per organisation, made on
-- first save; until then the defaults below apply.
-- ============================================================================
create table public.recruitment_settings (
  organisation_id  uuid primary key references public.organisations (id) on delete cascade,
  -- Each stage stays locked until the one before it is done.
  stages_in_order  boolean not null default true,
  -- Optional steps the company doesn't use (refund of training, shadowing…).
  steps_off        text[] not null default '{}',
  -- A third reference for everyone, shown as its own column.
  third_reference  boolean not null default false,
  -- Not hired until the DBS is back. Off: a start before it, at the
  -- company's choice.
  dbs_before_start boolean not null default true,
  updated_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger recruitment_settings_set_updated_at
  before update on public.recruitment_settings
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.recruitment_settings to service_role;
revoke all on public.recruitment_settings from anon;
revoke all on public.recruitment_settings from authenticated;
grant select, insert, update on public.recruitment_settings to authenticated;

alter table public.recruitment_settings enable row level security;
create policy recruitment_settings_platform_admin on public.recruitment_settings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
-- Every console user reads them (they decide what the tracker shows); the
-- app keeps changing them to managers.
create policy recruitment_settings_console on public.recruitment_settings for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
