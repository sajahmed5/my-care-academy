-- ============================================================================
-- Cheap row-level security, and indexes for the per-page filters.
-- ============================================================================
-- No behaviour change: every policy keeps its name, command, roles and
-- meaning; only *when* its helper functions run changes. No new tables or
-- functions, so no new Data API grants are needed (see AGENTS.md).
--
-- 1. RLS initplans
--    The helpers is_platform_admin(), is_console_user(), current_org_id() are
--    STABLE SQL functions that Postgres inlines into each policy, so every row
--    scanned re-parses the JWT claims (current_setting(...)::jsonb) two or
--    three times. has_feature() and the *_enabled() wrappers are SECURITY
--    DEFINER, so they cannot be inlined at all: each row pays a function call
--    plus two catalogue lookups (organisation_features, tier_features).
--    Wrapping each call as (select fn()) makes the planner run it once per
--    statement as an InitPlan and compare a constant per row. These helpers
--    take no row arguments and are STABLE, so the result is identical.
--    Measured on production as the deployed roles (EXPLAIN ANALYZE, read-only):
--      content_question_stars count, learner     3.25 ms -> 0.27 ms
--      policy_documents list, org_admin         10.9  ms -> 1.8  ms
--    ALTER POLICY is used rather than drop + create: it changes only the
--    expressions, so name, command, roles and PERMISSIVE are untouched and
--    there is no instant at which a table has no policy. Policies that only
--    call (select auth.uid()) or EXISTS over a parent table are already in
--    this form and are left alone.
--
-- 2. Indexes (all tables are small today, so a plain CREATE INDEX inside the
--    migration transaction holds its lock for milliseconds).
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. RLS: helper calls wrapped as (select ...) so they run once per statement
-- ---------------------------------------------------------------------------

-- app_settings
alter policy app_settings_write on public.app_settings
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- audit_logs
alter policy audit_logs_org_admin_read on public.audit_logs
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy audit_logs_platform_admin on public.audit_logs
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- candidate_documents
alter policy candidate_documents_org_admin on public.candidate_documents
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.recruitment_enabled())))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.recruitment_enabled())));
alter policy candidate_documents_platform_admin on public.candidate_documents
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- candidates
alter policy candidates_org_admin on public.candidates
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.recruitment_enabled())))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.recruitment_enabled())));
alter policy candidates_platform_admin on public.candidates
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- care_cert_observations
alter policy cc_obs_org_admin on public.care_cert_observations
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.observations_enabled())))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.observations_enabled())));
alter policy cc_obs_platform_admin on public.care_cert_observations
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- care_cert_signoffs
alter policy cc_signoff_org_admin on public.care_cert_signoffs
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.observations_enabled())))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.observations_enabled())));
alter policy cc_signoff_platform_read on public.care_cert_signoffs
  using ((select public.is_platform_admin()));

-- certificates
alter policy certificates_org_admin_read on public.certificates
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy certificates_platform_admin on public.certificates
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- competency_checks
alter policy competency_checks_org_admin on public.competency_checks
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('people.competency'))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('people.competency'))));
alter policy competency_checks_platform_admin on public.competency_checks
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- complaint_documents / complaint_people / complaint_stage_entries
-- (their org policies are EXISTS over complaints, which inherits the fix)
alter policy complaint_documents_platform_admin on public.complaint_documents
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
alter policy complaint_people_platform_admin on public.complaint_people
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
alter policy complaint_entries_platform_admin on public.complaint_stage_entries
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- complaint_stages
alter policy complaint_stages_org_admin on public.complaint_stages
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))));
alter policy complaint_stages_platform_admin on public.complaint_stages
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- complaints
alter policy complaints_org_admin on public.complaints
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))));
alter policy complaints_platform_admin on public.complaints
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- content_question_stars (the 15.8 ms unfiltered count on every learner page)
alter policy content_question_stars_org_admin_read on public.content_question_stars
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy content_question_stars_platform_admin on public.content_question_stars
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- courses
alter policy courses_write on public.courses
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- email_log
alter policy email_log_org_admin_read on public.email_log
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy email_log_platform_admin on public.email_log
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- enrolments
alter policy enrolments_org_admin_insert on public.enrolments
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy enrolments_org_admin_read on public.enrolments
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy enrolments_org_admin_update on public.enrolments
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy enrolments_platform_admin on public.enrolments
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- form_assignments
alter policy form_assignments_org_admin on public.form_assignments
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('forms.builder'))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('forms.builder'))));
alter policy form_assignments_platform_admin on public.form_assignments
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- form_fields
alter policy form_fields_org_admin_write on public.form_fields
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())));
alter policy form_fields_org_read on public.form_fields
  using (((organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())));
