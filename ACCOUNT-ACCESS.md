# Getting people in: temporary passwords, the emails we sent, and demo set-up — agreed (4 Nov 2026)

Started 4 Nov 2026, after a new manager at The Care Bureau couldn't get in.
Agreed with Saj the same day, with the suggested answers to the open
questions. Mock-ups: https://claude.ai/artifact/PJYYa7g6WTiUR2SqgLvEtV.

## Why

- **Email scanners used up the links** (fixed in v3.13.5). Opening a link
  used it, and Microsoft 365's Safe Links opens every link to check it.
  `/auth/confirm` now shows a Continue button, and only pressing it signs in.
- **Invitations go dead within hours.** The invitation email carries a raw
  Supabase link, which expires quickly. The Care Bureau's invitation of
  Monday evening was dead by Wednesday morning. The training emails already
  use a "Set up your account" button (`lib/account-setup.ts`, `/auth/setup`)
  that makes a fresh link when pressed and lasts 14 days, until first sign-in.
- **No way in but an email.** When the email doesn't arrive or doesn't work,
  the only fix was to set a password by hand in Supabase.
- **No record of what was sent.** Invitations and resets aren't in
  `email_log`, and the log keeps only subject lines.

## Decisions

- **The demo welcome email carries a link, not a password** (Saj, 4 Nov).
  It's a proper trial welcome: the trial dates, the person's role, who else
  was invited, and three things to try first. Its button is the 14-day
  "Set up your account" kind. (Mock-up 7.)

## What we're building

1. **Temporary passwords** (mock-ups 1–3).
   - From the platform: "Set temporary password" beside each person on a
     company's page.
   - From the console: a manager can set one for their own staff, on the
     staff profile's Overview, beside "Resend invitation".
   - Shown once, to copy. Never emailed. The audit log records who set one
     for whom, never the password.
   - On first sign-in with it, the person must choose their own password
     before anything else. A flag on the account, read from the sign-in
     token so it costs no extra database call, sends them to
     `/auth/set-password` until it's cleared.
2. **The emails a company was sent** (mock-ups 4–5). An Emails tab on the
   platform's company page lists everything sent to that company's people.
   Account emails (invitations, welcomes, resets, trial emails) keep a full
   copy and open as they looked, with the sign-in button switched off in the
   copy. From an opened email: send again with a fresh link, or set a
   temporary password instead.
3. **Set up a demo for several people at once** (mock-up 6). The set-up form
   takes a list of people: name, email, Manager or Office worker, and welcome
   email or temporary password. At least one manager. Afterwards, one line
   per person: "Welcome email sent" with a link to it, or the password to
   copy. People can be added later from the company page with the same
   choices, and while the company is on its trial they get the trial welcome.

## Settled questions

- **Who sets temporary passwords for staff?** Managers only, not office
  workers (and never for themselves).
- **How long are full copies of account emails kept?** 12 months.
  Reminders and reports keep their subject line only, as now.
- **Every invitation uses the 14-day button**, not just demos: built first.

## Build order

One change per release commit, as always.

1. Invitations use the 14-day "Set up your account" button (v3.13.6). So
   do candidate logins that have never signed in.
2. Temporary passwords, and choosing your own on first sign-in (v3.13.7).
   `lib/temporary-password.ts`; the platform's Admins list and a "Signing
   in" card on the staff profile's Overview (managers only); the proxy holds
   anyone with `app_metadata.password_temporary` on `/auth/set-password`.
3. Full copies of account emails (v3.13.8): `sendEmail({ record })` stores
   the branded email, sign-in links removed (`lib/email-record.ts`), in new
   `email_log` columns only the service role can read; trial emails now go
   out in the company's name; the daily job clears copies after 12 months.
4. The Emails tab.
5. The trial welcome email.
6. Several people at demo set-up, and adding more later with the same choices.
