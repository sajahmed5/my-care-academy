-- ============================================================================
-- Who can see what (2 Nov 2026, QA review Q2, Saj's decision).
-- ============================================================================
-- A manager switches whole areas of the console off for the company's
-- office workers (lib/office-access.ts has the keys). One text[] on the
-- organisation row, not a table: it is read with the rest of the row every
-- member can already see (the console reads organisations under RLS), and
-- written only by the app through the service role from the managers-only
-- Settings → Your company → Who can see what page. Empty means everything is
-- on, so the code already deployed is unaffected. Applied live 2 Nov 2026.

alter table public.organisations
  add column if not exists office_hidden_areas text[] not null default '{}';

comment on column public.organisations.office_hidden_areas is
  'Console areas office workers cannot open (keys from lib/office-access.ts AREAS). Managers always see everything. Written by the app (service role).';
