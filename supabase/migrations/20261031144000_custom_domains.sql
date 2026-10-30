-- ============================================================================
-- The company's own web address (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026)
-- ============================================================================
-- With white label, carers and office staff sign in at the company's own
-- address (training.hgcare.co.uk, say), and every emailed link points there.
-- A manager asks for it in Settings, White label, Web address, and adds one
-- DNS record at whoever runs the company's domain; when the record is in
-- place we add the address to the site and switch it on.
--
-- organisations.custom_domain              the address, lower case, no
--                                          scheme or path. One company each.
-- organisations.custom_domain_status       'pending' (asked for, waiting for
--                                          the record or for us), 'live'.
-- organisations.custom_domain_dns_ok       whether the record was right at
--                                          the last check.
-- organisations.custom_domain_checked_at   when it was last checked.
-- organisations.custom_domain_requested_at / _live_at
--
-- Read and written by the service role, after requireRole("org_admin") or
-- requireRole("platform_admin"), and by the app to find which company an
-- address belongs to — so no grant or policy changes.

alter table public.organisations
  add column custom_domain              text unique
    check (custom_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  add column custom_domain_status       text check (custom_domain_status in ('pending', 'live')),
  add column custom_domain_dns_ok       boolean,
  add column custom_domain_checked_at   timestamptz,
  add column custom_domain_requested_at timestamptz,
  add column custom_domain_live_at      timestamptz;
