-- ============================================================================
-- Policy review dates, and the company's own policy settings
-- ============================================================================
-- POLICIES.md, "How policies work": every published policy has a review date,
-- yearly by default. A review with no change moves the date on and nobody
-- re-accepts; a review that changes the policy publishes a new version, which
-- staff accept afresh. Reviews show in Who's due and the weekly email.
--
-- organisation_policy_settings — one row per company, set under
--   /org/settings/policies (managers only, enforced in the app): how often its
--   policies are reviewed, and the company's own details that are merged into
--   a template when it is adopted (registered manager, office address…), so
--   they are written once rather than into every policy.
-- organisation_policies gains
--   review_months   this policy's own period; null means the company's
--   review_due_on   when the next review falls; set on every publish and
--                   every no-change review
-- organisation_policy_reviews — the history an inspector asks for: when each
--   policy was reviewed, by whom, and whether it changed.
--
-- Additive: new columns are nullable and nothing live reads them. Grants per
-- AGENTS.md — nothing to anon, the narrowest set to authenticated, revoked
-- first because Supabase still auto-grants here.
-- ============================================================================

create table public.organisation_policy_settings (
  organisation_id      uuid primary key references public.organisations (id) on delete cascade,
  review_months        integer not null default 12 check (review_months between 1 and 60),
  registered_manager   text,
  nominated_individual text,
  office_address       text,
  office_phone         text,
  office_email         text,
  service_area         text,
  cqc_provider_id      text,
  updated_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger organisation_policy_settings_set_updated_at
  before update on public.organisation_policy_settings
  for each row execute function public.set_updated_at();

revoke all on public.organisation_policy_settings from anon, authenticated;
grant select, insert, update, delete on public.organisation_policy_settings to service_role;
grant select, insert, update on public.organisation_policy_settings to authenticated;

alter table public.organisation_policy_settings enable row level security;

create policy organisation_policy_settings_platform_admin on public.organisation_policy_settings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy organisation_policy_settings_console on public.organisation_policy_settings for all to authenticated
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

alter table public.organisation_policies
  add column if not exists review_months integer check (review_months between 1 and 60),
  add column if not exists review_due_on date;

-- Anything already published is due a year after it was.
update public.organisation_policies
   set review_due_on = (published_at + interval '12 months')::date
 where status = 'published' and published_at is not null and review_due_on is null;

create table public.organisation_policy_reviews (
  id                     uuid primary key default gen_random_uuid(),
  organisation_id        uuid not null references public.organisations (id) on delete cascade,
  organisation_policy_id uuid not null references public.organisation_policies (id) on delete cascade,
  reviewed_at            timestamptz not null default now(),
  reviewed_by            uuid references public.users (id) on delete set null,
  -- 'no_change': the date moved on; 'new_version': it was published again.
  outcome                text not null check (outcome in ('no_change', 'new_version')),
  version                integer not null,
  next_due_on            date,
  note                   text check (char_length(note) <= 2000)
);

create index organisation_policy_reviews_copy_idx
  on public.organisation_policy_reviews (organisation_policy_id, reviewed_at desc);
create index organisation_policy_reviews_org_idx
  on public.organisation_policy_reviews (organisation_id);

revoke all on public.organisation_policy_reviews from anon, authenticated;
grant select, insert, update, delete on public.organisation_policy_reviews to service_role;
-- A review is a fact with a date: written once, never edited.
grant select, insert on public.organisation_policy_reviews to authenticated;

alter table public.organisation_policy_reviews enable row level security;

create policy organisation_policy_reviews_platform_admin on public.organisation_policy_reviews for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy organisation_policy_reviews_console_read on public.organisation_policy_reviews for select to authenticated
  using (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('documents.library'))
  );

create policy organisation_policy_reviews_console_insert on public.organisation_policy_reviews for insert to authenticated
  with check (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and reviewed_by = (select auth.uid())
    and (select public.has_feature('documents.library'))
  );
