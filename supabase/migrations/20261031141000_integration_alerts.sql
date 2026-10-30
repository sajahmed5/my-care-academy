-- ============================================================================
-- Alerts to other systems (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026)
-- ============================================================================
-- Another system can connect to us: it is built against our published API
-- (/developers) with a key the company makes in Settings, and we send it
-- alerts — "certificate issued", "training overdue" — at an address it gives.
--
-- alert_endpoints    an address the company has asked us to send alerts to,
--                    which events it wants, and the secret each alert is
--                    signed with (HMAC-SHA256), so the receiver can tell it
--                    came from us. last_* say how the latest attempt went.
-- alert_deliveries   every alert sent: what, when, how it went, and how many
--                    tries. dedupe_key stops the daily overdue run telling a
--                    system about the same overdue course twice.
--
-- Both are service role only: the secret signs alerts, and the manager's
-- page reads them after requireRole.

create table public.alert_endpoints (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references public.organisations (id) on delete cascade,
  label                text not null,
  url                  text not null,
  secret               text not null,
  events               text[] not null default '{certificate.issued,training.overdue}',
  active               boolean not null default true,
  created_by           uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  last_attempt_at      timestamptz,
  last_status          integer,
  last_error           text,
  consecutive_failures integer not null default 0
);
create index alert_endpoints_org_idx on public.alert_endpoints (organisation_id);

create table public.alert_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references public.alert_endpoints (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  event           text not null,
  dedupe_key      text,
  payload         jsonb not null,
  attempts        integer not null default 0,
  ok              boolean not null default false,
  status_code     integer,
  error           text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  unique (endpoint_id, dedupe_key)
);
create index alert_deliveries_endpoint_idx on public.alert_deliveries (endpoint_id, created_at desc);
create index alert_deliveries_retry_idx on public.alert_deliveries (created_at) where not ok;

alter table public.alert_endpoints enable row level security;
alter table public.alert_deliveries enable row level security;

-- Grants (AGENTS.md): revoked explicitly, since this project still grants
-- new tables to anon and authenticated.
revoke all on public.alert_endpoints from anon, authenticated;
revoke all on public.alert_deliveries from anon, authenticated;
grant select, insert, update, delete on public.alert_endpoints to service_role;
grant select, insert, update, delete on public.alert_deliveries to service_role;
