-- ============================================================================
-- Companies connect MyRoster themselves (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026)
-- ============================================================================
-- A manager issues, replaces and revokes the company's MyRoster key from
-- Settings, and sees how the connection is doing. Until now one key per
-- company lived on organisations.integration_key_hash and only a platform
-- admin could issue it.
--
-- integration_keys        one row per key a company has issued. system says
--                         what it's for: 'myroster', or 'other' for any other
--                         system built against the published API (label
--                         names it). At most one live MyRoster key per
--                         company. Only the sha256 of a key is kept; hint is
--                         its last four characters, so a manager can tell
--                         which key a system holds.
-- integration_sync_runs   each time MyRoster sends its carers in: how many,
--                         what happened to them, and the rows that couldn't
--                         be matched, for the connection's status panel.
--
-- The live key is copied across, so the company already connected keeps
-- working. The code deployed before this still reads the organisations
-- column, which is left in place (and cleared when a key is revoked or
-- replaced here) until it is dropped in a later release.
--
-- Both tables are read and written by the service role, after the app has
-- checked the manager (requireRole) or the key. Sync runs are also readable
-- by the company's console users; key hashes by nobody but the service role.

create table public.integration_keys (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  system          text not null check (system in ('myroster', 'other')),
  label           text not null,
  key_hash        text not null unique,
  hint            text,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid references public.users (id) on delete set null
);
create unique index integration_keys_one_myroster
  on public.integration_keys (organisation_id) where system = 'myroster' and revoked_at is null;
create index integration_keys_org_idx on public.integration_keys (organisation_id);

create table public.integration_sync_runs (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  key_id          uuid references public.integration_keys (id) on delete set null,
  total           integer not null default 0,
  counts          jsonb not null default '{}',
  problems        jsonb not null default '[]',
  created_at      timestamptz not null default now()
);
create index integration_sync_runs_org_idx on public.integration_sync_runs (organisation_id, created_at desc);

-- The company already connected keeps its key.
insert into public.integration_keys (organisation_id, system, label, key_hash, created_at, last_used_at)
select id, 'myroster', 'MyRoster', integration_key_hash,
       coalesce(integration_key_created_at, now()), integration_key_last_used_at
from public.organisations
where integration_key_hash is not null
on conflict (key_hash) do nothing;

alter table public.integration_keys enable row level security;
alter table public.integration_sync_runs enable row level security;

create policy integration_sync_runs_platform_admin on public.integration_sync_runs for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy integration_sync_runs_console_read on public.integration_sync_runs for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('platform.portal_api')));

-- Grants (AGENTS.md): revoked explicitly, since this project still grants
-- new tables to anon and authenticated.
revoke all on public.integration_keys from anon, authenticated;
revoke all on public.integration_sync_runs from anon, authenticated;
grant select on public.integration_sync_runs to authenticated;
grant select, insert, update, delete on public.integration_keys to service_role;
grant select, insert, update, delete on public.integration_sync_runs to service_role;
