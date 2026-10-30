-- ============================================================================
-- Forms: logs (FORMS.md, "How they work")
-- ============================================================================
-- A log is a form you add a line to each time: the date, who did it, the
-- result. The whole log reads as one table. They replace the spreadsheet logs
-- in the document library (23 of them, plus the tumble dryer filter check).
--
--   form_templates.is_log            a log rather than a form
--   form_templates.log_person_label  what the "who" column is called on this
--                                    log: "Checked by", "Champion", "Chaired by"
--   form_log_entries                 one line: its date, who did it, the
--                                    answers to the log's columns, and — on a
--                                    log about residents — which client
--
-- A line is the office's own record, inserted as the person typing it, and
-- can be taken back out by them on the day only; after that it is a record.
--
-- The logs below are written from the spreadsheets, merged where the
-- domiciliary and residential packs repeat one. Seven spreadsheets are not
-- logs here, because the platform already does the job one way (FORMS.md:
-- "there's one way to do each thing"):
--   Complaints Log (x3) and the Incident, Safeguarding and Notifications Log
--   (x3)                          -> Complaints & safeguarding
--   Staff Training, Supervision and DBS Records (x3)
--                                 -> the training matrix, Staff Audits, HR pack
--   the audit schedule in Quality Audits and Governance Meeting Minutes (x2)
--                                 -> Service audits (its meeting log is here)
--   Assessment Matrix             -> review dates and Form reviews due
--   Care Home Inspection Questions -> a company form (it is a checklist)
--   Financial Forecast            -> not a log: a start-up business model
-- The weekly activity schedule, weekly menu grid and weekly rota become the
-- activity participation, daily menu and shift attendance logs.
--
-- Seeded as drafts: they are published once the code that shows logs is live.
-- ============================================================================

alter table public.form_templates
  add column if not exists is_log boolean not null default false,
  add column if not exists log_person_label text;

create table if not exists public.form_log_entries (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  template_id      uuid not null references public.form_templates (id) on delete cascade,
  template_version integer not null default 1,
  entry_date       date not null,
  -- Who did it: a member of staff, or a name for someone who is not (a
  -- visiting engineer). recorded_by is who typed the line.
  done_by          uuid references public.users (id) on delete set null,
  done_by_name     text,
  client_id        uuid references public.clients (id) on delete set null,
  answers          jsonb not null default '{}'::jsonb,
  recorded_by      uuid not null references public.users (id) on delete cascade,
  created_at       timestamptz not null default now()
);

create index if not exists form_log_entries_log_idx
  on public.form_log_entries (organisation_id, template_id, entry_date desc);
create index if not exists form_log_entries_client_idx
  on public.form_log_entries (client_id, entry_date desc) where client_id is not null;

-- Grants (AGENTS.md; this project still auto-grants, so revoke first).
revoke all on public.form_log_entries from anon;
revoke all on public.form_log_entries from authenticated;
grant select, insert, update, delete on public.form_log_entries to service_role;
grant select, insert, delete on public.form_log_entries to authenticated;

alter table public.form_log_entries enable row level security;

create policy form_log_entries_platform_admin on public.form_log_entries for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy form_log_entries_console_read on public.form_log_entries for select to authenticated
  using (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('forms.builder'))
  );

create policy form_log_entries_console_insert on public.form_log_entries for insert to authenticated
  with check (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and (select public.has_feature('forms.builder'))
    and recorded_by = (select auth.uid())
    and (
      client_id is null
      or exists (select 1 from public.clients c where c.id = client_id and c.organisation_id = (select public.current_org_id()))
    )
    and (
      done_by is null
      or exists (select 1 from public.users u where u.id = done_by and u.organisation_id = (select public.current_org_id()))
    )
  );

-- A line typed by mistake can be taken out by whoever typed it, that day.
create policy form_log_entries_own_delete on public.form_log_entries for delete to authenticated
  using (
    recorded_by = (select auth.uid())
    and organisation_id = (select public.current_org_id())
    and created_at > now() - interval '1 day'
  );

