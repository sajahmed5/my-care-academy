-- Every office worker sees disciplinary and grievance cases, as managers do
-- (Saj, 2 Nov 2026, QA review Q2: office workers do the admin for the
-- managers). The named list in hr_settings.case_office_access is no longer
-- consulted; the column stays so nothing breaks, and a later "Who can see
-- what" setting restricts whole areas instead. Nobody sees a case about
-- themselves, as before. Applied live the same day.
create or replace function public.can_see_hr_case(p_case uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hr_cases c
    where c.id = p_case
      and c.organisation_id = public.current_org_id()
      and public.is_console_user()
      and public.has_feature('recruitment.tracker')
      and c.user_id <> (select auth.uid())
      and c.about_user_id is distinct from (select auth.uid())
  );
$$;
revoke all on function public.can_see_hr_case(uuid) from public, anon;
grant execute on function public.can_see_hr_case(uuid) to authenticated, service_role;
