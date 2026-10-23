-- ============================================================================
-- Feature catalogue, tier contents and per-organisation overrides
-- ============================================================================
-- What a subscription includes has lived in code until now: three booleans on
-- organisations (forms_enabled, recruitment_enabled, observations_enabled),
-- with tierFlags() in lib/billing.ts deciding which tier sets which. That has
-- run out of room — the business now sells four add-on packs (recruitment,
-- complaints & safeguarding, forms, documents) and a platform admin needs to
-- decide what goes in each package without a deploy.
--
-- Entitlement becomes a predicate over three layers:
--
--   1. features / feature_categories — the catalogue. CODE, not content:
--      seeded by migration only, never editable from the UI, because a feature
--      row with no code behind it is a lie. Enforced by withholding the
--      insert/update grant from authenticated, not just by convention.
--   2. tier_features — the tick matrix a platform admin edits. This is the
--      part that moves out of code and into data.
--   3. organisation_features — a per-organisation override forcing one feature
--      on or off whatever the tier says. This is what carries today's
--      hand-toggled observations_enabled, and it is where a pilot or a
--      goodwill exception is recorded as a deliberate exception.
--
-- Tier IDENTITY stays in TypeScript (lib/organisations.ts PACKAGE_TIERS), so
-- PackageTier remains a derived exhaustive union and TIER_DETAILS stays a
-- checked Record. Only tier labels and tier contents live here.
--
-- Nothing reads any of this yet: the three resolution functions are created
-- dormant, and the existing forms_enabled() / recruitment_enabled() /
-- observations_enabled() predicates still read their boolean columns. The
-- swap is a later migration, once every organisation has an explicit override
-- row to make it provably a no-op.
--
-- Per AGENTS.md (and the note at the end of 20261020120000): the automatic
-- Data API grant is gone, so this migration grants its own privileges. This
-- is the first one that has to.
-- ============================================================================

-- ============================================================================
-- Tables
-- ============================================================================