-- ----------------------------------------------------------------------------
-- The logs
-- ----------------------------------------------------------------------------
insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-FRIDGE-FREEZER', 'Fridge and freezer temperature checks', 'One line for each fridge or freezer each time it is checked. Fridges should read 1–5°C and freezers -18°C or colder; a reading outside that is flagged.', 'other', 'full', 'company', true, 'Checked by', array['residential']::text[],
  '[{"id": "appliance", "label": "Appliance (kitchen fridge 1, medicines fridge…)", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "kind", "label": "Which is it?", "type": "radio", "options": ["Fridge", "Freezer"], "required": true, "conditional": null, "sort_order": 1}, {"id": "time", "label": "Time checked", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 2}, {"id": "temp_fridge", "label": "Temperature (°C)", "type": "number", "options": [], "required": true, "conditional": {"whenFieldId": "kind", "equals": "Fridge"}, "sort_order": 3, "min": 1, "max": 5}, {"id": "temp_freezer", "label": "Temperature (°C)", "type": "number", "options": [], "required": true, "conditional": {"whenFieldId": "kind", "equals": "Freezer"}, "sort_order": 4, "max": -18}, {"id": "action", "label": "Action taken if out of range", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 5}]'::jsonb, 'draft', 200)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-BEDROOM-TEMPERATURES', 'Bedroom temperatures', 'Room temperatures checked each day. 16–21°C is the comfortable range for older people; a reading outside it is flagged.', 'other', 'full', 'company', true, 'Checked by', array['residential']::text[],
  '[{"id": "room", "label": "Room or bedroom", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "time", "label": "Time checked", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 1}, {"id": "temp", "label": "Temperature (°C)", "type": "number", "options": [], "required": true, "conditional": null, "sort_order": 2, "min": 16, "max": 21}, {"id": "action", "label": "Action taken if out of range", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 3}]'::jsonb, 'draft', 201)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-TMV-CHECKS', 'TMV water temperature checks', 'Weekly checks of each thermostatic mixing valve. Mixed water at a bath or shower should not go above 43°C; a reading above it is flagged.', 'other', 'full', 'company', true, 'Checked by', array['residential']::text[],
  '[{"id": "tmv", "label": "TMV and where it is", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "temp", "label": "Mixed water outlet temperature (°C)", "type": "number", "options": [], "required": true, "conditional": null, "sort_order": 1, "max": 43}, {"id": "action", "label": "Action taken if out of range", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 2}]'::jsonb, 'draft', 202)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-TUMBLE-DRYER', 'Tumble dryer filter checks', 'The lint filter on each dryer is cleaned after every load and the check recorded — blocked filters are a common cause of laundry fires.', 'other', 'full', 'company', true, 'Checked by', array['residential']::text[],
  '[{"id": "dryer", "label": "Dryer", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "cleaned", "label": "Lint filter cleaned?", "type": "radio", "options": ["Yes", "No"], "required": true, "conditional": null, "sort_order": 1}, {"id": "condition", "label": "Condition of the filter and seal", "type": "radio", "options": ["Good", "Damaged — reported"], "required": false, "conditional": null, "sort_order": 2}, {"id": "notes", "label": "Notes or action taken", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 3}]'::jsonb, 'draft', 203)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-MOBILITY-CHECKS', 'Mobility aid and equipment checks', 'The visual check before use of hoists, slings, wheelchairs, walking aids and other moving and handling equipment.', 'other', 'full', 'company', true, 'Checked by', array['residential']::text[],
  '[{"id": "equipment", "label": "Equipment (ID and type)", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "safe", "label": "Visually safe to use?", "type": "radio", "options": ["Yes", "No"], "required": true, "conditional": null, "sort_order": 1}, {"id": "issue", "label": "What is wrong with it", "type": "textarea", "options": [], "required": true, "conditional": {"whenFieldId": "safe", "equals": "No"}, "sort_order": 2}, {"id": "action", "label": "Action taken, and who it was reported to", "type": "textarea", "options": [], "required": true, "conditional": {"whenFieldId": "safe", "equals": "No"}, "sort_order": 3}]'::jsonb, 'draft', 204)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-EQUIPMENT-SERVICING', 'Equipment servicing and LOLER inspections', 'Each service or thorough examination of lifting and mobility equipment. Hoists and slings need a LOLER examination every six months.', 'other', 'full', 'company', true, 'Arranged by', null,
  '[{"id": "equipment", "label": "Equipment (ID and type)", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "location", "label": "Where it is, or who it is assigned to", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 1}, {"id": "service", "label": "What was done", "type": "radio", "options": ["Routine service", "LOLER thorough examination", "Repair"], "required": true, "conditional": null, "sort_order": 2}, {"id": "engineer", "label": "Engineer or company", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 3}, {"id": "result", "label": "Result", "type": "radio", "options": ["Passed", "Passed with actions", "Failed — taken out of use"], "required": true, "conditional": null, "sort_order": 4}, {"id": "actions", "label": "Actions needed", "type": "textarea", "options": [], "required": false, "conditional": {"whenFieldId": "result", "equals": "Passed with actions"}, "sort_order": 5}, {"id": "next_due", "label": "Next service due", "type": "date", "options": [], "required": false, "conditional": null, "sort_order": 6}, {"id": "certificate", "label": "Report or certificate", "type": "file", "options": [], "required": false, "conditional": null, "sort_order": 7}]'::jsonb, 'draft', 205)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-PREMISES-CERTIFICATES', 'Premises certificates', 'Each certificate or piece of premises evidence as it is obtained or renewed, with its expiry date and a copy.', 'other', 'full', 'company', true, 'Recorded by', null,
  '[{"id": "document", "label": "Certificate or document", "type": "select", "options": ["Gas safety certificate (CP12)", "Electrical installation condition report (EICR)", "Portable appliance testing (PAT)", "Fire risk assessment", "Fire alarm and emergency lighting service", "Legionella risk assessment", "Legionella water sampling", "Public liability insurance", "Employer''s liability insurance", "Planning permission or change of use", "Building control final certificate", "Floor plan", "Evidence of legal occupancy (deed, lease or tenancy)", "Other"], "required": true, "conditional": null, "sort_order": 0}, {"id": "other", "label": "Which document", "type": "text", "options": [], "required": true, "conditional": {"whenFieldId": "document", "equals": "Other"}, "sort_order": 1}, {"id": "provider", "label": "Issued or provided by", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 2}, {"id": "expiry", "label": "Expiry or renewal date", "type": "date", "options": [], "required": false, "conditional": null, "sort_order": 3}, {"id": "filed", "label": "Where the original is filed", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 4}, {"id": "copy", "label": "Copy of the certificate", "type": "file", "options": [], "required": false, "conditional": null, "sort_order": 5}]'::jsonb, 'draft', 206)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-ACTIVITY-PARTICIPATION', 'Activity participation', 'Who took part in which activities, to show each resident is offered meaningful activity and what they enjoy.', 'other', 'full', 'client', true, 'Recorded by', array['residential']::text[],
  '[{"id": "activity", "label": "Activity", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "participated", "label": "Took part?", "type": "radio", "options": ["Yes", "No — declined", "No — unwell or away"], "required": true, "conditional": null, "sort_order": 1}, {"id": "notes", "label": "Enjoyment and engagement", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 2}]'::jsonb, 'draft', 207)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-DAILY-MENU', 'Daily menu', 'What was on the menu each day, with an alternative at each main meal. Individual diets and allergies belong in each resident''s care plan.', 'other', 'full', 'company', true, 'Planned by', array['residential']::text[],
  '[{"id": "breakfast", "label": "Breakfast", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 0}, {"id": "mid_morning", "label": "Mid-morning snack and drink", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 1}, {"id": "lunch", "label": "Lunch", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 2}, {"id": "lunch_alt", "label": "Lunch alternative", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 3}, {"id": "dessert", "label": "Dessert", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 4}, {"id": "afternoon", "label": "Afternoon snack and drink", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 5}, {"id": "evening", "label": "Evening meal", "type": "text", "options": [], "required": true, "conditional": null, "sort_order": 6}, {"id": "evening_alt", "label": "Evening meal alternative", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 7}, {"id": "supper", "label": "Supper or bedtime snack", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 8}]'::jsonb, 'draft', 208)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-CHAMPIONS', 'Champions register', 'Each champion as they are appointed or refreshed: the role, what they lead on, and when it is next reviewed.', 'other', 'full', 'company', true, 'Champion', null,
  '[{"id": "role", "label": "Champion role", "type": "select", "options": ["Infection prevention and control", "Dementia care", "Nutrition and hydration", "Falls prevention", "Tissue viability and pressure ulcer prevention", "Medication", "Dignity and human rights", "End of life and palliative care", "Health and safety, and fire safety", "Activities and wellbeing", "Safeguarding", "Mental Capacity Act and DoLS", "Continence care", "Oral health", "Digital and technology", "Equality, diversity and inclusion"], "required": true, "conditional": null, "sort_order": 0}, {"id": "responsibilities", "label": "Key responsibilities", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 1}, {"id": "training", "label": "Specialist training completed", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 2}, {"id": "next_review", "label": "Next review", "type": "date", "options": [], "required": false, "conditional": null, "sort_order": 3}]'::jsonb, 'draft', 209)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-GOVERNANCE-MEETINGS', 'Governance meeting log', 'A summary of each governance or management meeting: who came, what was decided and the actions agreed.', 'other', 'full', 'company', true, 'Chaired by', null,
  '[{"id": "attendees", "label": "Attendees", "type": "textarea", "options": [], "required": true, "conditional": null, "sort_order": 0}, {"id": "agenda", "label": "Key agenda items", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 1}, {"id": "decisions", "label": "Decisions made", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 2}, {"id": "actions", "label": "Actions agreed", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 3}, {"id": "owner", "label": "Action owner", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 4}, {"id": "due", "label": "Actions due by", "type": "date", "options": [], "required": false, "conditional": null, "sort_order": 5}, {"id": "status", "label": "Actions", "type": "radio", "options": ["Open", "Complete"], "required": false, "conditional": null, "sort_order": 6}]'::jsonb, 'draft', 210)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';

