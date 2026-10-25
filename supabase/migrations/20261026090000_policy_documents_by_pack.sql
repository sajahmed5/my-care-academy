-- ============================================================================
-- Policy documents are readable by pack, not just by "has the library"
-- ============================================================================
-- policy_documents_read let any organisation with documents.library read every
-- published document, whatever its pack. The pages only ever showed the packs
-- the organisation has (visiblePacks in lib/policy-library.ts), but a Growth
-- organisation — basic library, no compliance pack — could read the full
-- compliance pack and both add-on packs straight from the API. Content a Pro
-- customer pays for was readable by a Growth one.
--
-- The rule now matches visiblePacks exactly:
--   basic  — documents.library
--   full   — documents.compliance_pack
--   addon  — the feature the collection belongs to (complaints.register for
--            the Complaints and Safeguarding Pack, recruitment.tracker for
--            the Recruitment Pack)
-- all on top of documents.library, which the pages require too.
--
-- Checked before applying: no organisation's visible documents change today
-- (Demo Care, on Enterprise, keeps all 43; nobody is on Growth yet).

alter policy policy_documents_read on public.policy_documents
  using (
    status = 'published'
    and (select public.has_feature('documents.library'))
    and (
      (pack = 'basic')
      or (pack = 'full' and (select public.has_feature('documents.compliance_pack')))
      or (pack = 'addon' and (
            (collection = 'Complaints and Safeguarding Pack' and (select public.has_feature('complaints.register')))
         or (collection = 'Recruitment Pack' and (select public.has_feature('recruitment.tracker')))
      ))
    )
  );
