-- ============================================================================
-- Training "due soon" is the next 30 days, not 60 (9 Nov 2026)
-- ============================================================================
-- The Today line "Training due in the next 60 days" and the staff list's
-- "Due in the next 60 days" filter were the only due lists on a 60-day
-- window; supervisions, appraisals, audits, forms and documents all say
-- "due in the next 30 days" (lib/records.ts DUE_SOON_DAYS). learnerStats()
-- now uses that same constant, and the rollup here has to count the same
-- enrolments or tests/org-learner-rollup.test.ts fails on the edge.
--
-- Rewritten in place from the live definition so nothing else in the function
-- moves (grants on a replaced function are kept). Only the due_soon filter
-- changes: certificates "expiring" keeps its 60-day window, since that mirrors
-- expiryFlag()'s amber band, which is a separate idea.
do $$
declare
  d text;
begin
  select pg_get_functiondef('public.org_learner_rollup(uuid)'::regprocedure) into d;
  if position($q$and due_at <= now() + interval '1440 hours'$q$ in d) = 0 then
    raise exception 'org_learner_rollup no longer counts due_soon on a 1,440-hour window as expected';
  end if;
  d := replace(d, $q$and due_at <= now() + interval '1440 hours'$q$, $q$and due_at <= now() + interval '720 hours'$q$);
  execute d;
end
$$;
