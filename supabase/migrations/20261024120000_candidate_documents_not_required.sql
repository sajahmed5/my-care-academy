-- ============================================================================
-- A checklist item can be "not needed" (issue #52), and hiring waits for the
-- whole checklist (issue #51).
-- ============================================================================
-- Until now a candidate_documents row meant one thing: we hold this file. But
-- Right to Work, a literacy test or an interview record is not wanted for every
-- candidate, so there was no way to say "this one does not apply" — and no way
-- to gate Mark hired on the checklist without blocking those candidates for
-- good. A row now records the state of one checklist item: either a file we
-- hold, or a reasoned N/A. The check keeps it one or the other, never both and
-- never neither.
--
-- No new table, so the grants from 20260701151635_recruitment.sql still apply.
alter table public.candidate_documents
  alter column file_path drop not null,
  add column not_required boolean not null default false,
  add column not_required_reason text;

alter table public.candidate_documents
  add constraint candidate_documents_file_or_waiver check (
    (not_required and file_path is null)
    or (not not_required and file_path is not null)
  );

-- One row per item per candidate. The upload path already deletes any row of
-- the same type before inserting; this makes that rule the database's, and
-- lets the N/A path upsert.
create unique index candidate_documents_candidate_type_idx
  on public.candidate_documents (candidate_id, doc_type);
