-- Recruitment release 5 (RECRUITMENT.md): the AI switch and usage record,
-- offer and rejection letters, and the health, equality and DBS form.

-- ─── AI ─────────────────────────────────────────────────────────────────────
-- Off until a manager switches it on. The limit is on what the company is
-- charged (1.5 × our cost), in pounds; null means no limit.
create table public.organisation_ai_settings (
  organisation_id   uuid primary key references public.organisations (id) on delete cascade,
  enabled           boolean not null default false,
  monthly_limit_gbp numeric(10, 2) check (monthly_limit_gbp is null or monthly_limit_gbp >= 0),
  updated_by        uuid references public.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger organisation_ai_settings_set_updated_at
  before update on public.organisation_ai_settings
  for each row execute function public.set_updated_at();

-- Every Claude request, against the company, with what it cost us and what
-- the company is charged for it.
create table public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  organisation_id    uuid not null references public.organisations (id) on delete cascade,
  feature            text not null,
  model              text not null,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens  integer not null default 0,
  cost_usd           numeric(12, 6) not null,
  cost_gbp           numeric(12, 6) not null,
  charge_gbp         numeric(12, 6) not null,
  user_id            uuid references public.users (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index ai_usage_org_month_idx on public.ai_usage (organisation_id, created_at);

-- ─── Letters ────────────────────────────────────────────────────────────────
-- One offer and one rejection per candidate: the latest wording (a draft
-- until sent) and, once sent, exactly what went.
create table public.candidate_letters (
  id              uuid primary key default gen_random_uuid(),
  candidate_id    uuid not null references public.candidates (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null check (kind in ('offer', 'rejection')),
  fields          jsonb not null default '{}',
  sent_html       text,
  sent_to         text,
  sent_at         timestamptz,
  sent_by         uuid references public.users (id) on delete set null,
  updated_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (candidate_id, kind)
);
create trigger candidate_letters_set_updated_at
  before update on public.candidate_letters
  for each row execute function public.set_updated_at();

-- The company's offer wording and signatory, filled into each new offer.
alter table public.recruitment_settings
  add column offer_signatory_name  text,
  add column offer_signatory_title text,
  add column offer_hours_line      text,
  add column offer_pay_line        text;

-- ─── The health, equality and DBS form ──────────────────────────────────────
-- Filled in by the candidate after the offer (Equality Act 2010 s.60). Health
-- and equality answers: the office reads them, nobody else.
create table public.candidate_starter_forms (
  candidate_id    uuid primary key references public.candidates (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft', 'submitted')),
  answers         jsonb not null default '{}',
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger candidate_starter_forms_set_updated_at
  before update on public.candidate_starter_forms
  for each row execute function public.set_updated_at();

-- ─── Grants (AGENTS.md) ─────────────────────────────────────────────────────
-- Writes go through the service role after the app's checks; console users
-- read their own company's rows.
grant select, insert, update, delete on public.organisation_ai_settings to service_role;
grant select, insert, update, delete on public.ai_usage to service_role;
grant select, insert, update, delete on public.candidate_letters to service_role;
grant select, insert, update, delete on public.candidate_starter_forms to service_role;
revoke all on public.organisation_ai_settings from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;
revoke all on public.candidate_letters from anon, authenticated;
revoke all on public.candidate_starter_forms from anon, authenticated;
grant select on public.organisation_ai_settings to authenticated;
grant select on public.ai_usage to authenticated;
grant select on public.candidate_letters to authenticated;
grant select on public.candidate_starter_forms to authenticated;

alter table public.organisation_ai_settings enable row level security;
alter table public.ai_usage enable row level security;
alter table public.candidate_letters enable row level security;
alter table public.candidate_starter_forms enable row level security;

create policy organisation_ai_settings_platform_admin on public.organisation_ai_settings for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy organisation_ai_settings_console_read on public.organisation_ai_settings for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()));
create policy ai_usage_platform_admin on public.ai_usage for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy ai_usage_console_read on public.ai_usage for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()));
create policy candidate_letters_platform_admin on public.candidate_letters for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_letters_console_read on public.candidate_letters for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));
create policy candidate_starter_forms_platform_admin on public.candidate_starter_forms for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy candidate_starter_forms_console_read on public.candidate_starter_forms for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('recruitment.tracker')));

-- ─── The new Conditional offer step ─────────────────────────────────────────
-- Stage 2 now ends with the offer. A candidate already past it went through
-- before online letters, so the step is marked done for them.
insert into public.candidate_documents (candidate_id, organisation_id, doc_type, review_status, review_note)
select c.id, c.organisation_id, 'offer', 'confirmed', 'Offered before online letters'
from public.candidates c
where (c.status = 'hired'
       or exists (select 1 from public.candidate_documents d
                  where d.candidate_id = c.id
                    and d.doc_type in ('starter_form', 'proof_id', 'proof_address_1', 'proof_address_2', 'proof_ni',
                                       'share_code', 'reference_1', 'reference_2', 'reference_3', 'dbs',
                                       'dbs_risk_assessment', 'training', 'role_acceptance', 'contract',
                                       'refund_training', 'shadowing')))
on conflict (candidate_id, doc_type) do nothing;
