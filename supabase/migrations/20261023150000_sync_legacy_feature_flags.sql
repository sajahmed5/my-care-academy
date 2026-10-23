-- ============================================================================
-- Keep the old add-on switches working until they are retired
-- ============================================================================
-- Since 20261023140000 the three add-on gates ask has_feature(), which reads
-- organisation_features. But two things still WRITE the old boolean columns:
--
--   * the platform admin's organisation form (updateOrganisationAction), whose
--     three switches write forms_enabled / recruitment_enabled /
--     observations_enabled on every save
--   * the Stripe webhook (applySubscriptionToOrg), which writes forms_enabled
--     and recruitment_enabled whenever a subscription changes
--
-- Without this trigger, both are silent no-ops: the switch saves, the audit log
-- records it, and the organisation's access does not change. That is the
-- worst kind of bug — it looks like it worked.
--
-- The database is shared with whatever version of the app is deployed, so this
-- gap is real in production from the moment the predicate swap was applied
-- until the new platform screens and webhook ship. This bridges it: any write
-- that names one of the three columns is mirrored into the matching override,
-- which is exactly the old behaviour — the switch is the truth.
--
-- It fires on UPDATE OF the columns, not on every update and not on insert,
-- deliberately. A brand-new organisation has no override rows, so its add-ons
-- follow its package; a write that never mentions the columns (a rename, a
-- tier change on its own) leaves overrides alone. Only an explicit write to a
-- switch pins an override.
--
-- Goes away with the columns: once nothing writes them, this never fires, and
-- the migration that drops them drops this too.
-- ============================================================================

create or replace function public.sync_legacy_feature_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organisation_features (organisation_id, feature_key, enabled, note)
  values
    (new.id, 'forms.builder',         new.forms_enabled,
     'Set through the legacy forms_enabled switch'),
    (new.id, 'recruitment.tracker',   new.recruitment_enabled,
     'Set through the legacy recruitment_enabled switch'),
    (new.id, 'training.observations', new.observations_enabled,
     'Set through the legacy observations_enabled switch')
  on conflict (organisation_id, feature_key)
  do update set enabled = excluded.enabled, note = excluded.note;
  return new;
end;
$$;

-- Called only by the trigger; nobody should be able to invoke it directly.
revoke execute on function public.sync_legacy_feature_flags() from public, anon, authenticated;

create trigger organisations_sync_legacy_feature_flags
  after update of forms_enabled, recruitment_enabled, observations_enabled
  on public.organisations
  for each row execute function public.sync_legacy_feature_flags();
