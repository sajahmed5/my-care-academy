-- Issue #89 (Norwood Drive): HR letters downloaded as PDF or Word "with the
-- company letterhead". The letterhead is the company's name (and logo, with
-- white label) plus what this holds: { address, phone, email }, set under
-- Settings → HR → Letters and printed under the name on every HR letter.
-- The table's existing grants cover the new column.
alter table public.hr_settings
  add column letterhead jsonb;
