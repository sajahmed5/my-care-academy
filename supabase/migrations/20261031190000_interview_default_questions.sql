-- Issue #81 (Norwood Drive): the interview record asked too many questions.
-- Our default is now the six values questions plus four of the general ones
-- (lib/recruitment-interview.ts, DEFAULT_ASKED); the other eleven stay in
-- Settings → Recruitment → Forms, switched off, for a company to tick.
--
-- interview_hidden becomes "null = our default": a company that has never
-- saved its choice follows the default, and one that has keeps exactly what
-- it chose. Code still running before this deploy reads null as "hide
-- nothing", as it read '{}' — no change until the new code is live.
alter table public.recruitment_settings
  alter column interview_hidden drop not null,
  alter column interview_hidden set default null;

update public.recruitment_settings
   set interview_hidden = null
 where interview_hidden = '{}';
