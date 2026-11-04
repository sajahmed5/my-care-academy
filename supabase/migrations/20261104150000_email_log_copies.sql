-- Full copies of account emails (ACCOUNT-ACCESS.md, 4 Nov 2026).
--
-- Invitations, password resets, candidate logins and trial emails now keep a
-- copy of what was sent, so the platform can open it on a company's Emails
-- tab. Sign-in links in the copy are removed before it's stored (lib/
-- email-record.ts), and the copy is cleared after 12 months by the daily job.
-- Other emails (reminders, reports) keep their subject line only, as before.

alter table public.email_log
  add column if not exists html    text,
  add column if not exists user_id uuid references public.users (id) on delete set null,
  add column if not exists sent_by uuid references public.users (id) on delete set null;

comment on column public.email_log.html is
  'Account emails only: the email as sent, sign-in links removed. Cleared after 12 months. Service role only.';
comment on column public.email_log.user_id is 'The account the email was about, where there is one.';
comment on column public.email_log.sent_by is 'Who caused it to be sent (an invitation''s sender); null for the daily jobs.';

-- The copy is for the platform, read through the service role. Signed-in
-- users keep exactly the columns they could read before, plus the two ids:
-- every client read names its columns, so nothing deployed breaks.
revoke select on public.email_log from authenticated;
grant select (id, organisation_id, to_email, type, subject, sent, created_at, user_id, sent_by)
  on public.email_log to authenticated;
revoke all on public.email_log from anon;

-- The Emails tab lists a company's account emails newest first; the daily
-- job finds copies past 12 months.
create index if not exists email_log_user_idx on public.email_log (user_id) where user_id is not null;
create index if not exists email_log_sent_by_idx on public.email_log (sent_by) where sent_by is not null;
create index if not exists email_log_copy_created_idx on public.email_log (created_at) where html is not null;
