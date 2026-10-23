-- ============================================================================
-- Point the three add-on gates at the feature catalogue
-- ============================================================================
-- forms_enabled(), recruitment_enabled() and observations_enabled() each read
-- their own boolean column on organisations. They are ANDed into roughly
-- fourteen RLS policies across forms, form_fields, form_submissions,
-- candidates, candidate_documents, care_cert_observations and
-- care_cert_signoffs.
--
-- Only the three function BODIES change here. Not one policy is touched, and
-- that is deliberate:
--
--   * Rewriting the policies would mean re-typing fourteen `using` clauses and
--     ten `with check` clauses, each of which also carries the tenant
--     predicate. One mistyped clause is a cross-tenant leak, and a `with
--     check` left weaker than its `using` would not necessarily fail a test.
--   * Leaving them byte-identical is what makes this change provable. The RLS
--     suites exercise these gates end to end; move only their SETUP to
--     organisation_features, change nothing else, and passing tests
--     demonstrate the swap is transparent.
--   * create or replace needs no policy dropped, so no table ever sits
--     ungated for an instant.
--   * Rollback is one more create or replace. The boolean columns are still
--     there, and stay there until this has been live long enough to trust.
--
-- The previous migration gave every organisation an explicit
-- organisation_features row taken from its live boolean, so has_feature()
-- already returns exactly what these functions returned. Verified against the
-- live data before writing this, including the organisation whose tier and
-- columns disagree.
--
-- SECURITY INVOKER and no SET clause, both on purpose. A function carrying a
-- SET clause cannot be inlined by the planner (see the reasoning in
-- 20260911120000_database_tidy_up.sql), and these are called per row. Without
-- it the planner folds the wrapper straight into the policy's qual, leaving
-- the same single non-inlinable layer — has_feature() itself — that the
-- policies effectively have today. Dropping SECURITY DEFINER is safe because
-- has_feature() is the definer now, and these bodies call nothing but a
-- schema-qualified public function.
--
-- The names now say less than they mean: forms_enabled() no longer reads
-- anything called forms_enabled. They earn their keep as the thing that keeps
-- fourteen policies untouched, and they fall away naturally as each pack's own
-- migration references has_feature() directly.
-- ============================================================================

create or replace function public.forms_enabled()
returns boolean
language sql
stable
as $$ select public.has_feature('forms.builder'); $$;

create or replace function public.recruitment_enabled()
returns boolean
language sql
stable
as $$ select public.has_feature('recruitment.tracker'); $$;

create or replace function public.observations_enabled()
returns boolean
language sql
stable
as $$ select public.has_feature('training.observations'); $$;

-- create or replace keeps existing grants, but restate the revokes from
-- 20260911120000_database_tidy_up.sql so a database built from scratch ends in
-- the same place.
revoke execute on function public.forms_enabled()        from public, anon;
revoke execute on function public.recruitment_enabled()  from public, anon;
revoke execute on function public.observations_enabled() from public, anon;
grant  execute on function public.forms_enabled()        to authenticated;
grant  execute on function public.recruitment_enabled()  to authenticated;
grant  execute on function public.observations_enabled() to authenticated;
