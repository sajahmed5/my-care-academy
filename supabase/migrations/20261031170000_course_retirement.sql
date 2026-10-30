-- ============================================================================
-- Retiring a course (Saj, 30 Oct 2026)
-- ============================================================================
-- A platform admin can retire a course instead of deleting it, which would
-- cascade away every company's certificates. A retired course is offered
-- nowhere — MyRoster's catalogue, the console's assign screens, the carer's
-- All courses page, the course sets — and its renewal emails stop. Every
-- certificate and completion is kept. Retiring also removes the assignments
-- nobody has finished (not started, in progress, required again); that is
-- done by the app's retire action, not here. Bringing a course back clears
-- the date; the removed assignments are not restored.
--
-- No new table, so no new grants: the columns follow courses' own grants
-- and its courses_read / courses_write policies.

alter table public.courses
  add column retired_at timestamptz,
  add column retired_by uuid references public.users (id) on delete set null;
