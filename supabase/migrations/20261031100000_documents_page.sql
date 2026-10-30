-- ============================================================================
-- HR pack: the carer's documents page (HR-PACK.md, agreed 29 Oct 2026)
-- ============================================================================
-- Additive only. The staff file holds more kinds of document than the four it
-- started with: proof of identity and a driving licence (both with expiries),
-- and the DBS risk assessment, held only for someone whose DBS shows a
-- conviction. Widening the check changes nothing for the code that is live.

alter table public.staff_documents drop constraint if exists staff_documents_doc_type_check;
alter table public.staff_documents add constraint staff_documents_doc_type_check
  check (doc_type in (
    'right_to_work', 'dbs', 'references', 'insurance',
    'proof_id', 'driving_licence', 'dbs_risk_assessment'
  ));
