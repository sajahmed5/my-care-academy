-- ============================================================================
-- Policies & procedures comes in two versions, not one.
-- ============================================================================
-- The catalogue has carried a single 'documents.library' row since
-- 20261023120000, but the thing we actually sell is two products (Saj, 23 Oct
-- 2026): the basic set of policies and procedures, and the full compliance
-- pack. One row cannot express that — a package either includes "the library"
-- or it does not, and there is nowhere to say which one.
--
-- Two rows rather than one row with a level: every other feature here is a
-- boolean, the packages matrix is a tick grid, and an organisation can be sold
-- the pack on its own page as an exception. A level would need a dropdown per
-- package and a third state in the exception control, to express less.
--
-- Neither row is ticked into a package: 'documents.library' never was, and
-- which packages include which version is a commercial decision for the
-- Packages screen, not a migration.
--
-- Nothing is gated on either key yet. When the documents area is built, a
-- guard on the basic library must accept the pack too — an organisation that
-- bought the bigger thing has the smaller one. Cheaper to say here than to
-- rediscover from a support ticket.
--
-- No grants: this adds rows, not tables. public.features was granted in
-- 20261023120000.
-- ============================================================================

-- The existing row becomes explicitly the basic version. Platform admins can
-- edit labels without a deploy, but lib/features.ts mirrors them and
-- tests/entitlements asserts the two agree, so the rename belongs here.
update public.features
   set label = 'Policies & procedures (basic)'
 where key = 'documents.library';

insert into public.features (key, category_key, label, is_core, sort_order) values
  ('documents.compliance_pack', 'documents', 'Full compliance pack', false, 20)
on conflict (key) do nothing;
