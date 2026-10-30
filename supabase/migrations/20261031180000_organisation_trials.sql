-- ============================================================================
-- Free trials (TRIAL.md, 30 Oct 2026).
-- ============================================================================
-- A trial company is on Enterprise until trial_ends_at; empty means it is not
-- on a trial. Set, extended and cleared from the platform's organisation page.
-- When the date passes the company pauses: the app checks it beside the
-- suspended status (lib/auth.ts), so nothing here has to flip at midnight.
--
-- Only a platform admin can write it: organisations has no update policy for
-- anyone else, so a company can't move its own end date. Members read it
-- through members_read_own_organisation, as they read the rest of the row.
-- No new grants: it is a column on an existing table.

alter table public.organisations
  add column if not exists trial_ends_at timestamptz;

comment on column public.organisations.trial_ends_at is
  'End of a free trial (TRIAL.md). Null = not on a trial.';
