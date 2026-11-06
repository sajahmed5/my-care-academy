-- ============================================================================
-- Demo bookings (TRIAL.md, 6 Nov 2026)
-- ============================================================================
-- Once a company has signed up for its free trial on the website it can book
-- a 30-minute demo with us, picking a day and a time from what we offer
-- (lib/demo-booking.ts: working days, 9 to 5, less Tuesday afternoons and
-- Thursday 10:30 to 12:30). One row per booking. We're emailed and confirm
-- it by hand, so a row is 'requested' until Saj marks it otherwise.
--
-- Written by the public booking action through the service role; read on
-- the platform. Nothing for a signed-in company user, and nothing for anon.

create table public.demo_bookings (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete set null,
  org_name        text not null check (length(org_name) between 1 and 120),
  name            text not null check (length(name) between 1 and 100),
  email           text not null check (length(email) between 3 and 200),
  phone           text check (phone is null or length(phone) <= 40),
  starts_at       timestamptz not null,
  minutes         smallint not null default 30 check (minutes between 15 and 120),
  status          text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled')),
  created_at      timestamptz not null default now()
);
comment on table public.demo_bookings is
  'Demos booked from the free-trial page. Requested until we confirm; one live booking per slot.';

-- One live booking per slot: two people can't take the same half hour.
create unique index demo_bookings_slot_idx on public.demo_bookings (starts_at) where status <> 'cancelled';
create index demo_bookings_org_idx on public.demo_bookings (organisation_id) where organisation_id is not null;

grant select, insert, update, delete on public.demo_bookings to service_role;
revoke all on public.demo_bookings from anon;
revoke all on public.demo_bookings from authenticated;
grant select on public.demo_bookings to authenticated;

alter table public.demo_bookings enable row level security;

create policy demo_bookings_platform_admin on public.demo_bookings for select to authenticated
  using ((select public.is_platform_admin()));
