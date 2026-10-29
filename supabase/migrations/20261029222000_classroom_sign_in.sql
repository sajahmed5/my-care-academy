-- ============================================================================
-- Classroom sessions: QR sign-in and a practical result (FACE-TO-FACE.md, 29 Oct 2026)
-- ============================================================================
-- The company's own classroom sessions get two additions. Attendees sign in
-- by scanning a QR code on the trainer's screen, and each person gets a
-- practical assessment result, passed or not.
--
-- A session can now be open: started on the day, people signing in, then
-- finished by the trainer, which is when certificates are issued. Recording
-- one after the fact, as before, makes it finished at once.
--
-- classroom_sessions.finished_at    null while sign-in is open. Defaults to
--                                   now() so a session recorded by the code
--                                   deployed before this lands is finished,
--                                   as it always was; an open one is inserted
--                                   with null on purpose.
-- classroom_sessions.sign_in_*      the QR code's token, as a hash, and when
--                                   it stops working.
-- classroom_attendance.practical_passed   the result; null where none given
--                                   (sessions recorded before this).
-- classroom_attendance.signed_in_at when they scanned in; null when the
--                                   trainer ticked them.
--
-- The sign-in itself is written by the service role after the app checks the
-- token and that the person is the company's own current staff, so no new
-- policy or grant is needed.

alter table public.classroom_sessions
  add column finished_at        timestamptz default now(),
  add column sign_in_token_hash text unique,
  add column sign_in_expires_at timestamptz;
update public.classroom_sessions set finished_at = created_at;

alter table public.classroom_attendance
  add column practical_passed boolean,
  add column signed_in_at     timestamptz;
