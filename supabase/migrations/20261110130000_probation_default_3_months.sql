-- Probation is 3 months by default, the usual length in care, with reviews
-- at 1, 2 and 3 months (issue report 95). It was 6 with reviews at 1, 3 and
-- 6. A company still at the old default never chose it, so it moves to the
-- new one, and so does the probation end of anyone there still in
-- probation at six months from their start with no review held yet; a
-- company that set its own length keeps it.
alter table public.hr_settings
  alter column probation_months set default 3,
  alter column probation_review_months set default '{1,2,3}';

with moved as (
  update public.hr_settings
  set probation_months = 3, probation_review_months = '{1,2,3}'
  where probation_months = 6 and probation_review_months = '{1,3,6}'
  returning organisation_id
)
update public.staff_employment e
set probation_ends_on = (e.start_date + interval '3 months')::date
from moved m
where e.organisation_id = m.organisation_id
  and e.probation_status = 'in_probation'
  and e.start_date is not null
  and e.probation_ends_on = (e.start_date + interval '6 months')::date
  and not exists (
    select 1 from public.probation_reviews r
    where r.user_id = e.user_id and r.organisation_id = e.organisation_id and r.held_on is not null
  );
