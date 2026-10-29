-- ============================================================================
-- Face-to-face training: bookings (FACE-TO-FACE.md, 29 Oct 2026)
-- ============================================================================
-- A manager books named staff onto one of our sessions. Each person gets a
-- confirmation email and a reminder the day before; a place can be cancelled
-- up to 48 hours before. On the day our trainer takes the register: attended
-- (with the practical result, and a certificate for a library course) or a
-- no-show, which still used the place.
--
-- status      booked | cancelled | attended | no_show
-- Only a cancelled booking gives its place back. The register's columns
-- (practical_passed, certificate_id) are here from the start so the table is
-- made once.
--
-- Writes go through the service role after the app's checks; signed-in users
-- read. The trigger is the backstop for places: it locks the session row, so
-- two managers taking the last place at once can't both have it.

create table public.face_to_face_bookings (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references public.face_to_face_sessions (id) on delete cascade,
  organisation_id       uuid not null references public.organisations (id) on delete cascade,
  user_id               uuid not null references public.users (id) on delete cascade,
  booked_by             uuid references public.users (id) on delete set null,
  status                text not null default 'booked' check (status in ('booked', 'cancelled', 'attended', 'no_show')),
  practical_passed      boolean,
  certificate_id        uuid references public.certificates (id) on delete set null,
  confirmation_sent_at  timestamptz,
  reminder_sent_at      timestamptz,
  cancelled_at          timestamptz,
  cancelled_by          uuid references public.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- One live booking per person per session; a cancelled one can be rebooked.
create unique index face_to_face_bookings_one_live
  on public.face_to_face_bookings (session_id, user_id) where status <> 'cancelled';
create index face_to_face_bookings_org_idx on public.face_to_face_bookings (organisation_id, session_id);
create index face_to_face_bookings_user_idx on public.face_to_face_bookings (user_id);
create trigger face_to_face_bookings_set_updated_at
  before update on public.face_to_face_bookings
  for each row execute function public.set_updated_at();

create or replace function public.face_to_face_booking_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s record;
  taken integer;
begin
  select places, starts_at, cancelled_at into s
    from public.face_to_face_sessions where id = new.session_id for update;
  if s is null or s.cancelled_at is not null then
    raise exception 'That session has been cancelled.' using errcode = 'check_violation';
  end if;
  if s.starts_at <= now() then
    raise exception 'That session has already started.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = new.user_id and u.organisation_id = new.organisation_id and u.status = 'active'
  ) then
    raise exception 'Only the company''s own current staff can be booked.' using errcode = 'check_violation';
  end if;
  select count(*) into taken from public.face_to_face_bookings
   where session_id = new.session_id and status <> 'cancelled';
  if taken >= s.places then
    raise exception 'That session is full.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger face_to_face_bookings_check
  before insert on public.face_to_face_bookings
  for each row execute function public.face_to_face_booking_check();

-- Places taken on each session from a time on, across every company. A
-- manager can only read their own company's bookings, but needs the count to
-- see what's left — so this, rather than a wider read.
create or replace function public.face_to_face_places_taken(p_from timestamptz)
returns table (session_id uuid, taken integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.session_id, count(*)::integer
    from public.face_to_face_bookings b
    join public.face_to_face_sessions s on s.id = b.session_id
   where b.status <> 'cancelled'
     and s.ends_at >= p_from
     and ((select public.is_platform_admin())
          or ((select public.is_console_user()) and (select public.has_feature('training.face_to_face'))))
   group by b.session_id;
$$;
revoke all on function public.face_to_face_places_taken(timestamptz) from public, anon;
grant execute on function public.face_to_face_places_taken(timestamptz) to authenticated, service_role;

-- Grants (AGENTS.md): the service role writes; signed-in users read under RLS;
-- nothing for anon — revoked explicitly, as Supabase still grants it here.
grant select, insert, update, delete on public.face_to_face_bookings to service_role;
revoke all on public.face_to_face_bookings from anon;
revoke all on public.face_to_face_bookings from authenticated;
grant select on public.face_to_face_bookings to authenticated;

alter table public.face_to_face_bookings enable row level security;
create policy face_to_face_bookings_platform_admin on public.face_to_face_bookings for select to authenticated
  using ((select public.is_platform_admin()));
create policy face_to_face_bookings_console_read on public.face_to_face_bookings for select to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id())
         and (select public.has_feature('training.face_to_face')));
-- A carer reads their own bookings: their training record, whatever the package.
create policy face_to_face_bookings_own_read on public.face_to_face_bookings for select to authenticated
  using (user_id = (select auth.uid()));
