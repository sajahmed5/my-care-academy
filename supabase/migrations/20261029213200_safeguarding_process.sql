-- ============================================================================
-- Safeguarding's own process, and the legal reminders
-- (COMPLAINTS-SAFEGUARDING.md, agreed 29 Oct 2026)
-- ============================================================================
-- A safeguarding concern followed the complaint's seven steps, which ask for
-- an acknowledgement letter and a response in 28 days and never ask whether
-- the council was told. It gets its own six:
--
--   1 Immediate actions to keep the person safe
--   2 Referral to the council's safeguarding team: date and reference
--   3 CQC notification
--   4 Police, if a crime may have happened
--   5 The council's enquiry outcome (Section 42, Care Act 2014)
--   6 Lessons learned, and actions
--
-- Each is a stage, so a company can rename or reorder them as with any other.
-- The complaint-only stages stop applying to safeguarding; the Complaint Form,
-- Carer Statement, Council Correspondence and Other still do. On 29 Oct 2026
-- there are no safeguarding records, so nothing already on one moves.
--
-- complaints.reminders: the legal reminders a manager has confirmed — the
-- council, CQC, police and DBS for safeguarding, RIDDOR for an accident —
-- keyed by reminder, each with when and by whom. The site files nothing;
-- this is the record that someone was told and said it was in hand.
-- ============================================================================

alter table public.complaints
  add column if not exists reminders jsonb not null default '{}'::jsonb;

alter table public.complaint_stages drop constraint complaint_stages_kind_check;
alter table public.complaint_stages add constraint complaint_stages_kind_check
  check (kind in (
    'document', 'complaint_form', 'acknowledgement', 'meeting_minutes',
    'action_plan', 'outcome_letter', 'duty_of_candour', 'monitoring_review',
    'accident_report', 'near_miss_report', 'incident_actions',
    'sg_immediate', 'sg_referral', 'sg_cqc', 'sg_police', 'sg_enquiry', 'sg_lessons'
  ));

insert into public.complaint_stages (organisation_id, name, kind, applies_to, sort_order)
select o.organisation_id, s.name, s.kind, array['safeguarding'], o.top + s.n * 10
from (
  select organisation_id, max(sort_order) as top
  from public.complaint_stages group by organisation_id
) o
cross join (values
  (1, 'Keeping Them Safe', 'sg_immediate'),
  (2, 'Council Referral', 'sg_referral'),
  (3, 'CQC Notification', 'sg_cqc'),
  (4, 'Police', 'sg_police'),
  (5, 'Council Enquiry Outcome', 'sg_enquiry'),
  (6, 'Lessons Learned', 'sg_lessons')
) as s (n, name, kind)
where not exists (
  select 1 from public.complaint_stages x
  where x.organisation_id = o.organisation_id and x.kind = s.kind
);

update public.complaint_stages
set applies_to = array_remove(applies_to, 'safeguarding')
where 'safeguarding' = any (applies_to)
  -- Empty means "every kind", so a stage that was safeguarding's alone stays.
  and cardinality(applies_to) > 1
  and kind not in ('complaint_form', 'sg_immediate', 'sg_referral', 'sg_cqc', 'sg_police', 'sg_enquiry', 'sg_lessons')
  and not (kind = 'document' and lower(btrim(name)) in ('carer statement', 'council correspondence', 'other'));
