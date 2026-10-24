-- ============================================================================
-- Re-apply the 20 Oct grant rules to the tables created since, and index the
-- record_actions lookup.
-- ============================================================================
-- 20261020120000_explicit_data_api_grants.sql stripped anon of every table
-- privilege and authenticated of TRUNCATE / REFERENCES / TRIGGER — but "all
-- tables" only covered the tables that existed then. Every table added after
-- it (packages, supervisions, competency, incidents, complaints, PIPs, policy
-- and form libraries, record actions) picked up Supabase's automatic grant
-- again, so anon holds full CRUD including TRUNCATE on 25 tables. RLS blocks
-- it (no anon policies), but the grant is the outer gate (AGENTS.md). anon
-- reaches the schema only through verify_certificate(), a SECURITY DEFINER
-- function, so nothing public needs a table privilege.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- The complaint detail page and every triage save read open actions by their
-- source record (source_type = ? and source_id = ?), which had no index.
create index if not exists record_actions_source_idx
  on public.record_actions (source_type, source_id);
