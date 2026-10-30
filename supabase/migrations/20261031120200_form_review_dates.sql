-- ============================================================================
-- Forms: review dates (FORMS.md, "How they work")
-- ============================================================================
-- Forms that need reviewing — risk assessments, care plans, the business
-- continuity plan — carry a review date, and show in Who's due when it comes
-- round.
--
--   form_templates.review_months  how long until a completed one is due for
--                                 review, by default; null for a form that is
--                                 never reviewed (a welcome call, a consent)
--   form_responses.review_due     the date this one is due for review — set
--                                 by whoever filled it in, starting from the
--                                 form's default
--   form_responses.review_of      the earlier record this one reviews, so a
--                                 care plan's history reads as a chain
--
-- Reviewing is filling the form in again, starting from the last answers: a
-- new signed, dated document, never an edit of the old one. The latest record
-- for a form and a client (or the company, or a carer) is the one that counts.
--
-- Additive: the live code neither reads nor writes these columns.
-- ============================================================================

alter table public.form_templates
  add column if not exists review_months integer check (review_months between 1 and 60);

alter table public.form_responses
  add column if not exists review_due date,
  add column if not exists review_of uuid references public.form_responses (id) on delete set null;

create index if not exists form_responses_review_idx
  on public.form_responses (organisation_id, review_due) where review_due is not null;

-- The published care assessment is reviewed yearly.
update public.form_templates set review_months = 12
  where code = 'MCA-FORM-CARE-ASSESSMENT' and review_months is null;
