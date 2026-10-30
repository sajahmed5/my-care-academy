import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { requireRole, STAFF_ROLES } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { formatDateTime } from "@/lib/dates";
import { liveKeys } from "@/lib/integration-keys";
import { describeProblems, type SyncProblem } from "@/lib/integration-status";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MyRosterControls } from "./key-controls";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * MyRoster, connected by the company itself (INTEGRATION-WHITE-LABEL.md,
 * 29 Oct 2026): the key, and how the connection is doing in plain words —
 * when MyRoster last sent its carers, how many are matched, and what it sent
 * that we couldn't use. Managers only.
 */
export default async function IntegrationPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "platform.portal_api");
  const orgId = context.organisationId!;
  const admin = createAdminClient();

  const [keys, { data: lastRun }, { count: matched }, { count: staff }, origin] = await Promise.all([
    liveKeys(orgId),
    admin
      .from("integration_sync_runs")
      .select("total, counts, problems, created_at")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .in("role", STAFF_ROLES)
      .neq("status", "deactivated")
      .not("external_ref", "is", null),
    admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .in("role", STAFF_ROLES)
      .neq("status", "deactivated"),
    siteOrigin(),
  ]);
  const key = keys.find((k) => k.system === "myroster") ?? null;
  const counts = (lastRun?.counts ?? {}) as Record<string, number>;
  const problems = describeProblems((lastRun?.problems ?? []) as SyncProblem[]);
  const unmatched = (staff ?? 0) - (matched ?? 0);

  const status = !key
    ? { icon: CircleDashed, tone: "text-muted-foreground", text: "Not connected." }
    : !key.lastUsedAt
      ? {
          icon: CircleAlert,
          tone: "text-amber-700",
          text: `Key made ${formatDateTime(key.createdAt)}, but MyRoster hasn't used it yet. Enter it in MyRoster's My Care Academy settings.`,
        }
      : {
          icon: CheckCircle2,
          tone: "text-green-700",
          text: `Connected. MyRoster last spoke to us ${formatDateTime(key.lastUsedAt)}.`,
        };

  return (
    <SettingsShell context={context} active="/org/settings/integration">
      <Card>
        <CardHeader>
          <CardTitle>MyRoster</CardTitle>
          <CardDescription>
            Once connected, MyRoster sends your carers and office staff in, assigns their training, and shows their
            training records and certificates on their MyRoster profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className={`flex items-start gap-2 ${status.tone}`}>
            <status.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {status.text}
              {key?.hint && <span className="text-muted-foreground"> The key ends {key.hint}.</span>}
            </span>
          </p>
          <MyRosterControls keyId={key?.id ?? null} apiAddress={`${origin}/api/portal`} />
        </CardContent>
      </Card>

      {key && (
        <Card>
          <CardHeader>
            <CardTitle>How it&apos;s going</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {plural(matched ?? 0, "member")} of staff here {matched === 1 ? "is" : "are"} matched to MyRoster
              {unmatched > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({plural(unmatched, "person", "people")} here {unmatched === 1 ? "isn't" : "aren't"}, so MyRoster
                  can&apos;t see their training)
                </span>
              )}
              .
            </p>
            {lastRun ? (
              <p>
                MyRoster last sent its staff {formatDateTime(lastRun.created_at as string)}:{" "}
                {plural(lastRun.total as number, "person", "people")}.{" "}
                {[
                  counts.invited && `${counts.invited} new, sent an invitation`,
                  (counts.updated ?? 0) + (counts.adopted ?? 0) > 0 &&
                    `${(counts.updated ?? 0) + (counts.adopted ?? 0)} already here`,
                  counts.skipped_not_on_platform && `${counts.skipped_not_on_platform} not invited yet`,
                  counts.skipped_archived && `${counts.skipped_archived} who have left`,
                ]
                  .filter(Boolean)
                  .join(", ")}
                .{problems.length === 0 && " Nothing went wrong."}
              </p>
            ) : (
              <p className="text-muted-foreground">MyRoster hasn&apos;t sent its staff across yet.</p>
            )}
            {problems.map((p) => (
              <div key={p.text} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">
                <p>{p.text}</p>
                <p className="mt-1 text-xs">{p.names.join(", ")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </SettingsShell>
  );
}
