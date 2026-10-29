-- ============================================================================
-- The client list (PACKAGES.md, Clients, agreed with Saj 29 Oct 2026)
-- ============================================================================
-- A simple list of the people the service cares for — not a care-planning
-- system — so spot checks, client QAs, service audits and concerns can all
-- link to the same person. Uploaded from a spreadsheet or added one by one.
-- Growth and up: it arrives with the first feature that uses it.
--
-- Regions are the company's own words, kept as text: the page offers the
-- ones already used. The funder says who pays: a council (named in
-- funder_name), the person themselves, the NHS (continuing healthcare), or
-- something else.

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('clients.list', 'people', 'Client list', false, 30)
on conflict (key) do nothing;

insert into public.tier_features (tier_key, feature_key) values
  ('core_forms', 'clients.list'),
  ('core_recruitment', 'clients.list'),
  ('full', 'clients.list')
on conflict do nothing;

create table public.clients (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations (id) on delete cascade,
  full_name          text not null check (length(btrim(full_name)) > 0),
  date_of_birth      date,
  region             text,
  postcode           text,
  funder_type        text not null default 'council'
                       check (funder_type in ('council', 'self', 'nhs', 'other')),
  funder_name        text,
  medication_support boolean not null default false,
  start_date         date,
  status             text not null default 'active' check (status in ('active', 'ended')),
  -- The id another system knows them by (MyRoster, later), for a sync to match on.
  external_ref       text,
  created_by         uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index clients_org_idx on public.clients (organisation_id, status, full_name);
-- One row per person: the same name and date of birth is the same client, so
-- a second upload updates rather than repeats them.
create unique index clients_person_key on public.clients
  (organisation_id, lower(btrim(full_name)), coalesce(date_of_birth, '1900-01-01'::date));
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- Grants (AGENTS.md). Nothing for anon, revoked explicitly: Supabase still
-- grants it by default on this project.
grant select, insert, update, delete on public.clients to service_role;
revoke all on public.clients from anon;
revoke all on public.clients from authenticated;
grant select, insert, update, delete on public.clients to authenticated;

alter table public.clients enable row level security;
create policy clients_platform_admin on public.clients for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy clients_console on public.clients for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('clients.list')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('clients.list')));
