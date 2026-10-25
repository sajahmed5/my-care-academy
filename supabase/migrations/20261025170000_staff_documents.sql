-- ============================================================================
-- Compliance documents for current staff
-- ============================================================================
-- ROADMAP §3: the recruitment tracker covers candidates only. Right to work,
-- DBS, references and insurance for EXISTING staff — with their expiries
-- feeding the carer's task list — had nowhere to live. This is that place:
-- one row per person per document, shown in the "Recruitment & right to work"
-- section of the carer's file.
--
-- The same shape as candidate_documents: a file we hold (with an expiry when
-- the document has one), or a reasoned "not needed" (a carer who does not
-- drive needs no business car insurance). Never both, never neither.
--
-- Files go in the private staff-docs bucket, written and read as the service
-- role from console-only actions (staff-doc-actions.ts), which check the
-- person is in the caller's organisation and the package includes
-- recruitment.tracker. lib/user-erasure lists this table: it cascades on
-- users.id, so the file paths would otherwise go with the row and leave the
-- files behind.

create table public.staff_documents (
  id                   uuid primary key default gen_random_uuid(),
  organisation_id      uuid not null references public.organisations (id) on delete cascade,
  user_id              uuid not null references public.users (id) on delete cascade,
  doc_type             text not null check (doc_type in ('right_to_work', 'dbs', 'references', 'insurance')),
  file_path            text,
  file_name            text,
  expires_at           date,
  not_required         boolean not null default false,
  not_required_reason  text,
  uploaded_by          uuid references public.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, doc_type),
  check ((not_required and file_path is null) or (not not_required and file_path is not null))
);

create index staff_documents_org_idx on public.staff_documents (organisation_id, expires_at);

create trigger staff_documents_set_updated_at
  before update on public.staff_documents
  for each row execute function public.set_updated_at();

-- Grants (AGENTS.md): every write goes through the service role; console
-- users read their own organisation's rows under RLS; nothing to anon.
-- Supabase still adds its automatic grant to a new table (see
-- 20261024150000), so what is not wanted is revoked explicitly.
grant select, insert, update, delete on public.staff_documents to service_role;
revoke all on public.staff_documents from anon;
revoke insert, update, delete, truncate, references, trigger on public.staff_documents from authenticated;
grant select on public.staff_documents to authenticated;

alter table public.staff_documents enable row level security;

create policy staff_documents_platform_admin on public.staff_documents for all to authenticated
  using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));

create policy staff_documents_console_read on public.staff_documents for select to authenticated
  using (
    (select public.is_console_user())
    and organisation_id = (select public.current_org_id())
    and public.has_feature('recruitment.tracker')
  );

insert into storage.buckets (id, name, public)
values ('staff-docs', 'staff-docs', false)
on conflict (id) do nothing;