alter policy form_fields_platform_admin on public.form_fields
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- form_responses
alter policy form_responses_org_admin_read on public.form_responses
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy form_responses_own_insert on public.form_responses
  with check (((user_id = (select auth.uid())) AND (organisation_id = (select public.current_org_id()))));
alter policy form_responses_platform_admin on public.form_responses
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- form_submissions
alter policy form_submissions_org_insert on public.form_submissions
  with check (((organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())));
alter policy form_submissions_org_read on public.form_submissions
  using (((organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())));
alter policy form_submissions_platform_admin on public.form_submissions
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- form_templates
alter policy form_templates_platform_admin on public.form_templates
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
alter policy form_templates_read on public.form_templates
  using (((status = 'published'::text) AND (select public.has_feature('forms.builder'))));

-- forms
alter policy forms_org_admin_write on public.forms
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())));
alter policy forms_org_read on public.forms
  using (((organisation_id = (select public.current_org_id())) AND (select public.forms_enabled())));
alter policy forms_platform_admin on public.forms
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- incident_people / incident_training (org policies are EXISTS over incidents)
alter policy incident_people_platform_admin on public.incident_people
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
alter policy incident_training_platform_admin on public.incident_training
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- incidents
alter policy incidents_org_admin on public.incidents
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))));
alter policy incidents_platform_admin on public.incidents
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- issue_reports
alter policy issue_reports_platform_admin on public.issue_reports
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- organisation_features
alter policy organisation_features_org_read on public.organisation_features
  using ((organisation_id = (select public.current_org_id())));
alter policy organisation_features_platform_admin on public.organisation_features
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- organisation_subscriptions
alter policy organisation_subscriptions_platform_admin on public.organisation_subscriptions
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- organisations
alter policy members_read_own_organisation on public.organisations
  using ((id = (select public.current_org_id())));
alter policy platform_admin_all_organisations on public.organisations
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- pathway_courses / pathways
alter policy pathway_courses_write on public.pathway_courses
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
alter policy pathways_write on public.pathways
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- pip_reviews / pip_training (org policies are EXISTS over pips)
alter policy pip_reviews_platform_admin on public.pip_reviews
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
alter policy pip_training_platform_admin on public.pip_training
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- pips
alter policy pips_org_admin on public.pips
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('complaints.register'))));
alter policy pips_platform_admin on public.pips
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- policy_acknowledgements
alter policy policy_ack_org_admin_read on public.policy_acknowledgements
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy policy_ack_own_insert on public.policy_acknowledgements
  with check (((user_id = (select auth.uid())) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('documents.library'))));
alter policy policy_ack_platform_admin on public.policy_acknowledgements
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- policy_documents (has_feature ran once per row: 129 calls per list)
alter policy policy_documents_platform_admin on public.policy_documents
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
alter policy policy_documents_read on public.policy_documents
  using (((status = 'published'::text) AND (select public.has_feature('documents.library'))));

-- quiz_attempts
alter policy quiz_attempts_org_admin_read on public.quiz_attempts
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy quiz_attempts_platform_admin on public.quiz_attempts
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- quiz_questions
alter policy quiz_questions_platform_admin on public.quiz_questions
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- record_actions
alter policy record_actions_org_admin on public.record_actions
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy record_actions_platform_admin on public.record_actions
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- subscription_tiers
alter policy subscription_tiers_rename on public.subscription_tiers
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- supervisions
alter policy supervisions_org_admin on public.supervisions
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('people.supervisions'))))
  with check (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id())) AND (select public.has_feature('people.supervisions'))));
