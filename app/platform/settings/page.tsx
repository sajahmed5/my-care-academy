import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsForm } from "./settings-form";
import { formatDateTime } from "@/lib/dates";

export default async function SettingsPage() {
  const context = await requireRole("platform_admin");

  const supabase = await createClient();
  const [{ data: settings }, { data: log }, { data: audit }] =
    await Promise.all([
      supabase.from("app_settings").select("key, value"),
      supabase
        .from("email_log")
        .select("type, subject, to_email, sent, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("audit_logs")
        .select("action, actor_email, entity, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

  const map = new Map((settings ?? []).map((s) => [s.key, s.value]));
  const threshold = Number(map.get("engagement_threshold_pct") ?? 50);
  const windows = (map.get("renewal_windows_days") as number[]) ?? [60, 30, 7];
  const repeat = Number(map.get("reminder_repeat_days") ?? 7);

  return (
    <DashboardShell title="Automation settings" context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/platform" className="text-sm text-muted-foreground hover:underline">
          ← Back to console
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Reminders &amp; renewals</CardTitle>
            {/* Said in the words of what it does. Naming the file the
                schedule lives in told a reader where it is not, without ever
                telling them when anything runs. */}
            <CardDescription>
              How far ahead renewals are chased, how often a reminder repeats,
              and the engagement level below which an organisation is flagged.
              The checks themselves run every morning at 7am, with a manager
              digest on Monday at 8am; those times are set in the deploy
              configuration, not here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              threshold={threshold}
              windows={windows}
              repeat={repeat}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
            <CardDescription>
              Recent sensitive actions across the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {audit && audit.length > 0 ? (
              <ul className="divide-y text-sm">
                {audit.map((a, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium">{a.action}</span>{" "}
                      <span className="text-muted-foreground">
                        {a.actor_email ?? "system"}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent notifications</CardTitle>
            <CardDescription>
              Last 15 automated emails across all organisations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {log && log.length > 0 ? (
              <ul className="divide-y text-sm">
                {log.map((l, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <span>
                      <span className="font-medium">{l.type}</span>{" "}
                      <span className="text-muted-foreground">
                        {l.to_email}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(l.created_at)}
                      {l.sent ? "" : " · not sent"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No automated emails sent yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
