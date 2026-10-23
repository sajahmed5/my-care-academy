-- ============================================================================
-- Drop the feature exceptions that only repeat what the package says
-- ============================================================================
-- 20261023130000 gave every organisation an explicit organisation_features row
-- for forms, recruitment and observations, copied from the old boolean
-- columns. That was what made the predicate swap provably a no-op — but it
-- also pinned all three features for every existing organisation. Now that the
-- Stripe webhook writes only the package and no longer the booleans, a pinned
-- feature would ignore an upgrade or a downgrade: an organisation moving to
-- Professional would not get forms, because its migrated "off" row still wins.
--
-- Most of those rows say exactly what the package says. Removing one changes
-- nothing about what that organisation can reach today (the package answers
-- the same), and lets future package changes flow through again.
--
-- Rows that DISAGREE with the package are kept. They are real exceptions —
-- an organisation on Enterprise with all three add-ons switched off, say —
-- and they now show on the organisation's page as "Always off" with the
-- migration note, for a platform admin to confirm or set back to the package.
--
-- Only rows the migration or the legacy-switch bridge wrote are considered;
-- an exception a platform admin set by hand is never touched.
-- ============================================================================

delete from public.organisation_features ofs
 using public.organisations o
 where o.id = ofs.organisation_id
   and (ofs.note like 'Migrated from organisations.%'
        or ofs.note like 'Set through the legacy %')
   and ofs.enabled = exists (
     select 1
       from public.tier_features tf
      where tf.tier_key = o.package_tier
        and tf.feature_key = ofs.feature_key
   );
