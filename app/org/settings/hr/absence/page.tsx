import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { sanitiseTriggers } from "@/lib/hr/absence";
import { AbsenceSettingsForm } from "./absence-form";

/**
 * Absence (HR-PACK.md): reporting sick from their own login — off by
 * default, since in home care carers usually ring the on-call line — and the
 * Bradford Factor trigger points. Managers only.
 */
export default async function AbsenceSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const { data } = await supabase.from("hr_settings").select("self_report_sickness, bradford_triggers").eq("organisation_id", context.organisationId!).maybeSingle();
  return (
    <SettingsShell context={context} active="/org/settings/hr/absence">
      <AbsenceSettingsForm selfReport={data?.self_report_sickness === true} triggers={sanitiseTriggers(data?.bradford_triggers)} />
    </SettingsShell>
  );
}