insert into public.form_templates (code, title, description, category, pack, audience, is_log, log_person_label, service_types, fields, status, sort_order)
values ('MCA-LOG-SHIFT-ATTENDANCE', 'Shift attendance', 'Each shift as worked against the rota, with the reason for any difference of more than ten minutes.', 'other', 'full', 'company', true, 'Staff member', array['residential']::text[],
  '[{"id": "shift", "label": "Shift", "type": "radio", "options": ["Early", "Late", "Day", "Long day", "Night"], "required": true, "conditional": null, "sort_order": 0}, {"id": "sched_start", "label": "Rota start (HH:MM)", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 1}, {"id": "actual_start", "label": "Actual start (HH:MM)", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 2}, {"id": "sched_end", "label": "Rota end (HH:MM)", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 3}, {"id": "actual_end", "label": "Actual end (HH:MM)", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 4}, {"id": "reason", "label": "Reason for any difference", "type": "textarea", "options": [], "required": false, "conditional": null, "sort_order": 5}, {"id": "signed_off", "label": "Signed off by", "type": "text", "options": [], "required": false, "conditional": null, "sort_order": 6}]'::jsonb, 'draft', 211)
on conflict (code) do update set title = excluded.title, description = excluded.description, audience = excluded.audience,
  is_log = true, log_person_label = excluded.log_person_label, service_types = excluded.service_types, fields = excluded.fields
  where public.form_templates.status = 'draft';
