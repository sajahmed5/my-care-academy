-- Everyone in a company is a member of staff (PACKAGES.md, Staff logins,
-- 29 Oct 2026): office workers and managers have training too, so the
-- learner rollup behind the Learners list and the matrix counts them.
-- Rewritten in place from the live definition so nothing else in the
-- function moves; grants on a replaced function are kept.
do $$
declare
  d text;
begin
  select pg_get_functiondef('public.org_learner_rollup(uuid)'::regprocedure) into d;
  if position($q$and u.role = 'learner'$q$ in d) = 0 then
    raise exception 'org_learner_rollup no longer filters on the learner role as expected';
  end if;
  d := replace(d, $q$and u.role = 'learner'$q$, $q$and u.role in ('learner', 'org_admin', 'org_office')$q$);
  execute d;
end
$$;
