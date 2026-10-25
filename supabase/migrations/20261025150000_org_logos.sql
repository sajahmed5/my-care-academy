-- ============================================================================
-- White-label: an organisation's own logo
-- ============================================================================
-- ROADMAP §2, decided with Saj: an organisation with platform.white_label
-- uploads its logo on its own Account page, and it then appears on its
-- certificates, its carers' portal and its copy of the policies.
-- organisations.white_label_logo has existed since the foundation migration
-- with nothing reading or writing it; it now holds the logo's path in the
-- bucket below.
--
-- A public bucket, deliberately: a logo is branding the organisation puts on
-- every certificate it hands out, not personal data, and the certificate
-- renderer and every page that shows it need a plain URL. Uploads and
-- removals run as the service role from a manager-only action
-- (uploadOrgLogoAction), so there is no write policy for anyone else.
-- PNG and JPEG only — the PDF renderer cannot draw SVG — and at most 512 KB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-logos', 'org-logos', true, 524288, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
