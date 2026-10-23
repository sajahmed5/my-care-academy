-- ============================================================================
-- Per-organisation subscription: service type, size band, agreed amount —
-- and the override backfill that makes the predicate swap a no-op.
-- ============================================================================
-- Three things an organisation needs that nothing has recorded until now:
--
--   service_type  Homecare, care home, or both. It decides which documents and
--                 which forms an organisation sees — the share-drive library is
--                 already split that way, and handing a care home the
--                 domiciliary safeguarding policy would be worse than useless.
--                 It does NOT filter courses.
--   size_band     Under 10 staff / 10-25 / 25+. Learners stay unlimited and no
--                 invite is ever blocked: the band is a PRICING input, because
--                 a flat monthly fee is too steep for a service with a handful
--                 of staff. Nothing in RLS reads it, by design.
--   the amount    What this organisation actually agreed to pay.
--
-- Both columns are nullable with no default. Defaulting service_type would be
-- the system guessing a regulatory fact about a customer, and defaulting the
-- band would fabricate a pricing input; "not set" is a real state the platform
-- admin needs to see.
-- ============================================================================

alter table public.organisations
  add column if not exists size_band text
    check (size_band is null or size_band in ('under_10', '10_to_25', 'over_25')),
  add column if not exists service_type text
    check (service_type is null or service_type in ('homecare', 'care_home', 'both'));

-- ============================================================================
-- The agreed monthly amount, deliberately NOT a column on organisations.
-- ============================================================================
-- members_read_own_organisation (20260701110730_foundation.sql) lets any member
-- read their own organisation row, and RLS cannot hide a single column. The
-- agreed figure may be discounted, bespoke, or different from what Stripe is
-- charging while a promotion runs, so it lives where only a platform admin can
-- read it. Costs a join on three internal screens, which is nothing.
--
-- Pence as an integer, never a float. Null means "no amount agreed yet" — a
-- state the platform admin must be able to see, not a zero.
create table public.organisation_subscriptions (
  organisation_id      uuid primary key references public.organisations (id) on delete cascade,
  monthly_amount_pence integer check (monthly_amount_pence is null or monthly_amount_pence >= 0),
  note                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger organisation_subscriptions_set_updated_at
  before update on public.organisation_subscriptions
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.organisation_subscriptions to service_role;
grant select, insert, update, delete on public.organisation_subscriptions to authenticated;
-- nothing to anon.

alter table public.organisation_subscriptions enable row level security;

-- Platform admin only. There is deliberately no policy for the organisation
-- itself: this is our commercial record of them, not theirs.
create policy organisation_subscriptions_platform_admin
  on public.organisation_subscriptions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ============================================================================
-- package_tier finally gets a foreign key.
-- ============================================================================
-- It has been unconstrained text with a 'core' default since the foundation
-- migration, so nothing has ever stopped a typo being stored — and an unknown
-- value makes TIER_DETAILS[tier] throw on the org Account page. Repair any
-- stray value first, then add the constraint NOT VALID and validate it
-- separately, so one bad row cannot block the deploy.
update public.organisations o
   set package_tier = 'core'
 where not exists (
   select 1 from public.subscription_tiers t where t.key = o.package_tier
 );

alter table public.organisations
  add constraint organisations_package_tier_fkey
  foreign key (package_tier) references public.subscription_tiers (key)
  on update cascade not valid;
alter table public.organisations validate constraint organisations_package_tier_fkey;

create index if not exists organisations_package_tier_idx
  on public.organisations (package_tier);

-- ============================================================================
-- The backfill. This is the whole point of the commit.
-- ============================================================================
-- Every organisation gets an EXPLICIT override row for each of the three
-- features that are boolean columns today, taken from the live value of that
-- column. After this, has_feature() returns exactly what the booleans return
-- for every existing organisation, so the next migration — which repoints the
-- three gate functions at has_feature() — provably changes nothing.
--
-- Deriving these from tierFlags() instead would be wrong twice over: it never
-- knew about observations_enabled at all, and the booleans already disagree
-- with tier in the live data (an organisation on Enterprise with all three
-- add-ons switched off). The live column is the truth to preserve, whatever
-- the tier says.
insert into public.organisation_features (organisation_id, feature_key, enabled, note)
select id, 'forms.builder', forms_enabled,
       'Migrated from organisations.forms_enabled'
  from public.organisations
union all
select id, 'recruitment.tracker', recruitment_enabled,
       'Migrated from organisations.recruitment_enabled'
  from public.organisations
union all
select id, 'training.observations', observations_enabled,
       'Migrated from organisations.observations_enabled'
  from public.organisations
on conflict (organisation_id, feature_key) do nothing;
