-- ============================================================================
-- Compliments, and the public "raise a concern" link
-- (COMPLAINTS-SAFEGUARDING.md, agreed 29 Oct 2026)
-- ============================================================================
--   compliments         a compliment received: from whom, about which client,
--                       what was said.
--   compliment_people   the staff it was about. It shows on their file, and
--                       Staff Audits can read it into an appraisal.
--   concern_links       one shareable link per organisation, like a feedback
--                       survey link: a long random token that is the whole
--                       address, and whether it is open. A family or client
--                       raises a concern there with no account; it arrives as
--                       a concern waiting for triage.
--
-- complaints.raised_via says how a concern reached us ('office' or 'link'),
-- and raised_by_contact keeps how to reach whoever raised it online, since
-- they are not a user of this system.
--
-- Nothing for anon: the public page reads the link and writes the concern as
-- the service role after checking the token, as /survey/<token> does.
-- ============================================================================

alter table public.complaints
  add column if not exists raised_via text not null default 'office'
    check (raised_via in ('office', 'link')),
  add column if not exists raised_by_contact text;

create table public.compliments (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  received_on     date not null default current_date,
  from_name       text,
  from_role       text check (from_role is null or from_role in ('client', 'family', 'social_worker', 'staff', 'other')),
  client_id       uuid references public.clients (id) on delete set null,
  what_was_said   text not null check (length(btrim(what_was_said)) > 0),
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index compliments_org_idx on public.compliments (organisation_id, received_on desc);
create index compliments_client_idx on public.compliments (client_id) where client_id is not null;

create table public.compliment_people (
  compliment_id uuid not null references public.compliments (id) on delete cascade,
  user_id       uuid not null references public.users (id) on delete cascade,
  primary key (compliment_id, user_id)
);
create index compliment_people_user_idx on public.compliment_people (user_id);

create table public.concern_links (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null unique references public.organisations (id) on delete cascade,
  token           text not null unique check (length(token) >= 24),
  is_open         boolean not null default true,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- Grants (AGENTS.md): revoked explicitly, since this project still grants
-- anon and authenticated by default; then the narrow set.
grant select, insert, update, delete on public.compliments to service_role;
grant select, insert, update, delete on public.compliment_people to service_role;
grant select, insert, update, delete on public.concern_links to service_role;
revoke all on public.compliments from anon;
revoke all on public.compliment_people from anon;
revoke all on public.concern_links from anon;
revoke all on public.compliments from authenticated;
revoke all on public.compliment_people from authenticated;
revoke all on public.concern_links from authenticated;
grant select, insert, update, delete on public.compliments to authenticated;
grant select, insert, delete on public.compliment_people to authenticated;
grant select, insert, update on public.concern_links to authenticated;

alter table public.compliments enable row level security;
alter table public.compliment_people enable row level security;
alter table public.concern_links enable row level security;

create policy compliments_platform_admin on public.compliments for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy compliments_console on public.compliments for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('complaints.register')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('complaints.register')));

create policy compliment_people_platform_admin on public.compliment_people for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
-- Reachable only through a compliment, whose own policy applies to the subquery.
create policy compliment_people_console on public.compliment_people for all to authenticated
  using (exists (select 1 from public.compliments c where c.id = compliment_id))
  with check (exists (select 1 from public.compliments c where c.id = compliment_id));

create policy concern_links_platform_admin on public.concern_links for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy concern_links_console on public.concern_links for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('complaints.register')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('complaints.register')));
