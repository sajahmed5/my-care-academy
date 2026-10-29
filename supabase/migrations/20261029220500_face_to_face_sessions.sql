-- ============================================================================
-- Face-to-face training: our sessions and closed days (FACE-TO-FACE.md, 29 Oct 2026)
-- ============================================================================
-- Sessions we run at our training office in Stockport, booked by Enterprise
-- companies (included in the price). This release is our side only: setting
-- sessions up and marking closed days. Booking and the register follow.
--
-- face_to_face_sessions   one session: a library course, or induction or
--                         annual refresher training; when, who trains, and
--                         how many places.
-- face_to_face_closed_days days nothing runs — bank holidays, the trainer
--                         away, the office shut. No session can sit on one.
--
-- Writes are ours (platform admin) and go through the service role after
-- requireRole("platform_admin"); signed-in users only ever read. A manager
-- whose package has face-to-face training reads the sessions and closed days
-- to book from.

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('training.face_to_face', 'training', 'Face-to-face training', false, 55)
on conflict (key) do nothing;

insert into public.tier_features (tier_key, feature_key) values
  ('full', 'training.face_to_face')
on conflict do nothing;

create table public.face_to_face_sessions (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'course' check (kind in ('course', 'induction', 'refresher')),
  course_id     uuid references public.courses (id) on delete restrict,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  trainer_name  text check (trainer_name is null or length(trainer_name) <= 200),
  places        integer not null check (places between 1 and 200),
  location      text not null default 'Unit A1, The Embankment, Vale Road, Stockport, SK4 3GN',
  notes         text check (notes is null or length(notes) <= 2000),
  cancelled_at  timestamptz,
  created_by    uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A course session names its course; induction and refresher don't.
  check ((kind = 'course') = (course_id is not null)),
  check (ends_at > starts_at)
);
create index face_to_face_sessions_starts_idx on public.face_to_face_sessions (starts_at);
create trigger face_to_face_sessions_set_updated_at
  before update on public.face_to_face_sessions
  for each row execute function public.set_updated_at();

create table public.face_to_face_closed_days (
  day         date primary key,
  reason      text check (reason is null or length(reason) <= 200),
  created_by  uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Nothing on a closed day, in UK time. The app says so first; this is the
-- backstop, so no path round the page can put a session there.
create or replace function public.face_to_face_not_on_closed_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cancelled_at is null and exists (
    select 1 from public.face_to_face_closed_days d
     where d.day = (new.starts_at at time zone 'Europe/London')::date
  ) then
    raise exception 'That day is marked closed.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger face_to_face_sessions_not_closed
  before insert or update of starts_at, cancelled_at on public.face_to_face_sessions
  for each row execute function public.face_to_face_not_on_closed_day();

-- Grants (AGENTS.md): the service role writes; signed-in users read under RLS;
-- nothing for anon — revoked explicitly, as Supabase still grants it here.
grant select, insert, update, delete on public.face_to_face_sessions to service_role;
grant select, insert, update, delete on public.face_to_face_closed_days to service_role;
revoke all on public.face_to_face_sessions from anon;
revoke all on public.face_to_face_closed_days from anon;
revoke all on public.face_to_face_sessions from authenticated;
revoke all on public.face_to_face_closed_days from authenticated;
grant select on public.face_to_face_sessions to authenticated;
grant select on public.face_to_face_closed_days to authenticated;

alter table public.face_to_face_sessions enable row level security;
alter table public.face_to_face_closed_days enable row level security;

create policy face_to_face_sessions_platform_admin on public.face_to_face_sessions for select to authenticated
  using ((select public.is_platform_admin()));
create policy face_to_face_sessions_console_read on public.face_to_face_sessions for select to authenticated
  using ((select public.is_console_user()) and (select public.has_feature('training.face_to_face')));

create policy face_to_face_closed_days_platform_admin on public.face_to_face_closed_days for select to authenticated
  using ((select public.is_platform_admin()));
create policy face_to_face_closed_days_console_read on public.face_to_face_closed_days for select to authenticated
  using ((select public.is_console_user()) and (select public.has_feature('training.face_to_face')));
