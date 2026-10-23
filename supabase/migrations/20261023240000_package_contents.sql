-- ============================================================================
-- What each package actually includes, now that there is something to include.
-- ============================================================================
-- Six features have been built since the catalogue was seeded and ticked into
-- nothing: the policies library and the full compliance pack, supervisions,
-- spot checks, the complaints register, and — from before — white-label and
-- the rostering integration. Locked for every organisation is the right
-- default while a thing is half-built; it is the wrong one now.
--
-- The shape follows the prices (Saj, 23 Oct 2026 — £49 / £99 / £149 / £249),
-- and each tier is a job rather than a bag of features:
--
--   Starter      Train my staff and prove it.
--   Growth       …and keep my own paperwork: forms, policies.
--   Pro          …and run my compliance: recruitment, complaints,
--                supervisions, spot checks, the full compliance pack.
--   Enterprise   …and make it ours: Care Certificate assessment, our branding,
--                our rostering system.
--
-- Additive. No tick is removed, so no organisation loses anything today.
-- Where an organisation has an exception of its own — Norwood Drive has three
-- switched off — the exception still wins, as it should.
-- ============================================================================

insert into public.tier_features (tier_key, feature_key) values
  -- Growth: your own paperwork.
  ('core_forms',       'documents.library'),

  -- Pro: everything in Growth, plus running your compliance.
  ('core_recruitment', 'documents.library'),
  ('core_recruitment', 'documents.compliance_pack'),
  ('core_recruitment', 'complaints.register'),
  ('core_recruitment', 'people.supervisions'),
  ('core_recruitment', 'people.competency'),

  -- Enterprise: everything in Pro, plus the platform itself.
  ('full',             'documents.library'),
  ('full',             'documents.compliance_pack'),
  ('full',             'complaints.register'),
  ('full',             'people.supervisions'),
  ('full',             'people.competency'),
  ('full',             'platform.white_label'),
  ('full',             'platform.portal_api')
on conflict do nothing;

-- ============================================================================
-- The ladder, checked rather than asserted in a comment.
-- ============================================================================
-- "Each tier has everything before and more" is a promise the pricing page
-- makes in writing ("Everything in Growth"). A tick removed on the Packages
-- screen can still break it later — nothing stops that, by design, because a
-- platform admin must be able to compose a package. But a migration that
-- leaves it broken on the way in would ship the lie itself.
do $$
declare
  prev   text;
  prev_n text;
  cur    record;
  missing text[];
begin
  for cur in
    select t.key, t.label, t.sort_order,
           coalesce(array_agg(tf.feature_key order by tf.feature_key)
                    filter (where tf.feature_key is not null), '{}') as feats
      from public.subscription_tiers t
      left join public.tier_features tf on tf.tier_key = t.key
     group by t.key, t.label, t.sort_order
     order by t.sort_order
  loop
    if prev is not null then
      select array_agg(f) into missing
        from unnest(prev::text[]) as f
       where f <> all (cur.feats);
      if missing is not null then
        raise exception 'Package ladder broken: % does not include everything in % (missing %)',
          cur.label, prev_n, missing;
      end if;
    end if;
    prev := cur.feats::text;
    prev_n := cur.label;
  end loop;
end $$;

-- ============================================================================
-- Taglines follow the contents.
-- ============================================================================
-- Pro was "training and forms, plus recruitment compliance" when that was all
-- it had. lib/organisations.ts carries the copy the public pricing page uses;
-- these two have been identical since the catalogue was seeded.
update public.subscription_tiers
   set tagline = 'Training plus your own paperwork.'
 where key = 'core_forms';
update public.subscription_tiers
   set tagline = 'Everything it takes to run compliance, not just training.'
 where key = 'core_recruitment';
