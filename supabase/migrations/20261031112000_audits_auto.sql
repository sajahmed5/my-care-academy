-- ============================================================================
-- Service audits, part 3: the staff file and training audits
-- (SERVICE-AUDITS.md, Service-wide audits)
-- ============================================================================
-- Additive only.
--
-- Two audits fill themselves in: the staff file audit from the HR pack (DBS
-- and right to work in date, references held, probation done) and the
-- training audit from the training records. The auditor checks what the site
-- found and signs it off. What it found is kept with the audit as it was on
-- the day, in auto:
--
--   { kind: 'staff_file' | 'training',
--     checks: [{ key, label }],
--     people: [{ id, name, checks: { <key>: { result: pass | fail | na, detail } } }],
--     summary: { … } }
--
-- No new table, so no new grants: audits keeps its own (20261026130000).

alter table public.audits add column if not exists auto jsonb;
