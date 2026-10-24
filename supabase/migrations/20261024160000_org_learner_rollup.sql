-- ============================================================================
-- org_learner_rollup(): one row per learner, counted in Postgres.
-- ============================================================================
-- The dashboard, Learners overview, reminders tab, bulk nudges and the
-- platform's organisation page all built their per-learner figures by
-- downloading every enrolment and certificate the organisation has ever had
-- and counting them in Node (lib/org-learners.ts buildOrgLearners). On a fully
-- assigned organisation (260 carers x 16 courses) that is ~8,000 rows, ~1.4 MB,
-- per page view, to show ~260 rows of totals. This returns those totals.
--
-- It mirrors learnerStats() (lib/learner-stats.ts) and isLateCompletion()
-- (lib/org-learners.ts) rule for rule; the percentages are left to the app so
-- they round exactly as before. Edges kept on purpose:
--   * due dates are compared as UTC midnight, as `new Date("YYYY-MM-DD")` does;
--   * "60 days" is 1,440 hours, as the app's 86,400,000 ms days are — never
--     calendar days, which would move with the session time zone;
--   * "expiring" is the newest certificate per course with expiry inside 60
--     days INCLUDING already expired, as expiryFlag() calls those red;
--   * ties on issued_at go to the lowest id, the row the app's stable sort
--     over id-ordered pages picked.
--
-- SECURITY INVOKER, so row-level security still decides what the caller can
-- see: a console user gets their own organisation and nothing else whatever
-- p_org they pass; the platform admin and the service role (bulk nudges) see
-- the organisation asked for. A function, not a table: no table grants, and
-- EXECUTE goes to signed-in users and the server only (AGENTS.md).

drop function if exists public.org_learner_rollup(uuid);

create or replace function public.org_learner_rollup(p_org uuid)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with e as (
    select user_id, course_id, status, coalesce(progress, 0) as progress,
           (due_date::timestamp at time zone 'UTC') as due_at, due_date,
           assigned_at, last_reminder_at, time_spent
      from public.enrolments
     where organisation_id = p_org
  ),
  c as (
    select cert.id, cert.user_id, cert.course_id, cert.issued_at, cert.expires_at
      from public.certificates cert
     where cert.organisation_id = p_org
  ),
  ea as (
    select user_id,
           count(*)::int as assigned,
           count(*) filter (where status = 'not_started')::int as not_started,
           count(*) filter (where status = 'in_progress')::int as in_progress,
           count(*) filter (where status = 'completed')::int as completed,
           count(*) filter (where status = 'expired')::int as expired,
           count(*) filter (where status <> 'completed' and due_at < now())::int as overdue,
           count(*) filter (where status <> 'completed' and due_at >= now()
                              and due_at <= now() + interval '1440 hours')::int as due_soon,
           sum(case when status = 'completed' then 100 else progress end)::int as progress_sum,
           max(assigned_at) as last_assigned_at,
           max(last_reminder_at) as last_reminded_at,
           coalesce(sum(time_spent), 0)::int as time_spent
      from e
     group by user_id
  ),
  ca as (
    select c.user_id,
           count(*)::int as certificates,
           count(*) filter (
             where e.due_date is not null
               and to_char(c.issued_at at time zone 'UTC', 'YYYY-MM-DD') > e.due_date::text
           )::int as late_completions
      from c
      left join e on e.user_id = c.user_id and e.course_id = c.course_id
     group by c.user_id
  ),
  latest_per_course as (
    select distinct on (user_id, course_id) user_id, expires_at
      from c
     order by user_id, course_id, issued_at desc, id
  ),
  la as (
    select user_id,
           count(*) filter (
             where expires_at is not null and expires_at <= now() + interval '1440 hours'
           )::int as expiring
      from latest_per_course
     group by user_id
  ),
  newest as (
    select distinct on (c.user_id) c.user_id, c.issued_at, co.title
      from c
      left join public.courses co on co.id = c.course_id
     order by c.user_id, c.issued_at desc, c.id
  ),
  rollup as (
    select u.id, u.full_name, u.email, u.status, u.last_seen_at,
           coalesce(ea.assigned, 0) as assigned, coalesce(ea.not_started, 0) as not_started,
           coalesce(ea.in_progress, 0) as in_progress, coalesce(ea.completed, 0) as completed,
           coalesce(ea.expired, 0) as expired, coalesce(ea.overdue, 0) as overdue,
           coalesce(ea.due_soon, 0) as due_soon, coalesce(ea.progress_sum, 0) as progress_sum,
           coalesce(ca.certificates, 0) as certificates, coalesce(la.expiring, 0) as expiring,
           coalesce(ca.late_completions, 0) as late_completions,
           ea.last_assigned_at, ea.last_reminded_at, coalesce(ea.time_spent, 0) as time_spent,
           case when newest.user_id is null then null
                else coalesce(newest.title, 'Course') end as latest_title,
           newest.issued_at as latest_issued_at
      from public.users u
      left join ea on ea.user_id = u.id
      left join ca on ca.user_id = u.id
      left join la on la.user_id = u.id
      left join newest on newest.user_id = u.id
     where u.organisation_id = p_org
       and u.role = 'learner'
  )
  -- One JSON array of positional rows. As a table, each of ~260 rows carried
  -- its 21 column names (~300 bytes of keys against ~200 of values), which
  -- made the rollup bigger than the raw rows it replaces on an organisation
  -- with few assignments. One value also sidesteps the 1,000-row cap.
  -- The order is the contract with lib/org-learners.ts ROLLUP_FIELDS.
  select coalesce(json_agg(json_build_array(
           id, full_name, email, status, last_seen_at,
           assigned, not_started, in_progress, completed, expired,
           overdue, due_soon, progress_sum, certificates, expiring,
           late_completions, last_assigned_at, last_reminded_at, time_spent,
           latest_title, latest_issued_at
         ) order by id), '[]'::json)
    from rollup;
$$;

revoke execute on function public.org_learner_rollup(uuid) from public, anon;
grant execute on function public.org_learner_rollup(uuid) to authenticated, service_role;
