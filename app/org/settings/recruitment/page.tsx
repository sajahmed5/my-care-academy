import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { RECRUITMENT_STEPS, settingsFromRow } from "@/lib/recruitment";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { SettingsForm } from "./settings-form";
import { letterDefaultsFromRow } from "@/lib/recruitment-letters";
import { DEFAULT_WELCOME_GUIDE, sanitiseContacts } from "@/lib/welcome-pack";

/**
 * How this company recruits (RECRUITMENT.md): stages in order or not, the
 * optional steps it uses, a third reference, and whether anyone starts before
 * their DBS is back. Managers only, under Settings.
 */
export default async function RecruitmentSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const { data } = await supabase.from("recruitment_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle();
  const settings = settingsFromRow(data);
  const switchable = RECRUITMENT_STEPS.filter((s) => s.canSwitchOff).map((s) => ({ key: s.key, label: s.label, hint: s.hint }));
  return (
    <SettingsShell context={context} active="/org/settings/recruitment">
      <SettingsForm
        settings={settings}
        letters={letterDefaultsFromRow(data)}
        welcome={{
          onHire: data?.welcome_on_hire !== false,
          guide: (data?.welcome_guide as string | null) ?? DEFAULT_WELCOME_GUIDE,
          contacts: sanitiseContacts(data?.welcome_contacts),
        }} switchable={switchable} canEdit />
    </SettingsShell>
  );
}
