-- ============================================================================
-- Service audits, part 1: editable forms, client by client, signed and
-- reviewed (SERVICE-AUDITS.md, agreed with Saj 29 Oct 2026)
-- ============================================================================
-- Additive only: the code live today keeps reading and writing audits with
-- kind, subject, answers and score, and every new column has a default.
--
-- service_audit_forms holds a company's change to one of our audits
-- (medication, care_plan, infection_control) or an audit of its own
-- (key own_…). No row means our default. Questions are
-- [{id, label, help?, type: yes_no | rating | text | photo}].
--   scope   'client' — one per client, due client by client; 'service' —
--           one for the whole service
--
-- service_audit_settings holds the score below which an audit waits for a
-- manager to review it (80% unless the company changes it).
--
-- audits gains:
--   client_id / client_name   the client it was about, picked from the
--                             client list; the name kept as it was on the day
--   title                     the audit's name on the day (a company's own
--                             audit may later be renamed or removed)
--   items                     [{id, label, type, answer, comment, photo}] — the
--                             questions as asked, with what was answered. The
--                             one audit from before this keeps `answers`.
--   auditor_*                 the auditor's signature, signed on the screen
--   review_*                  waiting / reviewed by a manager, and what they said
--
-- Photos go in the private service-audit-photos bucket, written and read as
-- the service role from console-only actions that check the audit is theirs.
--
-- Everything is gated on quality.audits (Pro and Enterprise), as today.
-- Grants per AGENTS.md, with Supabase's automatic grant revoked explicitly.

create table public.service_audit_forms (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  key             text not null check (key ~ '^[a-z0-9_]{1,60}$'),
  label           text,
  scope           text not null default 'service' check (scope in ('client', 'service')),
  questions       jsonb not null default '[]'::jsonb,
  due_every       integer not null check (due_every between 1 and 104),
  due_unit        text not null check (due_unit in ('weeks', 'months')),
  archived        boolean not null default false,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organisation_id, key)
);
create trigger service_audit_forms_set_updated_at
  before update on public.service_audit_forms
  for each row execute function public.set_updated_at();

create table public.service_audit_settings (
  organisation_id uuid primary key references public.organisations (id) on delete cascade,
  review_below    integer not null default 80 check (review_below between 0 and 100),
  updated_by      uuid references public.users (id) on delete set null,
  updated_at      timestamptz not null default now()
);
create trigger service_audit_settings_set_updated_at
  before update on public.service_audit_settings
  for each row execute function public.set_updated_at();

alter table public.audits
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists client_name text,
  add column if not exists title text,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists auditor_signature text,
  add column if not exists auditor_signed_name text,
  add column if not exists auditor_signed_at timestamptz,
  add column if not exists review_status text not null default 'not_needed'
    check (review_status in ('not_needed', 'waiting', 'reviewed')),
  add column if not exists review_below integer,
  add column if not exists reviewed_by uuid references public.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;
create index if not exists audits_client_idx on public.audits (client_id, kind, held_on desc);
create index if not exists audits_review_idx on public.audits (organisation_id, review_status);

-- ------------------------------------------------------------------ grants

grant select, insert, update, delete on public.service_audit_forms to service_role;
revoke all on public.service_audit_forms from anon;
revoke all on public.service_audit_forms from authenticated;
grant select, insert, update, delete on public.service_audit_forms to authenticated;

grant select, insert, update, delete on public.service_audit_settings to service_role;
revoke all on public.service_audit_settings from anon;
revoke all on public.service_audit_settings from authenticated;
grant select, insert, update on public.service_audit_settings to authenticated;

-- --------------------------------------------------------------------- RLS
-- Console users read them (every audit form needs its questions); the app
-- lets only a manager change them (requireRole on the Settings page and its
-- actions), as AGENTS.md has it.

alter table public.service_audit_forms enable row level security;
create policy service_audit_forms_platform_admin on public.service_audit_forms for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy service_audit_forms_console on public.service_audit_forms for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')));

alter table public.service_audit_settings enable row level security;
create policy service_audit_settings_platform_admin on public.service_audit_settings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy service_audit_settings_console on public.service_audit_settings for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')));

insert into storage.buckets (id, name, public)
values ('service-audit-photos', 'service-audit-photos', false)
on conflict (id) do nothing;
