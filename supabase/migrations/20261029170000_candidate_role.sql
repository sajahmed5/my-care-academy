-- A login for candidates (RECRUITMENT.md, release 2b, 29 Oct 2026): they
-- set a password to follow their application and upload documents.
-- On its own: a new enum value can't be used in the transaction that adds it.
alter type public.user_role add value if not exists 'candidate';