alter policy supervisions_platform_admin on public.supervisions
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- tier_features
alter policy tier_features_delete on public.tier_features
  using ((select public.is_platform_admin()));
alter policy tier_features_insert on public.tier_features
  with check ((select public.is_platform_admin()));

-- topics
alter policy topics_write on public.topics
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- users (learner lists, notifications_read_at read on every learner page)
alter policy org_admin_reads_org_users on public.users
  using (((select public.is_console_user()) AND (organisation_id = (select public.current_org_id()))));
alter policy platform_admin_all_users on public.users
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));


-- ---------------------------------------------------------------------------
-- 2a. Indexes for the console's list pages
-- ---------------------------------------------------------------------------

-- Learner / manager lists: .eq("role", ...).order("full_name") within an org.
-- Leads with organisation_id so it also serves everything users_organisation_id_idx
-- does (that index is now redundant; left in place, drop it separately).
create index if not exists users_org_role_name_idx
  on public.users (organisation_id, role, full_name);

-- "Recent activity": newest audit rows for one organisation, LIMIT 30.
create index if not exists audit_logs_org_created_idx
  on public.audit_logs (organisation_id, created_at desc);

-- Nudge history (.in("type", ...) newest first) and the once-a-day / once-a-week
-- guards in lib/engine.ts and app/platform/org-nudge-actions.ts
-- (organisation_id = ? and type = ? and created_at >= ?).
create index if not exists email_log_org_type_created_idx
  on public.email_log (organisation_id, type, created_at desc);

-- Right-to-erasure lookup by recipient (lib/user-erasure.ts).
create index if not exists email_log_to_email_idx
  on public.email_log (to_email);


-- ---------------------------------------------------------------------------
-- 2b. Covering indexes for unindexed foreign keys (advisor 0001)
-- ---------------------------------------------------------------------------
-- Without these, deleting a user, course, policy, stage or review scans each
-- referencing table to check / cascade / null the reference. The tables are
-- near-empty today, so each build is instant.

create index if not exists competency_checks_assessor_id_idx       on public.competency_checks (assessor_id);
create index if not exists competency_checks_created_by_idx        on public.competency_checks (created_by);
create index if not exists complaint_documents_stage_id_idx        on public.complaint_documents (stage_id);
create index if not exists complaint_documents_uploaded_by_idx     on public.complaint_documents (uploaded_by);
create index if not exists complaint_stage_entries_stage_id_idx    on public.complaint_stage_entries (stage_id);
create index if not exists complaint_stage_entries_updated_by_idx  on public.complaint_stage_entries (updated_by);
create index if not exists complaints_created_by_idx               on public.complaints (created_by);
create index if not exists form_assignments_assigned_by_idx        on public.form_assignments (assigned_by);
create index if not exists form_responses_template_id_idx          on public.form_responses (template_id);
create index if not exists incident_training_assigned_by_idx       on public.incident_training (assigned_by);
create index if not exists incident_training_course_id_idx         on public.incident_training (course_id);
create index if not exists incidents_created_by_idx                on public.incidents (created_by);
create index if not exists pip_reviews_completed_by_idx            on public.pip_reviews (completed_by);
create index if not exists pip_training_review_id_idx              on public.pip_training (review_id);
create index if not exists pips_created_by_idx                     on public.pips (created_by);
create index if not exists pips_manager_signed_by_idx              on public.pips (manager_signed_by);
create index if not exists pips_owner_id_idx                       on public.pips (owner_id);
create index if not exists policy_acknowledgements_policy_id_idx   on public.policy_acknowledgements (policy_id);
create index if not exists record_actions_completed_by_idx         on public.record_actions (completed_by);
create index if not exists record_actions_created_by_idx           on public.record_actions (created_by);
create index if not exists supervisions_created_by_idx             on public.supervisions (created_by);
create index if not exists supervisions_supervisor_id_idx          on public.supervisions (supervisor_id);
