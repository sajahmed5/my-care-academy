-- ============================================================================
-- The interim update's "what we have found so far"
-- (COMPLAINTS-SAFEGUARDING.md, From MyRoster: interim letter)
-- ============================================================================
-- When a council chases part-way through, the interim letter says what is
-- done and what is still to come — both worked out from the file — and, in
-- the manager's own words, what has been found so far. Those words are kept
-- here so the letter can be printed again without retyping them. Written by
-- a person; AI drafting, when it comes, drafts into this and a person checks
-- it before it goes.
-- ============================================================================

alter table public.complaints add column if not exists interim_findings text;
