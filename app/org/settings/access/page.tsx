import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { sanitiseHiddenAreas } from "@/lib/office-access";
import { AccessForm } from "./access-form";

/**
 * Who can see what (Saj, 2 Nov 2026, QA review Q2): a manager switches
 * whole areas of the console off for office workers. Managers only.
 */
export default async function OfficeAccessPage() {
  const context = await requireRole("org_admin");
  const supabase = await createClient();
  const [{ data: org }, { data: office }] = await Promise.all([
    supabase.from("organisations").select("office_hidden_areas").eq("id", context.organisationId!).maybeSingle(),
    supabase.from("users").select("full_name, email").eq("organisation_id", context.organisationId!).eq("role", "org_office").eq("status", "active").order("full_name"),
  ]);
  return (
    <SettingsShell context={context} active="/org/settings/access">
      <AccessForm
        initialHidden={sanitiseHiddenAreas(org?.office_hidden_areas)}
        office={(office ?? []).map((u) => ((u.full_name as string | null) || (u.email as string)) ?? "Unnamed")}
      />
    </SettingsShell>
  );
}
