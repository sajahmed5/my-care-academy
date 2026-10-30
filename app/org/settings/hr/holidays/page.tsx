import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { OUR_LEAVE_TYPES, holidaySettingsFromRow } from "@/lib/hr/holidays";
import { HolidaySettingsForm } from "./holiday-settings-form";

/**
 * Holidays (HR-PACK.md): when the leave year starts, whether bank holidays
 * come out of the allowance, the "no more than X off at once" warning, and
 * the company's own kinds of leave beside ours. Managers only.
 */
export default async function HolidaySettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const { data } = await supabase.from("hr_settings").select("leave_year_start, bank_holidays_from_allowance, max_off_at_once, leave_types").eq("organisation_id", context.organisationId!).maybeSingle();
  const s = holidaySettingsFromRow(data);
  return (
    <SettingsShell context={context} active="/org/settings/hr/holidays">
      <HolidaySettingsForm initial={s} ours={OUR_LEAVE_TYPES.map((t) => ({ label: t.label, fromAllowance: t.fromAllowance }))} />
    </SettingsShell>
  );
}
