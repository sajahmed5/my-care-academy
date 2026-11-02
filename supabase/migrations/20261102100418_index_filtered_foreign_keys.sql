-- Indexes on the foreign keys the app filters or joins on (QA review Q8,
-- Saj, 2 Nov 2026). The performance advisor listed 131 foreign keys without
-- a covering index; most are created_by / updated_by style author columns
-- that nothing filters on, and those are left alone. Indexed here: every
-- organisation_id (every console read filters on it), and the columns that
-- lists, pickers and joins look up.
create index if not exists absence_welfare_meetings_organisation_id_idx on public.absence_welfare_meetings (organisation_id);
create index if not exists alert_deliveries_organisation_id_idx on public.alert_deliveries (organisation_id);
create index if not exists appraisal_self_assessments_organisation_id_idx on public.appraisal_self_assessments (organisation_id);
create index if not exists candidate_letters_organisation_id_idx on public.candidate_letters (organisation_id);
create index if not exists candidate_shadowing_organisation_id_idx on public.candidate_shadowing (organisation_id);
create index if not exists candidate_signings_organisation_id_idx on public.candidate_signings (organisation_id);
create index if not exists candidate_starter_forms_organisation_id_idx on public.candidate_starter_forms (organisation_id);
create index if not exists classroom_attendance_organisation_id_idx on public.classroom_attendance (organisation_id);
create index if not exists feedback_actions_organisation_id_idx on public.feedback_actions (organisation_id);
create index if not exists feedback_invitations_organisation_id_idx on public.feedback_invitations (organisation_id);
create index if not exists feedback_responses_organisation_id_idx on public.feedback_responses (organisation_id);
create index if not exists hr_case_meetings_organisation_id_idx on public.hr_case_meetings (organisation_id);
create index if not exists hr_case_notes_organisation_id_idx on public.hr_case_notes (organisation_id);
create index if not exists hr_case_statements_organisation_id_idx on public.hr_case_statements (organisation_id);
create index if not exists hr_letters_organisation_id_idx on public.hr_letters (organisation_id);
create index if not exists hr_references_given_organisation_id_idx on public.hr_references_given (organisation_id);
create index if not exists policy_reminder_log_organisation_id_idx on public.policy_reminder_log (organisation_id);
create index if not exists report_request_messages_organisation_id_idx on public.report_request_messages (organisation_id);
create index if not exists report_schedules_organisation_id_idx on public.report_schedules (organisation_id);
create index if not exists report_sends_organisation_id_idx on public.report_sends (organisation_id);
create index if not exists staff_audit_training_organisation_id_idx on public.staff_audit_training (organisation_id);
-- Looked up by lists, pickers and joins.
create index if not exists ai_usage_user_id_idx on public.ai_usage (user_id);
create index if not exists classroom_attendance_certificate_id_idx on public.classroom_attendance (certificate_id);
create index if not exists classroom_sessions_course_id_idx on public.classroom_sessions (course_id);
create index if not exists complaint_training_course_id_idx on public.complaint_training (course_id);
create index if not exists face_to_face_bookings_certificate_id_idx on public.face_to_face_bookings (certificate_id);
create index if not exists face_to_face_sessions_course_id_idx on public.face_to_face_sessions (course_id);
create index if not exists feedback_invitations_user_id_idx on public.feedback_invitations (user_id);
create index if not exists feedback_responses_invitation_id_idx on public.feedback_responses (invitation_id);
create index if not exists feedback_responses_complaint_id_idx on public.feedback_responses (complaint_id);
create index if not exists feedback_responses_compliment_id_idx on public.feedback_responses (compliment_id);
create index if not exists form_log_entries_template_id_idx on public.form_log_entries (template_id);
create index if not exists form_responses_review_of_idx on public.form_responses (review_of);
create index if not exists form_templates_based_on_id_idx on public.form_templates (based_on_id);
create index if not exists hr_cases_about_user_id_idx on public.hr_cases (about_user_id);
create index if not exists hr_cases_investigator_id_idx on public.hr_cases (investigator_id);
create index if not exists hr_cases_appeal_manager_id_idx on public.hr_cases (appeal_manager_id);
create index if not exists integration_sync_runs_key_id_idx on public.integration_sync_runs (key_id);
create index if not exists organisation_form_settings_template_id_idx on public.organisation_form_settings (template_id);
create index if not exists organisation_policies_policy_id_idx on public.organisation_policies (policy_id);
create index if not exists policy_documents_replaced_by_idx on public.policy_documents (replaced_by);
create index if not exists report_sends_schedule_id_idx on public.report_sends (schedule_id);
create index if not exists staff_audit_bookings_supervision_id_idx on public.staff_audit_bookings (supervision_id);
create index if not exists staff_audit_bookings_with_user_id_idx on public.staff_audit_bookings (with_user_id);
create index if not exists staff_audit_training_course_id_idx on public.staff_audit_training (course_id);
create index if not exists supervisions_booking_id_idx on public.supervisions (booking_id);
create index if not exists client_qas_compliment_id_idx on public.client_qas (compliment_id);
create index if not exists audits_auditor_id_idx on public.audits (auditor_id);
create index if not exists spot_checks_assessor_id_idx on public.spot_checks (assessor_id);
