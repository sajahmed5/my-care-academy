-- ============================================================================
-- When an organisation's integration key was last used
-- ============================================================================
-- The platform now issues, replaces and revokes rostering-integration keys
-- from an organisation's page (it used to be scripts/portal-key.mjs and a
-- hand-run UPDATE). Beside the key's date, the panel shows when the portal
-- last called in, so a dead integration is visible without reading logs.
-- resolvePortalOrg stamps it on every authenticated call, after the response.
--
-- A column on an existing table: its grants already cover it. Written only by
-- the service role, like integration_key_hash.

alter table public.organisations
  add column if not exists integration_key_last_used_at timestamptz;
