-- ============================================================================
-- Classroom and blended training records
-- ============================================================================
-- ROADMAP §4: a provider's own trainer runs a face-to-face session, and it
-- lands in the same training matrix as the e-learning — which is what lets us
-- sell to organisations that do not want our courses.
--
-- classroom_sessions   one session: what, when, who ran it, and optionally the
--                      library course it covers
-- classroom_attendance who was there. When the session covers a course, each
--                      attendee's enrolment is completed and a certificate is
--                      issued (as the service role, as a quiz pass is), so the
--                      matrix, expiry reminders and the evidence pack treat it
--                      exactly like e-learning. certificate_id records which.
--
-- Console users manage their organisation's sessions; a carer reads the
-- sessions they attended. Grants per AGENTS.md, with Supabase's automatic
-- grant revoked explicitly (see 20261024150000).

create table public.classroom_sessions (
  id               uuid primary key default gen_random_uuid(),
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  title            text not null check (length(btrim(title)) > 0),
  course_id        uuid references public.courses (id) on delete set null,
  held_on          date not null,
  trainer_name     text,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 2880),
  location         text,
  notes            text,
  created_by       uuid references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index classroom_sessions_org_idx on public.classroom_sessions (organisation_id, held_on desc);

create table public.classroom_attendance (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.classroom_sessions (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  user_id          uuid not null references public.users (id) on delete cascade,
  certificate_id   uuid references public.certificates (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (session_id, user_id)
);
create index classroom_attendance_user_idx on public.classroom_attendance (user_id);

create trigger classroom_sessions_set_updated_at
  before update on public.classroom_sessions
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.classroom_sessions to service_role;
grant select, insert, update, delete on public.classroom_attendance to service_role;
revoke all on public.classroom_sessions from anon;
revoke all on public.classroom_attendance from anon;
revoke truncate, references, trigger on public.classroom_sessions from authenticated;
revoke truncate, references, trigger on public.classroom_attendance from authenticated;
grant select, insert, update, delete on public.classroom_sessions to authenticated;
grant select, insert, update, delete on public.classroom_attendance to authenticated;

alter table public.classroom_sessions enable row level security;
alter table public.classroom_attendance enable row level security;

create policy classroom_sessions_platform_admin on public.classroom_sessions for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy classroom_sessions_console on public.classroom_sessions for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id()));
create policy classroom_sessions_attendee_read on public.classroom_sessions for select to authenticated
  using (exists (
    select 1 from public.classroom_attendance a
     where a.session_id = classroom_sessions.id and a.user_id = (select auth.uid())
  ));

create policy classroom_attendance_platform_admin on public.classroom_attendance for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy classroom_attendance_console on public.classroom_attendance for all to authenticated
  using ((select public.is_console_user()) and organisation_id = (select public.current_org_id()))
  with check ((select public.is_console_user()) and organisation_id = (select public.current_org_id()));
create policy classroom_attendance_own_read on public.classroom_attendance for select to authenticated
  using (user_id = (select auth.uid()));
