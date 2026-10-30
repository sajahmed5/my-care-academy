-- Starter is online training only (Saj, 30 Oct 2026, from his original
-- package spreadsheet): Growth is training, recruitment and Staff Audits.
-- The HR pack is never split, so all of it goes with recruitment — it
-- leaves Starter and starts at Growth, which already has it. This undoes
-- 20261030120000_hr_pack_in_starter.
--
-- Nothing is deleted: a Starter company's HR records stay, out of sight
-- until it moves to Growth.

delete from public.tier_features
where tier_key = 'core'
  and feature_key = 'recruitment.tracker';
