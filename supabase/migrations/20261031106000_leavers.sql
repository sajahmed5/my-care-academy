-- ============================================================================
-- HR pack: leavers (HR-PACK.md, agreed 29 Oct 2026)
-- ============================================================================
-- Additive only.
--
-- hr_leavers            one leaving record per person: the reason, notice
--                       date, last working day, whether they could be
--                       re-employed, the leaver checklist (badge, uniform,
--                       keys, equipment, key safe codes changed at the
--                       homes they visited, final pay), the exit interview
--                       (on their login or by link), when their login was
--                       switched off (automatically, after their last day)
--                       and when their training record was emailed; and the
--                       DBS barring referral reminder.
-- hr_references_given   a new employer's request for a reference, and the
--                       factual reference sent from the file.

create table public.hr_leavers (
  id                  uuid primary key default gen_random_uuid(),
  organisation_id     uuid not null references public.organisations (id) on delete cascade,
  user_id             uuid not null unique references public.users (id) on delete cascade,
  reason              text not null check (reason in ('resigned', 'dismissed', 'end_of_probation', 'retired', 'end_of_contract', 'redundancy', 'other')),
  reason_detail       text,
  notice_on           date,
  last_day            date not null,
  re_employable       text not null default 'yes' check (re_employable in ('yes', 'no', 'with_conditions')),
  re_employable_note  text,
  -- { "<item>": { "done": true, "on": "2026-11-01", "note": "…" } }
  checklist           jsonb not null default '{}'::jsonb,
  login_off_at        timestamptz,
  training_sent_at    timestamptz,
  exit_status         text not null default 'none' check (exit_status in ('none', 'asked', 'done', 'declined')),
  exit_answers        jsonb not null default '{}'::jsonb,
  exit_done_at        timestamptz,
  exit_token_hash     text unique,
  exit_token_expires_at timestamptz,
  dbs_referral        text not null default 'unknown' check (dbs_referral in ('unknown', 'needed', 'not_needed', 'done')),
  dbs_referral_on     date,
  created_by          uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index hr_leavers_org_idx on public.hr_leavers (organisation_id, last_day);
create trigger hr_leavers_set_updated_at
  before update on public.hr_leavers
  for each row execute function public.set_updated_at();

create table public.hr_references_given (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  requester_name   text not null,
  requester_org    text,
  requester_email  text,
  received_on      date not null default current_date,
  body             text not null default '',
  status           text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at          timestamptz,
  sent_to          text,
  sent_by          uuid references public.users (id) on delete set null,
  pdf_path         text,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index hr_references_given_person_idx on public.hr_references_given (user_id, received_on desc);
create trigger hr_references_given_set_updated_at
  before update on public.hr_references_given
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ grants

revoke all on public.hr_leavers, public.hr_references_given from anon, authenticated;
grant select, insert, update, delete on public.hr_leavers, public.hr_references_given to service_role;
grant select on public.hr_leavers, public.hr_references_given to authenticated;

-- --------------------------------------------------------------------- RLS
-- Writes go through server actions as the service role. The leaver fills in
-- their exit interview through an action too; no self-read policy, since the
-- record holds the manager's notes (re-employable, the reason).

alter table public.hr_leavers enable row level security;
create policy hr_leavers_platform_admin on public.hr_leavers for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_leavers_console_read on public.hr_leavers for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));

alter table public.hr_references_given enable row level security;
create policy hr_references_given_platform_admin on public.hr_references_given for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy hr_references_given_console_read on public.hr_references_given for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
