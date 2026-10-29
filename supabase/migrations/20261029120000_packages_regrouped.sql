-- ============================================================================
-- The packages regrouped (PACKAGES.md, agreed with Saj 29 Oct 2026)
-- ============================================================================
-- Starter    training
-- Growth     + recruitment (the HR pack), supervisions, spot checks and
--              competency (Staff Audits)
-- Pro        + complaints & safeguarding, audits, forms and feedback, the
--              policies (one combined pack: the library and the full pack)
-- Enterprise + Care Certificate observations, classroom sessions, white
--              label, the rostering integration
--
-- Until now Growth held forms and the policies library, and Pro held
-- recruitment and the people records. On 29 Oct 2026 no organisation is on
-- Growth or Pro (two on Starter, one on Enterprise), so nobody gains or loses
-- anything by the move. Per-organisation overrides are left exactly as they
-- are.
--
-- Classroom sessions get a key of their own (training.classroom), in
-- Enterprise with face-to-face training. They were open to every package; the
-- only session ever recorded is the Enterprise organisation's.
--
-- Also here: package_change_requests, a manager's "ask to move to Pro" from
-- the Account page. Package changes stay with us, as they always have.

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('training.classroom', 'training', 'Classroom sessions', false, 50)
on conflict (key) do nothing;

update public.feature_categories set label = 'Staff Audits' where key = 'people';
update public.features set label = 'Recruitment' where key = 'recruitment.tracker';
update public.features set label = 'Complaints & safeguarding' where key = 'complaints.register';
update public.features set label = 'Forms' where key = 'forms.builder';
update public.features set label = 'Policies & procedures' where key = 'documents.library';
update public.features set label = 'Policies & procedures (full pack)' where key = 'documents.compliance_pack';

-- The matrix, restated whole. Core rows are left alone.
delete from public.tier_features tf
 using public.features f
 where f.key = tf.feature_key
   and not f.is_core;

insert into public.tier_features (tier_key, feature_key)
select t.tier_key, t.feature_key
  from (values
    ('core_forms',       'recruitment.tracker'),
    ('core_forms',       'people.supervisions'),
    ('core_forms',       'people.competency')
  ) as t(tier_key, feature_key)
union all
select tier, f
  from unnest(array['core_recruitment', 'full']) as tier
 cross join unnest(array[
   'recruitment.tracker', 'people.supervisions', 'people.competency',
   'complaints.register', 'quality.audits', 'quality.feedback',
   'forms.builder', 'documents.library', 'documents.compliance_pack'
 ]) as f
union all
select 'full', f
  from unnest(array[
   'training.observations', 'training.classroom',
   'platform.white_label', 'platform.portal_api'
 ]) as f
on conflict do nothing;

update public.subscription_tiers set label = 'Starter',    tagline = 'Training for the whole team.'             where key = 'core';
update public.subscription_tiers set label = 'Growth',     tagline = 'Hire, check and support your staff.'      where key = 'core_forms';
update public.subscription_tiers set label = 'Pro',        tagline = 'Run your whole compliance in one place.'  where key = 'core_recruitment';
update public.subscription_tiers set label = 'Enterprise', tagline = 'For larger and growing providers.'        where key = 'full';

-- Classroom sessions: the console's own policies now need the feature. A
-- carer still reads the sessions they attended — that is their training
-- record, whatever the package.
drop policy if exists classroom_sessions_console on public.classroom_sessions;
create policy classroom_sessions_console on public.classroom_sessions for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('training.classroom')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('training.classroom')));
drop policy if exists classroom_attendance_console on public.classroom_attendance;
create policy classroom_attendance_console on public.classroom_attendance for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('training.classroom')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('training.classroom')));

-- ============================================================================
-- Package change requests
-- ============================================================================
create table public.package_change_requests (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  requested_by    uuid references public.users (id) on delete set null,
  from_tier       text not null,
  to_tier         text not null references public.subscription_tiers (key),
  note            text check (note is null or length(note) <= 2000),
  status          text not null default 'open' check (status in ('open', 'done', 'declined')),
  handled_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index package_change_requests_org_idx on public.package_change_requests (organisation_id, created_at desc);
create trigger package_change_requests_set_updated_at
  before update on public.package_change_requests
  for each row execute function public.set_updated_at();

-- Grants (AGENTS.md): the service role does the writes the platform admin
-- makes; a console user reads their own organisation's requests and makes
-- new ones. Nothing for anon — revoked explicitly, as Supabase still grants
-- it by default here.
grant select, insert, update, delete on public.package_change_requests to service_role;
revoke all on public.package_change_requests from anon;
revoke all on public.package_change_requests from authenticated;
grant select, insert on public.package_change_requests to authenticated;

alter table public.package_change_requests enable row level security;
create policy package_change_requests_platform_admin on public.package_change_requests for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy package_change_requests_console_read on public.package_change_requests for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()));
create policy package_change_requests_console_insert on public.package_change_requests for insert to authenticated
  with check ((select public.is_console_user())
              and organisation_id = (select public.current_org_id())
              and requested_by = (select auth.uid())
              and status = 'open');
