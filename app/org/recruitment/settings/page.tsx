import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { RECRUITMENT_STEPS, settingsFromRow } from "@/lib/recruitment";
import { DashboardShell } from "@/components/dashboard-shell";
import { SettingsForm } from "./settings-form";

/**
 * How this company recruits (RECRUITMENT.md): stages in order or not, the
 * optional steps it uses, a third reference, and whether anyone starts before
 * their DBS is back. Everyone in the office can read them; managers change them.
 */
export default async function RecruitmentSettingsPage() {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const { data } = await supabase.from("recruitment_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle();
  const settings = settingsFromRow(data);
  const switchable = RECRUITMENT_STEPS.filter((s) => s.canSwitchOff).map((s) => ({ key: s.key, label: s.label, hint: s.hint }));
  return (
    <DashboardShell title="Recruitment settings" context={context}>
      <SettingsForm settings={settings} switchable={switchable} canEdit={context.role === "org_admin"} />
    </DashboardShell>
  );
}
