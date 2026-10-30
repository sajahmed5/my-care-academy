-- ============================================================================
-- Emails as the company (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026)
-- ============================================================================
-- With white label, every email we send for a company carries its logo and
-- colour, comes from its name, and is answered at its own address.
--
-- organisations.email_sender_name   the name shown as the sender; null is the
--                                   company's own name.
-- organisations.email_reply_to      where replies go; null keeps the default
--                                   (no reply address, or whoever sent it).
--
-- Sending from the company's own email domain needs its IT to change DNS
-- settings, so that is set up on request and isn't stored here.
--
-- Written by the service role after requireRole("org_admin"), so no grant or
-- policy changes.

alter table public.organisations
  add column email_sender_name text check (char_length(email_sender_name) <= 80),
  add column email_reply_to    text check (email_reply_to ~* '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$');
