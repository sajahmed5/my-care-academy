-- The HR pack is in every package (PACKAGES.md, 30 Oct 2026). A platform
-- admin ticked recruitment.tracker for Starter on the Packages screen on
-- 29 Oct 2026 and Saj confirmed it; this records that tick so a rebuilt
-- database matches. Growth, Pro and Enterprise already have it.
--
-- The HR pack is never split between packages: each new HR part's key goes
-- in Starter too.

insert into public.tier_features (tier_key, feature_key)
values ('core', 'recruitment.tracker')
on conflict do nothing;
