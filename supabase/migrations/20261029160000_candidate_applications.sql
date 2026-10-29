-- ============================================================================
-- The online application form (RECRUITMENT.md, release 2a, 29 Oct 2026)
-- ============================================================================
-- Brought across from MyRoster (151_candidate_applications). A candidate
-- fills it in from a link, with no account yet: the company's apply link
-- (for job adverts) starts one, or the office sends one to a candidate it
-- added. Answers save as they go; a submit puts the Application step in front
-- of the office, as "waiting on you".
--
-- The link's token is stored only as its SHA-256. The public pages read and
-- write through the service role after checking it, so the table needs no
-- grant for anon; the office reads it under RLS.

alter table public.recruitment_settings
  add column apply_token text unique;

create table public.candidate_applications (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  candidate_id     uuid not null unique references public.candidates (id) on delete cascade,
  status           text not null default 'draft' check (status in ('draft', 'submitted')),
  answers          jsonb not null default '{}'::jsonb,
  -- { dataUrl, signedName, signedAt }
  signature        jsonb,
  -- What the office asked them to change when it sent the form back.
  office_note      text,
  token_hash       text unique,
  token_expires_at timestamptz,
  sent_at          timestamptz,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index candidate_applications_org_idx on public.candidate_applications (organisation_id);
create trigger candidate_applications_set_updated_at
  before update on public.candidate_applications
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.candidate_applications to service_role;
revoke all on public.candidate_applications from anon;
revoke all on public.candidate_applications from authenticated;
grant select on public.candidate_applications to authenticated;

alter table public.candidate_applications enable row level security;
create policy candidate_applications_platform_admin on public.candidate_applications for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_applications_console_read on public.candidate_applications for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
