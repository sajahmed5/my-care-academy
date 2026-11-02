-- ============================================================================
-- A company's copy outlives the template it was adopted from.
-- ============================================================================
-- policy_documents_read shows published templates only. That is right for the
-- library — nobody should adopt a retired template — but a company's copy
-- (organisation_policies) points at its template for its code and title. Retire
-- the template and the copy's page went 404 and every reading view called it
-- "Policy", acceptances and all. The 27 older templates were retired on
-- 1 Nov 2026 with only one adopter (Demo Care, a test org); the next
-- retirement will not be so lucky.
--
-- So a second read rule: whatever its status, a template is readable by the
-- organisation that holds a copy of it. The subquery runs under
-- organisation_policies' own RLS, so console users see the templates behind
-- their drafts and published copies, and staff only those behind published
-- ones — the same rows they can already read. The library list keeps asking
-- for status = 'published' itself, and adopting checks the status, so a
-- retired template is still never offered.
--
-- No new table, so no new grants: authenticated already has select.
-- ============================================================================

create policy policy_documents_adopted_read on public.policy_documents for select to authenticated
  using (
    kind = 'policy'
    and (select public.has_feature('documents.library'))
    and exists (
      select 1 from public.organisation_policies op
       where op.policy_id = policy_documents.id
         and op.organisation_id = (select public.current_org_id())
    )
  );

-- ============================================================================
-- What a retired template was replaced by, so a company holding a copy of it
-- can be told where the new one is.
-- ============================================================================
alter table public.policy_documents
  add column replaced_by uuid references public.policy_documents (id) on delete set null;

comment on column public.policy_documents.replaced_by is
  'The template that replaced this one when it was retired; shown to companies holding a copy.';

-- The 27 older policies, rewritten under new codes and retired on 1 Nov 2026
-- (content/POLICY-READING-NOTES.md, "The 27 older policies, rewritten").
update public.policy_documents p
   set replaced_by = n.id
  from (values
    ('MCA-RES-CONSENT-463B',                                  'MCA-RES-CONSENT'),
    ('MCA-DOM-CONSENT-POLICY-BB81',                           'MCA-DOM-CONSENT'),
    ('MCA-RES-PERSON-CENTRED-CARE-PLANNING-E8FB',             'MCA-RES-PERSON-CENTRED-CARE-PLANNING'),
    ('MCA-RES-POSITIVE-BEHAVIOUR-SUPPORT-1589',               'MCA-RES-POSITIVE-BEHAVIOUR-SUPPORT'),
    ('MCA-RES-RESTRAINT-B599',                                'MCA-RES-RESTRAINT'),
    ('MCA-DOM-GOVERNANCE-AND-QUALITY-ASSURANCE-POLICY-988F',  'MCA-DOM-GOVERNANCE'),
    ('MCA-RES-GOVERNANCE-AND-QUALITY-ASSURANCE-9FDE',         'MCA-RES-GOVERNANCE'),
    ('MCA-RES-RISK-MANAGEMENT-7A3D',                          'MCA-RES-RISK-MANAGEMENT'),
    ('MCA-RES-SAFETY-AND-SECURITY-OF-PREMISES-F576',          'MCA-RES-PREMISES-SECURITY'),
    ('MCA-RES-MEDICINES-MANAGEMENT-987E',                     'MCA-RES-MEDICINES'),
    ('MCA-DOM-MEDICINES-MANAGEMENT-POLICY-7196',              'MCA-DOM-MEDICINES'),
    ('MCA-RES-INFECTION-PREVENTION-AND-CONTROL-239C',         'MCA-RES-INFECTION-CONTROL'),
    ('MCA-DOM-INFECTION-PREVENTION-AND-CONTROL-POLICY-622E',  'MCA-DOM-INFECTION-CONTROL'),
    ('MCA-RES-SAFEGUARDING-E6D6',                             'MCA-RES-SAFEGUARDING'),
    ('MCA-DOM-SAFEGUARDING-POLICY-0443',                      'MCA-DOM-SAFEGUARDING'),
    ('MCA-DOM-WHISTLEBLOWING-POLICY-4AE7',                    'MCA-DOM-WHISTLEBLOWING'),
    ('MCA-RES-WHISTLEBLOWING-07AC',                           'MCA-RES-WHISTLEBLOWING'),
    ('MCA-DOM-COMPLAINTS-POLICY-BBBA',                        'MCA-DOM-COMPLAINTS'),
    ('MCA-RES-COMPLAINTS-A19E',                               'MCA-RES-COMPLAINTS'),
    ('MCA-ADD-DUTY-OF-CANDOUR-POLICY-DOMICILIARY-CARE-E129',  'MCA-DOM-DUTY-OF-CANDOUR'),
    ('MCA-RES-DUTY-OF-CANDOUR-969D',                          'MCA-RES-DUTY-OF-CANDOUR'),
    ('MCA-RES-REPORTABLE-INCIDENTS-FA50',                     'MCA-RES-REPORTABLE-INCIDENTS'),
    ('MCA-DOM-RECRUITMENT-POLICY-5314',                       'MCA-DOM-RECRUITMENT'),
    ('MCA-RES-RECRUITMENT-2663',                              'MCA-RES-RECRUITMENT'),
    ('MCA-DOM-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-POLI-73A3', 'MCA-DOM-EQUALITY'),
    ('MCA-RES-EQUALITY-DIVERSITY-AND-HUMAN-RIGHTS-8D19',      'MCA-RES-EQUALITY'),
    ('MCA-DOM-EMPLOYEE-HANDBOOK-DF84',                        'MCA-ALL-EMPLOYEE-HANDBOOK')
  ) as m(old_code, new_code)
  join public.policy_documents n on n.code = m.new_code
 where p.code = m.old_code;

do $$
declare n int;
begin
  select count(*) into n from public.policy_documents where replaced_by is not null;
  -- A fresh database has no library yet; the check is about the live one.
  if n <> 27 and exists (select 1 from public.policy_documents) then
    raise exception 'Expected 27 replaced templates, linked %', n;
  end if;
end $$;
