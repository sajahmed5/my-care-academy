-- ============================================================================
-- The company's colour (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026)
-- ============================================================================
-- With white label, buttons and the menu are in the company's own colour,
-- chosen by a manager in Settings, White label, and checked automatically so
-- text on it stays readable (lib/brand-colour). Null is our own teal.
--
-- Written by the service role after requireRole("org_admin"), as the logo
-- is, so no grant or policy changes.
--
-- The feature is now more than a logo, so its name says so.

alter table public.organisations
  add column brand_colour text check (brand_colour ~ '^#[0-9a-f]{6}$');

update public.features
set label = 'White label'
where key = 'platform.white_label';
