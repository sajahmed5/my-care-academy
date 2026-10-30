-- ============================================================================
-- Who must read which policy, and by when
-- ============================================================================
-- POLICIES.md, "Who must read what": each policy is set for carers, office
-- staff, managers or everyone, with a deadline to accept. Reminders go out;
-- late acceptances show in Who's due and the weekly email. New starters get
-- their set when they're hired.
--
-- organisation_policies gains
--   audience            everyone | carers | office | managers | console
--                       (console = office staff and managers)
--   accept_within_days  this policy's own deadline; null means the company's
-- organisation_policy_settings gains
--   accept_within_days  the company's deadline, 14 days unless it says
-- A person's deadline counts from whichever is later: the version being
-- published, or the day they started (hired, or their login made).
--
-- staff_started_at() is that start date for the people the caller may see:
-- everyone in their organisation for a console user, themselves for anyone
-- else. Security definer because carers cannot read the recruitment record
-- they were hired from, and the hire date lives there.
--
-- policy_reminder_log is the daily job's memory (one row per person, the last
-- policy reminder sent). Service role only: nobody reads it from the browser.
--
-- Additive. Defaults mean every existing copy is for everyone with 14 days,
-- which is what the live code already treats them as.
-- ============================================================================

alter table public.organisation_policies
  add column if not exists audience text not null default 'everyone'
    check (audience in ('everyone', 'carers', 'office', 'managers', 'console')),
  add column if not exists accept_within_days integer check (accept_within_days between 1 and 90);

alter table public.organisation_policy_settings
  add column if not exists accept_within_days integer not null default 14
    check (accept_within_days between 1 and 90);

create or replace function public.staff_started_at()
returns table (user_id uuid, started_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id,
         greatest(u.created_at, coalesce(max(c.hired_at), u.created_at))
    from public.users u
    left join public.candidates c
      on c.user_id = u.id and c.organisation_id = u.organisation_id and c.hired_at is not null
   where u.organisation_id = (select public.current_org_id())
     and ((select public.is_console_user()) or u.id = (select auth.uid()))
   group by u.id, u.created_at;
$$;
revoke execute on function public.staff_started_at() from public, anon;
grant execute on function public.staff_started_at() to authenticated, service_role;

create table public.policy_reminder_log (
  user_id         uuid primary key references public.users (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  last_sent_at    timestamptz not null default now()
);

revoke all on public.policy_reminder_log from anon, authenticated;
grant select, insert, update, delete on public.policy_reminder_log to service_role;

-- RLS on with no policy: the service role (which bypasses it) is the only reader.
alter table public.policy_reminder_log enable row level security;

-- Staff read their company's settings too: a carer's own deadline depends on
-- accept_within_days, and nothing else on the row is private (the details are
-- printed in every policy they read). Writes stay with console users.
create policy organisation_policy_settings_member_read on public.organisation_policy_settings for select to authenticated
  using (
    organisation_id = (select public.current_org_id())
    and (select public.has_feature('documents.library'))
  );
