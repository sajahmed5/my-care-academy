<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Versioning

Every release commit bumps `version` in package.json by 0.0.1, carrying at 10
(1.1.9 → 1.2.0, 1.9.9 → 2.0.0). One commit = one change = one bump. The UI
shows it via `lib/version.ts` (the person menu + marketing footer) — never hard-code
the version anywhere else.

# Data API grants

Supabase no longer auto-grants Data API access to new tables in `public`
(changelog 45329, 30 Oct 2026). Every migration that creates a table must
grant its own privileges, or the table is invisible to supabase-js, PostgREST
and GraphQL — including after a `supabase db reset` or on a preview branch.
Grant `select, insert, update, delete` to `service_role` (the
`lib/supabase/admin.ts` client bypasses RLS but not grants), the narrowest set
the UI needs to `authenticated`, and nothing to `anon` — RLS gates rows, but
the grant is the outer gate. Public reads go through a `security definer`
function instead, as `verify_certificate()` does.

# Console roles

Two roles open the organisation console: `org_admin` (manager) and
`org_office` (office worker). In the database they are one: every org-side
RLS policy calls `public.is_console_user()`, never
`current_user_role() = 'org_admin'` (a migration rewrote the old form; new
policies use the function directly). The manager-only parts — Settings
(`/org/settings`: the Account page, billing, who has console access, and
every add-on's own forms, questions, wording and process) — are enforced in
the app with `requireRole("org_admin")` on the page and its actions;
everything else org-side uses `requireConsole()` from `lib/auth.ts`. A new
add-on's company-level setup goes under `/org/settings/<add-on>`, listed on
the Settings page, never in the main menu.
