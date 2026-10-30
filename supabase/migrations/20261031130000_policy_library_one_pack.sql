-- ============================================================================
-- The policy library becomes one pack (POLICIES.md, "Clean-up")
-- ============================================================================
-- 43 published "policies", but the CQC-basics, full and add-on packs repeated
-- the same titles ("Complaints Policy" three times over), so a company saw
-- about 25 different ones, several of them twice. Since 29 Oct 2026 the packs
-- are sold together in Pro, so there is nothing left to tell apart.
--
--   1. The four forms filed as policies (client QA review, medication
--      competency observation, missed or late visit investigation, new client
--      welcome call) become form drafts beside the other 86. Their add-ons
--      (Service audits, Staff Audits, Concerns, Forms) carry their questions;
--      the rows stay so Forms can take their text across.
--   2. Of each duplicated title, one is kept: the copy a company has adopted,
--      else the full pack's. The texts are identical (checked by md5 on
--      31 Oct 2026), so "keeping the fuller version" loses nothing. The rest
--      are retired, not deleted: an acceptance or an adopted copy hangs off
--      the row (on delete cascade), and the history must survive.
--   3. Domiciliary and residential versions stay apart where they differ — a
--      company sees the one for its service type. The employee handbook is
--      the same text in both, so it becomes one row for every service.
--   4. Every kept policy is in pack 'full', with no collection, a plain title
--      (no "Policy" on the end) and a topic as its category.
--   5. policy_documents_read stops asking which pack: published policies are
--      readable by anyone whose package has documents.library. Forms and logs
--      are no longer readable from the library at all — they move to Forms.
--
-- Safe for the code that is live now: it lists packs 'basic' and 'full' to an
-- organisation with both keys (every Pro and Enterprise one), and every kept
-- row is 'full'. No organisation is on a package with only one of the keys.
-- On 31 Oct 2026 one copy exists (Demo Care, the QA organisation, a draft of
-- the domiciliary Consent policy) and no acceptances.
-- ============================================================================

-- 1. Forms filed as policies.
update public.policy_documents
   set kind = 'form', status = 'draft'
 where code in (
   'MCA-DOM-CLIENT-QUALITY-ASSURANCE-REVIEW-F0EE',
   'MCA-DOM-MEDICATION-COMPETENCY-OBSERVATION-E289',
   'MCA-DOM-MISSED-OR-LATE-VISIT-INVESTIGATION-F340',
   'MCA-DOM-NEW-CLIENT-WELCOME-CALL-EBF7'
 );

-- 2. Duplicates: retired → kept.
create temporary table policy_merge (retired text primary key, kept text not null);
insert into policy_merge (retired, kept) values
  ('MCA-DOM-COMPLAINTS-POLICY-1F2B',                       'MCA-DOM-COMPLAINTS-POLICY-BBBA'),
  ('MCA-ADD-COMPLAINTS-POLICY-939C',                       'MCA-DOM-COMPLAINTS-POLICY-BBBA'),
  ('MCA-DOM-CONSENT-POLICY-FDF7',                          'MCA-DOM-CONSENT-POLICY-BB81'),
  ('MCA-RES-EMPLOYEE-HANDBOOK-A9F3',                       'MCA-DOM-EMPLOYEE-HANDBOOK-DF84'),
  ('MCA-DOM-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-POLI-2067', 'MCA-DOM-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-POLI-73A3'),
  ('MCA-DOM-GOVERNANCE-AND-QUALITY-ASSURANCE-POLICY-DBC2', 'MCA-DOM-GOVERNANCE-AND-QUALITY-ASSURANCE-POLICY-988F'),
  ('MCA-DOM-INFECTION-PREVENTION-AND-CONTROL-POLICY-2CC4', 'MCA-DOM-INFECTION-PREVENTION-AND-CONTROL-POLICY-622E'),
  ('MCA-DOM-MEDICINES-MANAGEMENT-POLICY-7C23',             'MCA-DOM-MEDICINES-MANAGEMENT-POLICY-7196'),
  ('MCA-DOM-RECRUITMENT-POLICY-63E1',                      'MCA-DOM-RECRUITMENT-POLICY-5314'),
  ('MCA-ADD-RECRUITMENT-POLICY-F4A6',                      'MCA-DOM-RECRUITMENT-POLICY-5314'),
  ('MCA-DOM-SAFEGUARDING-POLICY-477F',                     'MCA-DOM-SAFEGUARDING-POLICY-0443'),
  ('MCA-ADD-WHISTLEBLOWING-POLICY-DOMICILIARY-CARE-38CF',  'MCA-DOM-WHISTLEBLOWING-POLICY-4AE7');

-- A copy adopted from a retired duplicate moves to the kept row, with its
-- acceptances — unless the same company already has a copy of the kept one.
with m as (
  select r.id as retired_id, k.id as kept_id
    from policy_merge pm
    join public.policy_documents r on r.code = pm.retired
    join public.policy_documents k on k.code = pm.kept
), moved as (
  update public.organisation_policies op
     set policy_id = m.kept_id, updated_at = now()
    from m
   where op.policy_id = m.retired_id
     and not exists (
       select 1 from public.organisation_policies o2
        where o2.organisation_id = op.organisation_id and o2.policy_id = m.kept_id
     )
  returning op.id, m.kept_id
)
update public.policy_acknowledgements a
   set policy_id = moved.kept_id
  from moved
 where a.organisation_policy_id = moved.id;

update public.policy_documents
   set status = 'retired'
 where code in (select retired from policy_merge);

