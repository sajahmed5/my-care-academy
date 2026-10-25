-- ============================================================================
-- An organisation's own copy of a policy, adopted from a template
-- ============================================================================
-- ROADMAP §1: the library's policies are templates — {{organisation}} where
-- the provider's name goes, and bracketed guidance for them to complete. So the
-- model is not "read our policy and accept it": an organisation adopts a
-- template, completes it, and publishes it, and its staff accept THEIR
-- version. Until now staff were shown, and accepted, the template itself,
-- guidance notes and all.
--
-- organisation_policies holds the copy:
--   blocks            their text, starting from the template with their name in
--   status            draft while it is being written; published once staff
--                     may read it
--   version           0 until first published, then 1, 2, … — each publish is
--                     a new version that staff accept afresh
--   template_version  the template version it was adopted from, so a revised
--                     template can be pointed out
--
-- Console users write their organisation's copies; staff read the published
-- ones. Grants per AGENTS.md: the narrowest set the UI needs, nothing to anon
-- (Supabase's automatic grant is revoked explicitly, see 20261024150000).
--
-- policy_acknowledgements gains organisation_policy_id: an acceptance of an
-- organisation's copy names the copy, and its version is the copy's version.
-- Old acceptances of the template keep a null here and stay as history. The
-- uniqueness now includes the copy, so accepting the template's version 1 and
-- the copy's version 1 are two different facts.

create table public.organisation_policies (
  id                uuid primary key default gen_random_uuid(),
  organisation_id   uuid not null references public.organisations (id) on delete cascade,
  policy_id         uuid not null references public.policy_documents (id) on delete cascade,
  blocks            jsonb not null default '[]'::jsonb,
  status            text not null default 'draft' check (status in ('draft', 'published')),
  version           integer not null default 0,
  template_version  integer,
  published_at      timestamptz,
  published_by      uuid references public.users (id) on delete set null,
  updated_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organisation_id, policy_id)
);

create index organisation_policies_org_idx on public.organisation_policies (organisation_id, status);

create trigger organisation_policies_set_updated_at
  before update on public.organisation_policies
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.organisation_policies to service_role;
revoke all on public.organisation_policies from anon;
revoke delete, truncate, references, trigger on public.organisation_policies from authenticated;
grant select, insert, update on public.organisation_policies to authenticated;

alter table public.organisation_policies enable row level security;

create policy organisation_policies_platform_admin on public.organisation_policies for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

-- Console users see every copy of their organisation's; everyone else in it
-- sees only what has been published to them.
create policy organisation_policies_read on public.organisation_policies for select to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and (select public.has_feature('documents.library'))
    and ((select public.is_console_user()) or status = 'published')
  );

create policy organisation_policies_console_insert on public.organisation_policies for insert to authenticated
  with check (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('documents.library'))
  );

create policy organisation_policies_console_update on public.organisation_policies for update to authenticated
  using (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('documents.library'))
  )
  with check (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('documents.library'))
  );

alter table public.policy_acknowledgements
  add column if not exists organisation_policy_id uuid references public.organisation_policies (id) on delete cascade;

alter table public.policy_acknowledgements
  drop constraint if exists policy_acknowledgements_user_id_policy_id_version_key;

create unique index if not exists policy_ack_unique_per_copy
  on public.policy_acknowledgements (user_id, policy_id, version, organisation_policy_id) nulls not distinct;

create index if not exists policy_ack_copy_idx
  on public.policy_acknowledgements (organisation_policy_id, version);
