import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { scheduleLabel, storedRecipients, type Recipient } from "@/lib/bespoke/schedule";
import { formatDate, formatDateTime } from "@/lib/dates";
import { AddSchedule, ManagersOnly, ScheduleActions } from "./controls";

export const metadata = { title: "Bespoke reports" };

interface ScheduleRow {
  id: string;
  report_id: string;
  frequency: "weekly" | "monthly";
  weekday: number | null;
  day_of_month: number | null;
  format: "pdf" | "xlsx";
  recipients: unknown;
  active: boolean;
  next_send_on: string;
  last_sent_at: string | null;
}

/**
 * The company's settings for its bespoke reports (BESPOKE-REPORTS.md): who
 * sees each report, and who it's emailed to and how often. Managers only;
 * what goes in a report is ours to build, from the request.
 */
export default async function ReportSettingsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "reports.bespoke");
  const orgId = context.organisationId!;
  // Read through the service role with the company named, like the reports
  // themselves (lib/bespoke/access.ts); the page is managers only.
  const admin = createAdminClient();
  const [{ data: reports }, { data: schedules }, { data: sends }, { data: staff }] = await Promise.all([
    admin
      .from("bespoke_reports")
      .select("id, title, description, managers_only")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("title")
      .limit(500),
    admin
      .from("report_schedules")
      .select("id, report_id, frequency, weekday, day_of_month, format, recipients, active, next_send_on, last_sent_at")
      .eq("organisation_id", orgId)
      .order("created_at")
      .limit(1000),
    admin
      .from("report_sends")
      .select("id, report_id, sent_at, recipients, format, ok, error")
      .eq("organisation_id", orgId)
      .order("sent_at", { ascending: false })
      .limit(100),
    admin
      .from("users")
      .select("full_name, email")
      .eq("organisation_id", orgId)
      .in("role", ["org_admin", "org_office"])
      .eq("status", "active")
      .order("full_name")
      .limit(200),
  ]);
  const people: Recipient[] = (staff ?? [])
    .filter((u) => u.email)
    .map((u) => ({ name: (u.full_name as string | null) || (u.email as string), email: u.email as string }));

  return (
    <SettingsShell context={context} active="/org/settings/reports">
      {(reports ?? []).length === 0 ? (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No reports built for you yet. Ask for one on{" "}
          <Link href="/org/reports#our-reports" className="font-medium text-primary hover:underline">
            Evidence &amp; exports
          </Link>
          ; once it&apos;s ready, you choose here who sees it and who it&apos;s emailed to.
        </p>
      ) : (
        (reports ?? []).map((r) => {
          const mine = ((schedules ?? []) as ScheduleRow[]).filter((s) => s.report_id === r.id);
          const recent = (sends ?? []).filter((s) => s.report_id === r.id).slice(0, 5);
          return (
            <section key={r.id as string} className="space-y-4 rounded-xl border bg-card p-5">
              <div>
                <Link href={`/org/reports/bespoke/${r.id}`} className="font-semibold text-primary hover:underline">
                  {r.title as string}
                </Link>
                {r.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.description as string}</p>}
              </div>

              <ManagersOnly reportId={r.id as string} value={r.managers_only as boolean} />

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Emailed on a schedule</h3>
                {mine.length === 0 && <p className="text-sm text-muted-foreground">Not emailed to anyone yet.</p>}
                <ul className="space-y-2">
                  {mine.map((s) => {
                    const recipients = storedRecipients(s.recipients);
                    const sched = { frequency: s.frequency, weekday: s.weekday, dayOfMonth: s.day_of_month, format: s.format };
                    return (
                      <li key={s.id} className="space-y-1 rounded-lg border p-3 text-sm">
                        <p className="font-medium">
                          {scheduleLabel(sched)}
                          {!s.active && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">Paused</span>}
                        </p>
                        <p className="text-muted-foreground">To {recipients.map((p) => p.name).join(", ")}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.active && `Next: ${formatDate(`${s.next_send_on}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" })}`}
                          {s.last_sent_at && `${s.active ? " · " : ""}Last sent ${formatDateTime(s.last_sent_at)}`}
                        </p>
                        <ScheduleActions
                          reportId={r.id as string}
                          active={s.active}
                          people={people}
                          schedule={{ id: s.id, frequency: s.frequency, weekday: s.weekday, dayOfMonth: s.day_of_month, format: s.format, recipients }}
                        />
                      </li>
                    );
                  })}
                </ul>
                <AddSchedule reportId={r.id as string} people={people} />
              </div>

              {recent.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Recently sent</summary>
                  <ul className="mt-2 space-y-1">
                    {recent.map((s) => (
                      <li key={s.id as string} className={s.ok ? "" : "text-red-700"}>
                        {formatDateTime(s.sent_at as string)} · {s.format === "xlsx" ? "Excel" : "PDF"} to {(s.recipients as string[]).length}{" "}
                        {(s.recipients as string[]).length === 1 ? "person" : "people"}
                        {s.error ? ` · ${s.error as string}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })
      )}
    </SettingsShell>
  );
}
