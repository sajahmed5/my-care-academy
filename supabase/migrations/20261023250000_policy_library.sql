-- ============================================================================
-- The policies & procedures library.
-- ============================================================================
-- documents.library has been sellable since the catalogue was seeded and in
-- Growth and above since 20261023240000, with nothing behind it. This is the
-- shelf it was sold as.
--
-- The content comes from HG Care's own library — 200 coded, versioned,
-- recently-reviewed policies — and the decision that shapes this table is
-- Saj's (23 Oct 2026): the master is branded **My Care Academy**, and an
-- organisation with white-label sees **its own name** instead. That is why
-- the text is held as blocks with a placeholder rather than as a PDF: the
-- company name appears 1,579 times across those 200 documents, and no amount
-- of stamping a cover page fixes the sentence that names somebody else's
-- company in the middle of a procedure.
--
-- So: one master library owned by the platform, rendered per organisation.
-- Nothing here is per-organisation except the acknowledgements.
-- ============================================================================

create table public.policy_documents (
  id                uuid primary key default gen_random_uuid(),
  -- The code the sector already uses on paper: CC12, PR04, QA07.
  code              text not null unique,
  title             text not null,
  category          text not null,
  -- Which packages include it. The basic library is a subset of the full
  -- compliance pack; which policies make up "basic" is a commercial decision
  -- and everything starts in the full pack until it is made.
  pack              text not null default 'full' check (pack in ('basic', 'full')),
  -- Homecare, care home, or both. Null means it applies to everyone — the
  -- common case, and the reason this is nullable rather than defaulted.
  service_types     text[],
  issue             integer,
  version           integer,
  -- When the source document was last reviewed, which is not when we imported
  -- it. An inspector asks the first question.
  source_updated_on date,
  -- The policy itself: [{ type: 'heading' | 'paragraph', text }, …] with
  -- {{organisation}} wherever the company is named.
  blocks            jsonb not null default '[]'::jsonb,
  -- Imported text is a machine's reading of a PDF. Nothing reaches a customer
  -- until a human has read it back, so everything lands as 'draft'.
  status            text not null default 'draft'
                      check (status in ('draft', 'published', 'retired')),
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index policy_documents_category_idx
  on public.policy_documents (category, sort_order, code);
create index policy_documents_status_idx on public.policy_documents (status);

create trigger policy_documents_set_updated_at
  before update on public.policy_documents
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Acknowledgements — the half that is worth paying for.
-- ============================================================================
-- A library of files is a shared drive. "Who has read and accepted this
-- version" is evidence, and it is what the carer file and the evidence pack
-- will show. The version is stored on the row rather than looked up: when a
-- policy is revised, the old acknowledgement stays true about the old text and
-- the new version is unacknowledged, which is exactly what should happen.
create table public.policy_acknowledgements (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  policy_id       uuid not null references public.policy_documents (id) on delete cascade,
  version         integer not null,
  acknowledged_at timestamptz not null default now(),
  unique (user_id, policy_id, version)
);

create index policy_ack_org_idx
  on public.policy_acknowledgements (organisation_id, policy_id);

-- ============================================================================
-- Grants (changelog 45329). RLS gates the rows; this is the outer gate.
-- ============================================================================
grant select, insert, update, delete on public.policy_documents to service_role;
grant select on public.policy_documents to authenticated;
grant select, insert, update, delete on public.policy_acknowledgements to service_role;
grant select, insert on public.policy_acknowledgements to authenticated;
-- Nothing to anon, and deliberately no update or delete to authenticated on
-- acknowledgements: "I read it" is a fact with a date, not a setting.

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.policy_documents enable row level security;
alter table public.policy_acknowledgements enable row level security;

-- The library is ours. Platform admins maintain it; everyone else reads the
-- published ones, and only if their organisation has the feature.
create policy policy_documents_platform_admin on public.policy_documents for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy policy_documents_read on public.policy_documents for select to authenticated
  using (status = 'published' and public.has_feature('documents.library'));

create policy policy_ack_platform_admin on public.policy_acknowledgements for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy policy_ack_org_admin_read on public.policy_acknowledgements for select to authenticated
  using (
    public.current_user_role() = 'org_admin'
    and organisation_id = public.current_org_id()
  );

-- A carer accepts a policy themselves — the one place in the product where a
-- learner writes a compliance record, because an acknowledgement nobody made
-- themselves is worth nothing as evidence.
create policy policy_ack_own_read on public.policy_acknowledgements for select to authenticated
  using (user_id = (select auth.uid()));

create policy policy_ack_own_insert on public.policy_acknowledgements for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and organisation_id = public.current_org_id()
    and public.has_feature('documents.library')
  );
