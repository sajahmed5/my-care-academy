import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { caseSettingsFromRow } from "@/lib/hr/cases";
import { CaseSettingsForm } from "./case-settings-form";

/**
 * Disciplinary and grievance (HR-PACK.md): the timescales and warning
 * lengths a company can change, and which office workers may see cases
 * (managers only, by default). The right to be accompanied and the right to
 * appeal can't be switched off. Managers only.
 */
export default async function CaseSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const [{ data }, { data: office }] = await Promise.all([
    supabase.from("hr_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle(),
    supabase.from("users").select("id, full_name, email").eq("organisation_id", context.organisationId!).eq("role", "org_office").eq("status", "active").order("full_name"),
  ]);
  return (
    <SettingsShell context={context} active="/org/settings/hr/cases">
      <CaseSettingsForm
        initial={caseSettingsFromRow(data)}
        office={(office ?? []).map((u) => ({ id: u.id as string, name: ((u.full_name as string | null) || (u.email as string)) ?? "Unnamed" }))}
      />
    </SettingsShell>
  );
}
