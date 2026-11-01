-- ============================================================================
-- Trial walkthrough (1 Nov 2026): what each person has seen of it.
-- ============================================================================
-- A manager or office worker is welcomed and toured on their first console
-- sign-in while the company is on a trial, and Today carries a Getting
-- started list they can hide. Both are remembered per person, not per
-- company, so a second manager added later gets their own welcome.
--
-- One jsonb column, not a table: it is two timestamps about one person, read
-- with the rest of their row (read_own_user_row) and written only by the app
-- through the service role (users has no self-update policy, and a column
-- on an existing table needs no new grant). Keys: tour_seen_at,
-- list_hidden_at. Additive, so the code already deployed is unaffected.

alter table public.users
  add column if not exists walkthrough jsonb not null default '{}'::jsonb;

comment on column public.users.walkthrough is
  'Trial walkthrough state for this person: {tour_seen_at, list_hidden_at}. Written by the app (service role).';
