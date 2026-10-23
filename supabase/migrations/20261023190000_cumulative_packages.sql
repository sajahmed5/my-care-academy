-- ============================================================================
-- The packages are a ladder: each one includes everything below it.
-- ============================================================================
-- Saj, 23 Oct 2026, on the pricing page: "each tier has everything before and
-- more". The copy now says so — Pro reads "Everything in Growth" — and this is
-- the half that makes it true rather than a promise the platform breaks.
--
-- Starter, Growth and Enterprise already laddered. Pro did not: it was
-- core + recruitment.tracker, so a Pro customer reading "Everything in Growth"
-- would be denied the forms builder they had just been sold. One tick fixes
-- it, and it is additive: no organisation loses anything, and no organisation
-- is on Pro today, so nobody's entitlements change at all.
--
-- Nothing enforces the ladder — a platform admin can untick anything on the
-- Packages screen, as they should be able to. If the ladder is ever meant to
-- be a rule rather than a shape, it belongs in a constraint over
-- tier_features, not in a comment.
-- ============================================================================

insert into public.tier_features (tier_key, feature_key) values
  ('core_recruitment', 'forms.builder')
on conflict do nothing;

-- The tagline was written when Pro was training + recruitment and nothing
-- else. lib/organisations.ts carries its own copy for the pricing page; these
-- two have been identical since the catalogue was seeded and there is no
-- reason to let them drift now.
update public.subscription_tiers
   set tagline = 'Training and forms, plus recruitment compliance.'
 where key = 'core_recruitment';
