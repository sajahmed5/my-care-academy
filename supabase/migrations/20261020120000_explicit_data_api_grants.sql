-- ============================================================================
-- Explicit Data API grants
-- ============================================================================
-- From 30 October 2026 Supabase stops automatically granting Data API access to
-- new tables in "public" on existing projects (changelog 45329). Every table in
-- this schema is currently reachable partly because of that automatic grant,
-- which handed anon, authenticated AND service_role full CRUD regardless of
-- what the creating migration actually asked for. Two consequences, both fixed
-- here:
--
--   1. No migration has ever granted anything to service_role, so a schema
--      rebuilt from scratch after that date (supabase db reset, a preview
--      branch, a new project) would deny every admin-client write: audit logs,
--      email log, certificate PDF paths, question stars, issue reports.
--
--   2. anon holds full CRUD — DELETE and TRUNCATE included — on all tables.
--      RLS blocks it (no table has an anon policy), but the grant should not be
--      there. anon reaches this schema only through verify_certificate(), which
--      is SECURITY DEFINER and so needs no table privileges of its own.
--
-- Per-table authenticated grants stay exactly as each table's own migration
-- declared them. This only strips the extra privileges the automatic grant
-- added on top.
--
-- NOTE: "all tables in schema public" is a one-time grant over the tables that
-- exist when this runs — it does not cover future ones. Any migration after
-- this one that creates a table must grant its own privileges.

-- ----------------------------------------------------------------------------
-- anon: no table access whatsoever. (Function EXECUTE grants are untouched, so
-- verify_certificate() keeps working for the public certificate check.)
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ----------------------------------------------------------------------------
-- service_role: the trusted server client (lib/supabase/admin.ts). It bypasses
-- RLS, never reaches the browser, and writes every table it touches. Sequences
-- are not needed for identity columns, but cost nothing and cover a future
-- serial-backed default.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ----------------------------------------------------------------------------
-- authenticated: drop the write privileges the automatic grant added beyond
-- what each migration declared. These six tables are client-readable but
-- server-written — every insert/update goes through the service-role client.
-- ----------------------------------------------------------------------------
revoke insert, update, delete on public.quiz_attempts          from authenticated;
revoke insert, update, delete on public.certificates           from authenticated;
revoke insert, update, delete on public.email_log              from authenticated;
revoke insert, update, delete on public.audit_logs             from authenticated;
revoke insert, update, delete on public.content_question_stars from authenticated;
revoke insert, update, delete on public.issue_reports          from authenticated;

-- Nothing client-side does DDL, so these three never had a reason to be held.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- The leftover certificate-expiry backup has no policies and no reader.
revoke all on public._bk_hg_cert_expiry_20260927 from authenticated;
