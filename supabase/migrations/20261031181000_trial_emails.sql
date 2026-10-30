-- ============================================================================
-- Free trial emails (TRIAL.md): which one was last sent.
-- ============================================================================
-- The daily job emails a trial company's managers at 2 days left and on the
-- last day, and us on the last day. trial_email_sent holds the last one as
-- "<kind>@<trial_ends_at>", so a re-run of the job doesn't send it twice and
-- an extended trial (a new end date) gets its own.
--
-- Written by the cron as the service role; no new grants (a column on an
-- existing table that only a platform admin can update).

alter table public.organisations
  add column if not exists trial_email_sent text;

comment on column public.organisations.trial_email_sent is
  'Last free-trial email sent, "<kind>@<trial_ends_at>" (lib/trial-emails.ts).';
