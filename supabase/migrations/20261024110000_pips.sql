-- ============================================================================
-- Performance improvement plans.
-- ============================================================================
-- What happens to a carer after a complaint is upheld. The register could
-- already suggest a course and record that a manager assigned it, which is
-- the right answer to "they need refreshing on medication" and no answer at
-- all to "their timekeeping has been a problem for two months". That needs a
-- plan: what is wrong, what good looks like, how it will be measured, what
-- support they are being given, what happens if nothing changes — reviewed
-- every week, signed by the carer, and closed with an outcome.
--
-- Four steps, derived in lib/pips/steps.ts and not stored:
--
--   1 Plan set → 2 Carer signed → 3 Weekly reviews → 4 Outcome
--
-- The signature is the step that gets skipped, so it is a step. A plan the
-- carer never saw is not a plan, it is a file note, and it is worth nothing
-- at a tribunal. The same goes for support: a plan that offered none is
-- indefensible however carefully the concerns were written.
--
-- Three tables:
--
--   pips          the plan: why, the concerns, the expectations, the support,
--                 the consequences, the signatures and the outcome.
--   pip_reviews   one row per week — the manager's judgement and the carer's
--                 own reply, which is the half that makes it a conversation.
--   pip_training  the dated sessions. A plan that only measured is "we
--                 watched them fail for four weeks"; the sessions are the
--                 evidence the provider taught something.
-- ============================================================================

create table public.pips (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  -- Who the plan is for. A learner of this organisation.
  user_id         uuid not null references public.users (id) on delete cascade,
  kind            text not null default 'pip'
                    check (kind in ('pip', 'disciplinary')),
  status          text not null default 'open'
                    check (status in ('open', 'completed', 'cancelled')),
  -- The complaint it came out of, when it came out of one. Nullable: a plan
  -- can start from a supervision or from a manager's own concern.
  complaint_id    uuid references public.complaints (id) on delete set null,
  -- Why it was raised, in the manager's words.
  reason          text,
  -- [{ id, concern, standard, measure }] — what is wrong, what good looks
  -- like, and how it will be judged. The third is what stops a weekly review
  -- being a matter of opinion.
  concerns        jsonb not null default '[]'::jsonb,
  -- ["Stay the full duration of each call", …] — what they are held to from
  -- now on. Concerns say what went wrong; expectations say what good is.
  expectations    jsonb not null default '[]'::jsonb,
  -- [{ id, type, detail, arranged }] — retraining, shadowing, supervision.
  support         jsonb not null default '[]'::jsonb,
  -- Stated plainly. A carer who was never told what happens if nothing
  -- changes has not been treated fairly.
  consequences    text,
  duration_weeks  smallint check (duration_weeks is null or duration_weeks between 1 and 12),
  start_date      date,
  review_until    date,
  review_frequency text check (review_frequency is null or review_frequency in
                    ('weekly', 'fortnightly', 'monthly', 'adhoc')),
  owner_id        uuid references public.users (id) on delete set null,
  outcome         text check (outcome is null or outcome in ('met', 'partially_met', 'not_met')),
  outcome_notes   text,
  -- Closed, extended or escalated.
  outcome_next_step text,
  completion_summary text,
  -- Signatures. Data-URL PNGs from the same pad the forms library uses.
  -- 'office' is signed on the portal with the carer present, which is
  -- witnessed; there is no carer-side signing route yet, so that is all.
  carer_signature text,
  carer_signed_at timestamptz,
  carer_signed_witnessed_by text,
  manager_signature text,
  manager_signed_at timestamptz,
  manager_signed_by uuid references public.users (id) on delete set null,
  closed_at       timestamptz,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index pips_org_idx on public.pips (organisation_id, status);
create index pips_user_idx on public.pips (user_id);
create index pips_complaint_idx on public.pips (complaint_id);

create trigger pips_set_updated_at
  before update on public.pips
  for each row execute function public.set_updated_at();

create table public.pip_reviews (
  id             uuid primary key default gen_random_uuid(),
  pip_id         uuid not null references public.pips (id) on delete cascade,
  week_number    smallint not null,
  period_start   date not null,
  period_end     date not null,
  manager_notes  text,
  -- The carer's right of reply. Recorded by whoever took it down until they
  -- have a way of writing it themselves.
  carer_response text,
  carer_responded_at timestamptz,
  rating         text check (rating is null or rating in ('on_track', 'some_concern', 'not_met')),
  actions_next   text,
  completed_at   timestamptz,
  completed_by   uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (pip_id, week_number)
);

create index pip_reviews_pip_idx on public.pip_reviews (pip_id, week_number);
-- "Whose review is overdue", which the list runs on every load.
create index pip_reviews_due_idx
  on public.pip_reviews (period_end) where completed_at is null;

create trigger pip_reviews_set_updated_at
  before update on public.pip_reviews
  for each row execute function public.set_updated_at();

create table public.pip_training (
  id                uuid primary key default gen_random_uuid(),
  pip_id            uuid not null references public.pips (id) on delete cascade,
  review_id         uuid references public.pip_reviews (id) on delete set null,
  session_date      date not null,
  topic             text not null check (length(btrim(topic)) > 0),
  trainer_name      text,
  -- null = not yet happened. false is a fact worth recording: a missed
  -- session is part of the picture.
  attended          boolean,
  assessment_result text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index pip_training_pip_idx on public.pip_training (pip_id, session_date);

create trigger pip_training_set_updated_at
  before update on public.pip_training
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Grants (changelog 45329).
-- ============================================================================
grant select, insert, update, delete on public.pips to service_role;
grant select, insert, update, delete on public.pips to authenticated;
grant select, insert, update, delete on public.pip_reviews to service_role;
grant select, insert, update, delete on public.pip_reviews to authenticated;
grant select, insert, update, delete on public.pip_training to service_role;
grant select, insert, update, delete on public.pip_training to authenticated;
-- nothing to anon.

-- ============================================================================
-- RLS — org-scoped and gated on complaints.register.
--
-- No learner policy. A plan is the employer's record of a performance
-- concern, and giving a carer read access to their own before there is a
-- considered design for how they see it (and reply to it) would be a
-- decision made by an RLS policy rather than by anyone.
-- ============================================================================
alter table public.pips enable row level security;
alter table public.pip_reviews enable row level security;
alter table public.pip_training enable row level security;

create policy pips_platform_admin on public.pips for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy pips_org_admin on public.pips for all to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('complaints.register')
  )
  with check (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
    and public.has_feature('complaints.register')
  );

create policy pip_reviews_platform_admin on public.pip_reviews for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy pip_reviews_org_admin on public.pip_reviews for all to authenticated
  using (exists (select 1 from public.pips p where p.id = pip_id))
  with check (exists (select 1 from public.pips p where p.id = pip_id));

create policy pip_training_platform_admin on public.pip_training for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy pip_training_org_admin on public.pip_training for all to authenticated
  using (exists (select 1 from public.pips p where p.id = pip_id))
  with check (exists (select 1 from public.pips p where p.id = pip_id));