-- The packs, as the platform admin sees them grouped on screen.
create table public.feature_categories (
  key         text primary key,
  label       text not null,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per thing the code can gate on. Keys are namespaced
-- "category.thing" so a feature can never be confused with its category.
create table public.features (
  key          text primary key,
  category_key text not null references public.feature_categories (key) on delete restrict,
  label        text not null,
  description  text,
  -- Core features are in every package and cannot be unticked ("everyone gets
  -- the training"). Enforced in the save action, deliberately NOT in the
  -- predicate — has_feature() stays dumb and uniform.
  is_core      boolean not null default false,
  sort_order   int     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index features_category_key_idx on public.features (category_key);

-- A fixed, known set. There is no insert or delete grant below, so the set is
-- immutable from the app — only label and tagline are editable.
create table public.subscription_tiers (
  key        text primary key,
  label      text not null,
  tagline    text,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The tick matrix. A set, so it is only ever inserted into or deleted from.
create table public.tier_features (
  tier_key    text not null references public.subscription_tiers (key) on delete cascade,
  feature_key text not null references public.features (key) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (tier_key, feature_key)
);
create index tier_features_feature_key_idx on public.tier_features (feature_key);

-- Per-organisation override. Row absent = inherit the tier. Row present =
-- force on or off, with `note` for why.
create table public.organisation_features (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  feature_key     text not null references public.features (key) on delete cascade,
  enabled         boolean not null,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organisation_id, feature_key)
);
create index organisation_features_feature_key_idx on public.organisation_features (feature_key);

create trigger feature_categories_set_updated_at
  before update on public.feature_categories
  for each row execute function public.set_updated_at();
create trigger features_set_updated_at
  before update on public.features
  for each row execute function public.set_updated_at();
create trigger subscription_tiers_set_updated_at
  before update on public.subscription_tiers
  for each row execute function public.set_updated_at();
create trigger organisation_features_set_updated_at
  before update on public.organisation_features
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Grants — the narrowest set each client needs (AGENTS.md).
-- ============================================================================
-- service_role: lib/supabase/admin.ts bypasses RLS but not grants, and it
-- writes all of these (seeds, backfills, the per-org override upserts).
grant select, insert, update, delete on public.feature_categories    to service_role;
grant select, insert, update, delete on public.features              to service_role;
grant select, insert, update, delete on public.subscription_tiers    to service_role;
grant select, insert, update, delete on public.tier_features         to service_role;
grant select, insert, update, delete on public.organisation_features to service_role;

-- authenticated: the catalogue is effectively a price list — every signed-in
-- user may read it (the org Account page and the upsell cards need it). Writes
-- are held to what the platform-admin screens actually do, and the platform
-- admin writes through the RLS-scoped client, as updateOrganisationAction
-- already does.
grant select                         on public.feature_categories    to authenticated;
grant select                         on public.features              to authenticated;
grant select, update                 on public.subscription_tiers    to authenticated; -- rename only
grant select, insert, delete         on public.tier_features         to authenticated; -- it is a set
grant select, insert, update, delete on public.organisation_features to authenticated;

-- anon: nothing at all. If the public pricing page ever needs tier contents it
-- goes through a security definer function, as verify_certificate() does.

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.feature_categories    enable row level security;
alter table public.features              enable row level security;
alter table public.subscription_tiers    enable row level security;
alter table public.tier_features         enable row level security;
alter table public.organisation_features enable row level security;

-- Catalogue: readable by any signed-in user, with no write policy at all to
-- match the withheld grant.
create policy feature_categories_read on public.feature_categories for select to authenticated
  using (true);
create policy features_read on public.features for select to authenticated
  using (true);

-- Tiers: everyone reads, platform_admin renames.
create policy subscription_tiers_read on public.subscription_tiers for select to authenticated
  using (true);
create policy subscription_tiers_rename on public.subscription_tiers for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Tier contents: everyone reads (so an org can be shown what its package
-- includes, and what the next one up adds), platform_admin composes.
create policy tier_features_read on public.tier_features for select to authenticated
  using (true);
create policy tier_features_insert on public.tier_features for insert to authenticated
  with check (public.is_platform_admin());
create policy tier_features_delete on public.tier_features for delete to authenticated
  using (public.is_platform_admin());

-- Overrides: an organisation may read its own, and ONLY platform_admin writes.
-- That second half is the integrity of the whole model — it is the
-- tests/rls.test.ts guarantee that an org_admin cannot switch on a feature
-- they have not bought, carried over to this table.
create policy organisation_features_platform_admin on public.organisation_features for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy organisation_features_org_read on public.organisation_features for select to authenticated
  using (organisation_id = public.current_org_id());

-- ============================================================================
-- Seed — idempotent, because supabase db reset and preview branches re-run it.
-- ============================================================================
insert into public.feature_categories (key, label, description, sort_order) values
  ('training',    'Training',                  'The course library and training records. Everyone gets this.', 10),
  ('recruitment', 'Recruitment',               'Candidate pipeline and pre-employment compliance.',            20),
  ('complaints',  'Complaints & safeguarding', 'Complaints, safeguarding and notifications.',                  30),
  ('forms',       'Forms',                     'Care forms completed on the site.',                            40),
  ('documents',   'Documents',                 'Policies and procedures to download.',                         50),
  ('platform',    'Platform & integration',    'Branding and connections to other systems.',                   90)
on conflict (key) do nothing;

insert into public.features (key, category_key, label, is_core, sort_order) values
  -- Training. Core: everyone gets the training, and learners are unlimited —
  -- what varies by package is the price band, not access.
  ('training.courses',      'training',    'Course library',                    true,  10),
  ('training.matrix',       'training',    'Training matrix & exports',         true,  20),
  ('training.programmes',   'training',    'Induction programmes',              true,  30),
  ('training.observations', 'training',    'Care Certificate observations',     false, 40),
  -- The four packs.
  ('recruitment.tracker',   'recruitment', 'Recruitment tracker',               false, 10),
  ('complaints.register',   'complaints',  'Complaints & safeguarding register', false, 10),
  ('forms.builder',         'forms',       'Forms builder',                     false, 10),
  ('documents.library',     'documents',   'Policies & procedures library',     false, 10),
  -- Odds and ends that are already sold or configured per organisation.
  ('platform.white_label',  'platform',    'White-label logo',                  false, 10),
  ('platform.portal_api',   'platform',    'Rostering portal integration',      false, 20)
on conflict (key) do nothing;

-- Labels and taglines match lib/organisations.ts today; the point of holding
-- them here is that a platform admin can change them without a deploy.
insert into public.subscription_tiers (key, label, tagline, sort_order) values
  ('core',             'Essentials',   'Everything a care team needs to train and stay compliant.', 10),
  ('core_forms',       'Professional', 'Training plus your own digital paperwork.',                 20),
  ('core_recruitment', 'Premier',      'Training plus recruitment compliance.',                     30),
  ('full',             'Enterprise',   'The complete platform for growing care providers.',         40)
on conflict (key) do nothing;

-- Core features belong to every package.
insert into public.tier_features (tier_key, feature_key)
select t.key, f.key
  from public.subscription_tiers t
 cross join public.features f
 where f.is_core
on conflict do nothing;

-- Today's tier semantics, preserved. The first four rows are exactly what
-- tierFlags() in lib/billing.ts derives. The fifth is a correction rather than
-- a change: Enterprise's published feature list already promises "Care
-- Certificate workplace assessment" (lib/organisations.ts TIER_DETAILS), but
-- tierFlags() never set observations_enabled, so the claim was only ever met
-- by someone toggling it by hand. No existing organisation is affected — the
-- next migration gives every one of them an explicit override row taken from
-- its live booleans — so this only applies to organisations put on Enterprise
-- from now on.
insert into public.tier_features (tier_key, feature_key) values
  ('core_forms',       'forms.builder'),
  ('core_recruitment', 'recruitment.tracker'),
  ('full',             'forms.builder'),
  ('full',             'recruitment.tracker'),
  ('full',             'training.observations')
on conflict do nothing;

-- ============================================================================
-- Resolution — created dormant. Nothing calls these until the predicate swap.
-- ============================================================================

-- Parameterised by organisation, and locked to service_role: it takes an
-- arbitrary org id, so an org_admin must not be able to probe another
-- organisation's entitlement with it.
create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ofs.enabled
       from public.organisation_features ofs
      where ofs.organisation_id = p_org
        and ofs.feature_key = p_feature),
    exists (
      select 1
        from public.organisations o
        join public.tier_features tf on tf.tier_key = o.package_tier
       where o.id = p_org
         and tf.feature_key = p_feature
    )
  );
$$;
revoke execute on function public.org_has_feature(uuid, text) from public, anon, authenticated;
grant  execute on function public.org_has_feature(uuid, text) to service_role;

-- The caller's own organisation. `exists` never returns null, so the coalesce
-- always terminates: no override and no tick resolves to false, which is the
-- fail-closed behaviour the current add-on flags already have.
--
-- A platform_admin has no current_org_id(), so this is false for them. That is
-- harmless in RLS, where every gated policy carries its own is_platform_admin()
-- branch, but the TypeScript guard must short-circuit on role.
create or replace function public.has_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_has_feature(public.current_org_id(), p_feature);
$$;
grant  execute on function public.has_feature(text) to authenticated;
revoke execute on function public.has_feature(text) from public, anon;

-- Every enabled key for the caller's organisation, so the TypeScript layer can
-- load entitlement in one round trip per request instead of one per feature.
create or replace function public.my_entitlements()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select f.key
    from public.features f
   where public.has_feature(f.key);
$$;
grant  execute on function public.my_entitlements() to authenticated;
revoke execute on function public.my_entitlements() from public, anon;
