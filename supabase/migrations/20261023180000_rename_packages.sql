-- ============================================================================
-- The four packages get the names we actually sell them under.
-- ============================================================================
-- Essentials → Starter, Professional → Growth, Premier → Pro (Saj, 23 Oct
-- 2026). Enterprise keeps its name.
--
-- Labels only. The keys stay 'core', 'core_forms', 'core_recruitment' and
-- 'full': they are referenced by organisations.package_tier, tier_features,
-- the entitlement functions and every test fixture, and renaming them would be
-- a data migration to buy nothing — nobody outside this schema ever sees a
-- key.
--
-- Note the collision this walks into: 'Pro' is now core_recruitment, while
-- 'Professional' was core_forms. Anything that matched a package by its label
-- rather than its key would silently point at the wrong package. Nothing does
-- — tests/entitlements asserts only the key set, and deliberately not the
-- labels, because a platform admin may rename a package — but it is why the
-- public pricing copy in lib/organisations.ts is updated in the same commit
-- rather than left to catch up.
-- ============================================================================

update public.subscription_tiers set label = 'Starter'    where key = 'core';
update public.subscription_tiers set label = 'Growth'     where key = 'core_forms';
update public.subscription_tiers set label = 'Pro'        where key = 'core_recruitment';
update public.subscription_tiers set label = 'Enterprise' where key = 'full';
