-- ============================================================================
-- The console's row-level security is for console users, not for org_admin.
-- ============================================================================
-- Every org-side policy was written as current_user_role() = 'org_admin'.
-- With org_office joining the console, that test moves behind one function,
-- and every existing policy is rewritten to call it — the users read included,
-- since an office worker runs the learner lists. Nothing here grants a
-- manager-only write: billing and console-user changes go through the service
-- role from the Account page, which only a manager can open.
--
-- Written as a loop over pg_policies rather than 25 hand-edited policies, so
-- it also catches a policy added by a migration this one has not seen. New
-- policies should call public.is_console_user() directly (see AGENTS.md).
create or replace function public.is_console_user()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'user_role', '') in ('org_admin', 'org_office');
$$;
grant execute on function public.is_console_user() to authenticated;

do $$
declare
  p record;
  needle constant text := '(current_user_role() = ''org_admin''::text)';
  new_qual text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%' || needle || '%'
           or coalesce(with_check, '') like '%' || needle || '%')
  loop
    new_qual := replace(p.qual, needle, 'public.is_console_user()');
    new_check := replace(p.with_check, needle, 'public.is_console_user()');
    if new_qual is not null and new_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, new_qual, new_check);
    elsif new_qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
        p.policyname, p.schemaname, p.tablename, new_qual);
    else
      execute format('alter policy %I on %I.%I with check (%s)',
        p.policyname, p.schemaname, p.tablename, new_check);
    end if;
  end loop;
end $$;
