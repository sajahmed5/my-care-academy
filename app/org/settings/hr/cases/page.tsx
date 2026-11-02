import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { caseSettingsFromRow } from "@/lib/hr/cases";
import { CaseSettingsForm } from "./case-settings-form";

/**
 * Disciplinary and grievance (HR-PACK.md): the timescales and warning
 * lengths a company can change. Managers and office workers see cases (Saj,
 * 2 Nov 2026). The right to be accompanied and the right to appeal can't be
 * switched off. Managers only.
 */
export default async function CaseSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const { data } = await supabase.from("hr_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle();
  return (
    <SettingsShell context={context} active="/org/settings/hr/cases">
      <CaseSettingsForm initial={caseSettingsFromRow(data)} />
    </SettingsShell>
  );
}