drop table policy_merge;

-- 3 and 4. The kept policies: one pack, plain titles, topics, service versions.
update public.policy_documents p
   set pack = 'full',
       collection = null,
       title = v.title,
       category = v.category,
       sort_order = v.sort_order,
       service_types = v.service_types
  from (values
    -- Care and support
    ('MCA-DOM-CONSENT-POLICY-BB81',                          'Consent',                                'Care and support', 10, array['homecare']),
    ('MCA-RES-CONSENT-463B',                                 'Consent',                                'Care and support', 10, array['care_home']),
    ('MCA-RES-PERSON-CENTRED-CARE-PLANNING-E8FB',            'Person-Centred Care Planning',           'Care and support', 20, array['care_home']),
    ('MCA-RES-POSITIVE-BEHAVIOUR-SUPPORT-1589',              'Positive Behaviour Support',             'Care and support', 30, array['care_home']),
    ('MCA-RES-RESTRAINT-B599',                               'Restraint',                              'Care and support', 40, array['care_home']),
    -- Safeguarding and concerns
    ('MCA-DOM-SAFEGUARDING-POLICY-0443',                     'Safeguarding',                           'Safeguarding and concerns', 10, array['homecare']),
    ('MCA-RES-SAFEGUARDING-E6D6',                            'Safeguarding',                           'Safeguarding and concerns', 10, array['care_home']),
    ('MCA-DOM-WHISTLEBLOWING-POLICY-4AE7',                   'Whistleblowing',                         'Safeguarding and concerns', 20, array['homecare']),
    ('MCA-RES-WHISTLEBLOWING-07AC',                          'Whistleblowing',                         'Safeguarding and concerns', 20, array['care_home']),
    ('MCA-DOM-COMPLAINTS-POLICY-BBBA',                       'Complaints',                             'Safeguarding and concerns', 30, array['homecare']),
    ('MCA-RES-COMPLAINTS-A19E',                              'Complaints',                             'Safeguarding and concerns', 30, array['care_home']),
    ('MCA-ADD-DUTY-OF-CANDOUR-POLICY-DOMICILIARY-CARE-E129', 'Duty of Candour',                        'Safeguarding and concerns', 40, array['homecare']),
    ('MCA-RES-DUTY-OF-CANDOUR-969D',                         'Duty of Candour',                        'Safeguarding and concerns', 40, array['care_home']),
    ('MCA-RES-REPORTABLE-INCIDENTS-FA50',                    'Reportable Incidents',                   'Safeguarding and concerns', 50, array['care_home']),
    -- Medicines and health
    ('MCA-DOM-MEDICINES-MANAGEMENT-POLICY-7196',             'Medicines Management',                   'Medicines and health', 10, array['homecare']),
    ('MCA-RES-MEDICINES-MANAGEMENT-987E',                    'Medicines Management',                   'Medicines and health', 10, array['care_home']),
    ('MCA-DOM-INFECTION-PREVENTION-AND-CONTROL-POLICY-622E', 'Infection Prevention and Control',       'Medicines and health', 20, array['homecare']),
    ('MCA-RES-INFECTION-PREVENTION-AND-CONTROL-239C',        'Infection Prevention and Control',       'Medicines and health', 20, array['care_home']),
    -- Health and safety
    ('MCA-RES-RISK-MANAGEMENT-7A3D',                         'Risk Management',                        'Health and safety', 10, array['care_home']),
    ('MCA-RES-SAFETY-AND-SECURITY-OF-PREMISES-F576',         'Safety and Security of Premises',        'Health and safety', 20, array['care_home']),
    -- Staff and employment
    ('MCA-DOM-RECRUITMENT-POLICY-5314',                      'Recruitment',                            'Staff and employment', 10, array['homecare']),
    ('MCA-RES-RECRUITMENT-2663',                             'Recruitment',                            'Staff and employment', 10, array['care_home']),
    ('MCA-DOM-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-POLI-73A3', 'Equality, Diversity and Human Rights',  'Staff and employment', 20, array['homecare']),
    ('MCA-RES-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-8D19',     'Equality, Diversity and Human Rights',   'Staff and employment', 20, array['care_home']),
    ('MCA-DOM-EMPLOYEE-HANDBOOK-DF84',                       'Employee Handbook',                      'Staff and employment', 90, null),
    -- Governance and quality
    ('MCA-DOM-GOVERNANCE-AND-QUALITY-ASSURANCE-POLICY-988F', 'Governance and Quality Assurance',       'Governance and quality', 10, array['homecare']),
    ('MCA-RES-GOVERNANCE-AND-QUALITY-ASSURANCE-9FDE',        'Governance and Quality Assurance',       'Governance and quality', 10, array['care_home'])
  ) as v(code, title, category, sort_order, service_types)
 where p.code = v.code;

-- 5. Read by package, not by pack. Policies only.
alter policy policy_documents_read on public.policy_documents
  using (
    status = 'published'
    and kind = 'policy'
    and (select public.has_feature('documents.library'))
  );

-- Checked on the way in: 27 published policies, every one in the one pack.
do $$
declare n int; stray int;
begin
  select count(*) into n from public.policy_documents where status = 'published' and kind = 'policy';
  select count(*) into stray from public.policy_documents
   where status = 'published' and (kind <> 'policy' or pack <> 'full' or collection is not null);
  if n <> 27 or stray <> 0 then
    raise exception 'Policy clean-up left % published policies and % strays', n, stray;
  end if;
end $$;
