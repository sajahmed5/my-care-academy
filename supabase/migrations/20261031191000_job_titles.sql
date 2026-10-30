-- Issue #83 (Norwood Drive): "support worker, not care assistant, everywhere".
-- Each company names its own jobs. The first is its main title: the one
-- letters and documents use when a candidate has none, and the first choice
-- on the application form. Null = ours (lib/recruitment.ts, DEFAULT_JOB_TITLES).
-- The table's existing grants cover the new column.
alter table public.recruitment_settings
  add column job_titles text[];
