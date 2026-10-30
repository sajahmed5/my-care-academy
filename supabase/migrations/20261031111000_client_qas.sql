-- ============================================================================
-- Service audits, part 2: client QAs (SERVICE-AUDITS.md, Client QAs)
-- ============================================================================
-- Additive only.
--
-- A client QA is a quality check with one client: a visit or a phone call,
-- with the client or a family member. If it couldn't be done, why — it still
-- counts as attempted and moves the next one on. Otherwise a rating of 1–10
-- under each of CQC's five headings, medication questions for a client the
-- company helps with medicines, the company's own questions, what we do well
-- and could do better, and an action plan for the office.
--
--   medication / extra   [{id, label, type, answer, comment}] — the questions
--                        as asked (the company's own wording, from
--                        service_audit_forms key 'client_qa'), with answers
--   score                the five ratings' average × 10, kept for reports and
--                        the manager-review level
--   compliment_id        praise logged to the compliments log from this QA
--   complaint_id         a problem raised as a concern from this QA
--
-- One per client, every 3 months by default (service_audit_forms can change
-- it). Signed off and reviewed like an audit. Gated on quality.audits.

create table public.client_qas (
  id                    uuid primary key default gen_random_uuid(),
  organisation_id       uuid not null references public.organisations (id) on delete cascade,
  client_id             uuid references public.clients (id) on delete set null,
  client_name           text not null,
  held_on               date not null,
  method                text not null check (method in ('visit', 'phone')),
  with_whom             text check (with_whom in ('client', 'family')),
  family_name           text,
  family_relationship   text,
  completed             boolean not null default true,
  not_done_reason       text,
  safe                  integer check (safe between 1 and 10),
  effective             integer check (effective between 1 and 10),
  caring                integer check (caring between 1 and 10),
  responsive            integer check (responsive between 1 and 10),
  well_led              integer check (well_led between 1 and 10),
  medication            jsonb not null default '[]'::jsonb,
  extra                 jsonb not null default '[]'::jsonb,
  went_well             text,
  do_better             text,
  action_plan           text,
  score                 integer check (score is null or score between 0 and 100),
  next_due              date,
  auditor_id            uuid references public.users (id) on delete set null,
  auditor_signature     text,
  auditor_signed_name   text,
  auditor_signed_at     timestamptz,
  review_status         text not null default 'not_needed' check (review_status in ('not_needed', 'waiting', 'reviewed')),
  review_below          integer,
  reviewed_by           uuid references public.users (id) on delete set null,
  reviewed_at           timestamptz,
  review_note           text,
  compliment_id         uuid references public.compliments (id) on delete set null,
  complaint_id          uuid references public.complaints (id) on delete set null,
  created_by            uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (completed or length(btrim(coalesce(not_done_reason, ''))) > 0),
  check (not completed or (with_whom is not null and safe is not null and effective is not null
                           and caring is not null and responsive is not null and well_led is not null))
);
create index client_qas_client_idx on public.client_qas (client_id, held_on desc);
create index client_qas_org_idx on public.client_qas (organisation_id, held_on desc);
create index client_qas_review_idx on public.client_qas (organisation_id, review_status);
create index client_qas_complaint_idx on public.client_qas (complaint_id);
create trigger client_qas_set_updated_at
  before update on public.client_qas
  for each row execute function public.set_updated_at();

-- What the action plan gives someone goes on their task list. The check is
-- rebuilt from whatever it allows today, so another add-on's sources stay.
do $$
declare def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'record_actions_source_type_check';
  if def is not null and position('''client_qa''' in def) = 0 then
    execute 'alter table public.record_actions drop constraint record_actions_source_type_check';
    execute 'alter table public.record_actions add constraint record_actions_source_type_check '
      || replace(def, 'ARRAY[', 'ARRAY[''client_qa''::text, ');
  end if;
end $$;

-- ------------------------------------------------------------------ grants
-- Kept, never deleted through the Data API: a QA is a record CQC may ask for.

grant select, insert, update, delete on public.client_qas to service_role;
revoke all on public.client_qas from anon;
revoke all on public.client_qas from authenticated;
grant select, insert, update on public.client_qas to authenticated;

-- --------------------------------------------------------------------- RLS

alter table public.client_qas enable row level security;
create policy client_qas_platform_admin on public.client_qas for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy client_qas_console on public.client_qas for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('quality.audits')));
