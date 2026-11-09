-- Each company's own absence reasons (Saj, 9 Nov 2026: ours were far too
-- specific, and a company should be able to amend them or add its own).
-- Null means ours, as lib/hr/absence.ts lists them; otherwise a list of
-- { key, label, excluded }: key is one of ours or own_…, label is what the
-- absence record stores, excluded means it never counts towards a trigger.
-- No new table, so no new grants: hr_settings already has them.
alter table public.hr_settings
  add column if not exists absence_reasons jsonb;
