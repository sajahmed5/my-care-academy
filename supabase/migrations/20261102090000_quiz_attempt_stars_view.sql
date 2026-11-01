-- ============================================================================
-- Stars in the console (2 Nov 2026): a lean view over quiz attempts.
-- ============================================================================
-- The Stars leaderboard (People → Staff → Stars) and a person's Stars tab
-- work a carer's stars out the same way the learner's own star bank does
-- (lib/stars.ts): one star per right answer, the best attempt per compliance
-- cycle, capped at 20. The maths needs only how many questions an attempt
-- served and its score, but quiz_attempts stores the served questions as a
-- jsonb array of 20 ids — close to a kilobyte a row, which across a company's
-- every attempt is a megabyte on each leaderboard load. This view returns the
-- count instead.
--
-- security_invoker, so the caller's own quiz_attempts policies apply: a
-- console user sees their company's attempts (is_console_user), a learner
-- their own, nobody else anything. Views are granted like tables (AGENTS.md):
-- authenticated and service_role read it, anon does not, and the revoke is
-- explicit because this project still auto-grants new relations.

create view public.quiz_attempt_stars
with (security_invoker = true) as
  select
    id,
    organisation_id,
    user_id,
    course_id,
    score,
    passed,
    submitted_at,
    case when jsonb_typeof(question_ids) = 'array' then jsonb_array_length(question_ids) else 0 end as questions
  from public.quiz_attempts
  where submitted_at is not null;

comment on view public.quiz_attempt_stars is
  'Submitted quiz attempts with the served-question count instead of the ids, for the star maths (lib/stars.ts). Security invoker: quiz_attempts policies apply.';

revoke all on public.quiz_attempt_stars from anon, public;
grant select on public.quiz_attempt_stars to authenticated, service_role;
-- The default privileges on this project hand authenticated every privilege
-- on a new relation; a view is read-only in practice, but the grant should
-- say so (checked in role_table_grants after applying).
revoke insert, update, delete, references, trigger, truncate on public.quiz_attempt_stars from authenticated;
