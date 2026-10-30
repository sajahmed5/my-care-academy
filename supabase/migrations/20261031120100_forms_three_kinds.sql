-- ============================================================================
-- Forms: three kinds of form (FORMS.md, agreed with Saj 29 Oct 2026)
-- ============================================================================
-- Until now every library form was asked of a member of staff and filled in
-- on their own login. FORMS.md adds two more kinds:
--
--   carer    a member of staff fills it in on their own login — as today
--   client   the office fills it in about a client picked from the client
--            list; the client or family can sign on the device; it shows on
--            the client page
--   company  about the business, not a person (a business continuity plan,
--            a fire risk assessment)
--
-- form_templates.audience says which a form is. A client or company form has
-- no ask behind it, so form_responses.assignment_id becomes optional and the
-- response says what it is about: subject, and for a client form, client_id.
-- user_id stays the person who filled it in, and the insert still runs as
-- them, so a response remains that person's own record.
--
-- Signatures captured on the device (the client, or a family member signing
-- for them) are kept with the response: [{ role, name, relationship, image,
-- signed_at }], image a PNG data URL from the signature pad.
--
-- Additive and safe for the code that is live now: it inserts carer responses
-- with an assignment and no subject, which the defaults and the policy below
-- still accept.
-- ============================================================================

alter table public.form_templates
  add column if not exists audience text not null default 'carer'
    check (audience in ('carer', 'client', 'company'));

alter table public.form_responses
  alter column assignment_id drop not null,
  add column if not exists subject text not null default 'carer'
    check (subject in ('carer', 'client', 'company')),
  -- set null, as every other link to a client does: removing a client from
  -- the list must not delete the signed documents about them.
  add column if not exists client_id uuid references public.clients (id) on delete set null,
  add column if not exists signatures jsonb not null default '[]'::jsonb;

-- A carer response is always an answer to an ask; the other two never are.
alter table public.form_responses
  drop constraint if exists form_responses_subject_shape;
alter table public.form_responses
  add constraint form_responses_subject_shape check (
    (subject = 'carer' and assignment_id is not null)
    or (subject <> 'carer' and assignment_id is null)
  );

create index if not exists form_responses_client_idx
  on public.form_responses (client_id, submitted_at desc) where client_id is not null;
create index if not exists form_responses_subject_idx
  on public.form_responses (organisation_id, subject, template_id, submitted_at desc);

-- The insert stays the filler's own (user_id = them, their organisation). A
-- client or company form is console work, in a package with forms, and a
-- client form must be about one of the organisation's own clients.
drop policy if exists form_responses_own_insert on public.form_responses;
create policy form_responses_own_insert on public.form_responses for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organisation_id = (select public.current_org_id())
    and (
      subject = 'carer'
      or (
        (select public.is_console_user())
        and (select public.has_feature('forms.builder'))
        and (
          client_id is null
          or exists (
            select 1 from public.clients c
            where c.id = client_id and c.organisation_id = (select public.current_org_id())
          )
        )
      )
    )
  );

-- The published forms that are about clients rather than staff.
update public.form_templates set audience = 'client'
  where code in ('MCA-FORM-CARE-ASSESSMENT', 'MCA-FORM-CLIENT-QA');
