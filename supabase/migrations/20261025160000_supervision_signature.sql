-- ============================================================================
-- The carer's signature on a supervision
-- ============================================================================
-- CARER-FILE.md §9, decided with Saj: a carer never reads their own
-- supervision afterwards; they sign it while it is being completed, on the
-- manager's screen. This is the one part of that decision that was not built.
--
--   carer_signature        the drawn signature, as a PNG data URL (a few KB)
--   carer_signed_name      the name they typed beside it
--   carer_signed_at        when they signed
--   carer_unsigned_reason  why there is no signature, when they could not sign
--                          at the time (a phone supervision, say) — a gap with a
--                          reason, rather than a silent one
--
-- addSupervisionAction requires one or the other on every new record.
-- Records made before this have neither, and say so on screen. Columns on an
-- existing table: its grants and policies already cover them.

alter table public.supervisions
  add column if not exists carer_signature text,
  add column if not exists carer_signed_name text,
  add column if not exists carer_signed_at timestamptz,
  add column if not exists carer_unsigned_reason text;
