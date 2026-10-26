-- ============================================================================
-- The add-on pack's Complaints Policy carried the Safeguarding Policy's text
-- ============================================================================
-- The source file "Add On Packages/Complaints and Safeguarding Pack/Complaints
-- Policy.docx" holds a safeguarding policy, and the import copied it as it
-- was: MCA-ADD-COMPLAINTS-POLICY-939C matched MCA-DOM-SAFEGUARDING-POLICY-0443
-- block for block. Give it the Domiciliary Care Complaints Policy instead —
-- the CQC basics copy, which is identical to the full compliance pack's.
--
-- Saj is correcting the Word file in OneDrive, so a later re-import keeps
-- this. No organisation had adopted or accepted the template, so nothing
-- downstream changes.

update public.policy_documents
   set blocks = (select blocks from public.policy_documents where code = 'MCA-DOM-COMPLAINTS-POLICY-1F2B'),
       updated_at = now()
 where code = 'MCA-ADD-COMPLAINTS-POLICY-939C';
