import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { probationFromRow } from "@/lib/hr/probation";
import { ProbationSettingsForm } from "./probation-form";

/**
 * Probation (HR-PACK.md): how long it lasts and when it's reviewed — 6
 * months with reviews at 1, 3 and 6 by default, the contract template's
 * length — and who signs HR letters. Managers only.
 */
export default async function HrSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const { data } = await supabase.from("hr_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle();
  const s = probationFromRow(data);
  return (
    <SettingsShell context={context} active="/org/settings/hr">
      <ProbationSettingsForm
        months={s.months}
        reviewMonths={s.reviewMonths.filter((m) => m < s.months)}
        signatoryName={(data?.letter_signatory_name as string | null) ?? ""}
        signatoryTitle={(data?.letter_signatory_title as string | null) ?? ""}
      />
    </SettingsShell>
  );
}
