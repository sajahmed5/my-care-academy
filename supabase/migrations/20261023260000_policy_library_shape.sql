-- ============================================================================
-- The library is My Care Academy's own templates, not HG Care's policies.
-- ============================================================================
-- 20261023250000 was built around the wrong source. HG Care's own policies are
-- that company's finished documents; what we sell is the My Care Academy pack,
-- which is a different thing in three ways that the schema has to know about:
--
--   1. It is already split the way we sell it — Domiciliary Care and
--      Residential Care Home, each with a CQC Basic set and a Full Compliance
--      Pack, plus add-on packs for complaints and recruitment.
--   2. It is a mix of policies, forms to fill in, and logs. A policy is read
--      and acknowledged; a MAR chart is printed and used. They do not belong
--      on the same screen.
--   3. The documents are TEMPLATES. They carry [ORGANISATION NAME] and
--      bracketed guidance — "[State who this policy applies to]" — for the
--      provider to complete. That is the product: a CQC-ready skeleton, not
--      somebody else's finished policy.
--
-- Point 3 has a consequence this migration does not yet answer: an
-- organisation's completed copy is not the master, so acknowledgements will
-- eventually hang off their version rather than ours. Recorded in ROADMAP.md.
-- ============================================================================

alter table public.policy_documents
  -- Where it came from, so a draft that reads oddly can be checked against the
  -- file it was made from.
  add column if not exists source_file text,
  -- What the thing IS. A library that mixes policies with blank forms teaches
  -- people to scroll past both.
  add column if not exists kind text not null default 'policy'
    check (kind in ('policy', 'form', 'log')),
  -- Which pack it belongs to, by name, for the add-ons that are sold
  -- separately rather than by tier.
  add column if not exists collection text;

-- 'addon' joins basic and full: the complaints and recruitment packs are sold
-- alongside a tier, not inside one.
alter table public.policy_documents drop constraint if exists policy_documents_pack_check;
alter table public.policy_documents
  add constraint policy_documents_pack_check
  check (pack in ('basic', 'full', 'addon'));

create index if not exists policy_documents_pack_idx
  on public.policy_documents (pack, kind);
