-- ============================================================================
-- A working draft beside the published text of an organisation's policy
-- ============================================================================
-- organisation_policies.blocks is what staff read and accept. Editing it in
-- place would change the text under an acceptance already given, without a
-- new version. draft_blocks holds the manager's working copy instead; publish
-- copies it into blocks, bumps the version, and clears it. Staff keep reading
-- the published version until then. A column on a table that already has its
-- grants and policies.

alter table public.organisation_policies add column if not exists draft_blocks jsonb;
