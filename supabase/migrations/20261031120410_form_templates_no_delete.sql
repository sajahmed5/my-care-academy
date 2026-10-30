-- ============================================================================
-- Forms: a form is retired, never deleted
-- ============================================================================
-- form_templates had picked up DELETE (and TRUNCATE, REFERENCES, TRIGGER) for
-- authenticated along the way — this project still auto-grants. With a
-- company now able to manage its own forms (20261031120400), a delete would
-- cascade to every response filled in on that form. A form with answers is
-- retired, never removed — the platform's own editor only ever retires too.
-- The service role keeps its grant for clean-ups.
-- ============================================================================

revoke delete, truncate, references, trigger on public.form_templates from authenticated;
revoke all on public.form_templates from anon;
