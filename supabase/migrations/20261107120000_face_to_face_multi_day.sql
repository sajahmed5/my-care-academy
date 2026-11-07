-- ============================================================================
-- Face-to-face sessions over several days (issue 91, 5 Nov 2026)
-- ============================================================================
-- Induction training runs for three days. The table always held a separate
-- start and end instant; only the form fixed both to one day. Now the form
-- takes a last day, the closed-day backstop has to look at every day the
-- session runs on, not just the first, and fire when the end moves too.

create or replace function public.face_to_face_not_on_closed_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cancelled_at is null and exists (
    select 1 from public.face_to_face_closed_days d
     where d.day between (new.starts_at at time zone 'Europe/London')::date
                     and (new.ends_at at time zone 'Europe/London')::date
  ) then
    raise exception 'That day is marked closed.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists face_to_face_sessions_not_closed on public.face_to_face_sessions;
create trigger face_to_face_sessions_not_closed
  before insert or update of starts_at, ends_at, cancelled_at on public.face_to_face_sessions
  for each row execute function public.face_to_face_not_on_closed_day();
