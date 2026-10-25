-- ============================================================================
-- When a member of staff left: the date 7-year retention runs from
-- ============================================================================
-- Retention is 7 years (Saj, 26 Oct 2026): a leaver's records are kept for
-- seven years after they leave, a closed complaint or incident for seven years
-- after it closed, and nothing is deleted automatically — the Account page
-- lists what has passed retention for a manager to delete (lib/retention.ts).
--
-- Complaints and incidents already carry closed_on. Staff carry only a status,
-- so there was no date to count from. users.deactivated_at is it, kept by a
-- trigger so every route that deactivates someone sets it: the console's
-- Deactivate, the portal API's archive, anything added later. Reactivating
-- clears it. Existing leavers are backfilled with updated_at, the nearest date
-- on record to when they were deactivated.
--
-- A column on an existing table: its grants and policies already cover it.

alter table public.users add column if not exists deactivated_at timestamptz;

create or replace function public.stamp_deactivated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'deactivated' and (old.status is distinct from 'deactivated') then
    new.deactivated_at := now();
  elsif new.status <> 'deactivated' then
    new.deactivated_at := null;
  end if;
  return new;
end;
$$;

-- A trigger function only: nobody calls it through the API.
revoke execute on function public.stamp_deactivated_at() from public, anon, authenticated;

drop trigger if exists users_stamp_deactivated_at on public.users;
create trigger users_stamp_deactivated_at
  before update of status on public.users
  for each row execute function public.stamp_deactivated_at();

update public.users
   set deactivated_at = updated_at
 where status = 'deactivated' and deactivated_at is null;
