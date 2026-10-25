-- ============================================================================
-- The full compliance pack includes the basic policy library.
-- ============================================================================
-- documents.library is the CQC-basics set of policies; documents.compliance_pack
-- is the full pack, a superset of it. lib/features.ts has always said "a guard
-- on the basic library must treat the pack as including it", but nothing did:
-- the sidebar, the /org/policies and /learn/policies guards and the
-- policy_documents / policy_acknowledgements read policies all check
-- documents.library alone. An organisation given the pack without the library
-- (report #75, Norwood Drive) lost the Policies page altogether, and the
-- database hid every document in the pack from it.
--
-- Fixed once, here: org_has_feature answers documents.library as on whenever
-- either key is on (each by its own override, else its package). Everything
-- above it — has_feature(), my_entitlements(), every RLS policy that calls
-- them, hasFeatureForOrg() and the TypeScript guards — follows without change.
-- An override switching the library OFF does not beat the pack: you cannot
-- have the full pack and not its basics.
--
-- Only ever widens: any key that was on before is still on. Grants are
-- restated as they were (service_role only), since this takes an arbitrary
-- organisation id.

create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(bool_or(
    coalesce(
      (select ofs.enabled
         from public.organisation_features ofs
        where ofs.organisation_id = p_org
          and ofs.feature_key = k.key),
      exists (
        select 1
          from public.organisations o
          join public.tier_features tf on tf.tier_key = o.package_tier
         where o.id = p_org
           and tf.feature_key = k.key
      )
    )
  ), false)
  from unnest(
    case when p_feature = 'documents.library'
         then array['documents.library', 'documents.compliance_pack']
         else array[p_feature]
    end
  ) as k(key);
$$;
revoke execute on function public.org_has_feature(uuid, text) from public, anon, authenticated;
grant  execute on function public.org_has_feature(uuid, text) to service_role;
