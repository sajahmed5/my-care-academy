import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import { formatDateTime } from "@/lib/dates";
import { liveKeys } from "@/lib/integration-keys";
import { ALERT_EVENTS } from "@/lib/alert-signing";
import { SettingsShell } from "@/app/org/settings/settings-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OtherSystemKey, RevokeKey } from "../key-controls";
import { AddAlertEndpoint, AlertEndpointControls } from "../alert-controls";

const EVENT_LABEL: Record<string, string> = {
  ...Object.fromEntries(ALERT_EVENTS.map((e) => [e.key, e.label])),
  ping: "Test",
};

/**
 * Other systems (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026): a rota system
 * other than MyRoster connects to us. Its developers build against our
 * published API (/developers) with a key made here, and we send it alerts at
 * an address it gives. Managers only.
 */
export default async function OtherSystemsPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "platform.portal_api");
  const orgId = context.organisationId!;
  const admin = createAdminClient();

  const [keys, { data: endpoints }, { data: deliveries }, origin] = await Promise.all([
    liveKeys(orgId),
    admin
      .from("alert_endpoints")
      .select("id, label, url, events, active, last_attempt_at, last_status, last_error, consecutive_failures")
      .eq("organisation_id", orgId)
      .order("created_at"),
    admin
      .from("alert_deliveries")
      .select("id, endpoint_id, event, ok, error, attempts, created_at")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    siteOrigin(),
  ]);
  const others = keys.filter((k) => k.system === "other");
  const apiAddress = `${origin}/api/portal`;

  return (
    <SettingsShell context={context} active="/org/settings/integration/other">
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Another rota or care system can connect to us without anything being built on our side: its developers
          follow{" "}
          <Link href="/developers" className="font-medium text-primary hover:underline">
            our API documentation
          </Link>{" "}
          with a key you make here. Connections we build into a particular system, to read its carers or rota, are
          made when a customer asks for one: if that&apos;s what you need,{" "}
          <Link href="/contact?topic=integration" className="font-medium text-primary hover:underline">
            tell us which system
          </Link>
          .
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keys</CardTitle>
          <CardDescription>One for each system, so you can switch one off without touching the others.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {others.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {others.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <p className="font-medium">{k.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Made {formatDateTime(k.createdAt)}
                      {k.hint && `, ends ${k.hint}`} ·{" "}
                      {k.lastUsedAt ? `last used ${formatDateTime(k.lastUsedAt)}` : "not used yet"}
                    </p>
                  </div>
                  <RevokeKey keyId={k.id} label={k.label} />
                </li>
              ))}
            </ul>
          )}
          <OtherSystemKey apiAddress={apiAddress} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>
            We tell another system when something happens here, at an address it gives you. Each alert is signed so it
            can check the alert came from us.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          {(endpoints ?? []).map((e) => {
            const recent = (deliveries ?? []).filter((d) => d.endpoint_id === e.id).slice(0, 5);
            const failing = (e.consecutive_failures as number) > 0;
            return (
              <div key={e.id as string} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{e.label as string}</p>
                  {!e.active && <Badge variant="secondary">Paused</Badge>}
                  {(e.events as string[]).map((ev) => (
                    <Badge key={ev} variant="outline">
                      {EVENT_LABEL[ev] ?? ev}
                    </Badge>
                  ))}
                </div>
                <p className="break-all text-xs text-muted-foreground">{e.url as string}</p>
                <p className={failing ? "text-amber-700" : "text-muted-foreground"}>
                  {!e.last_attempt_at
                    ? "Nothing sent yet."
                    : failing
                      ? `The last ${e.consecutive_failures === 1 ? "alert" : `${e.consecutive_failures} alerts`} didn't get through (${e.last_error}). We try again for three days.`
                      : `The last alert got through, ${formatDateTime(e.last_attempt_at as string)}.`}
                </p>
                <AlertEndpointControls id={e.id as string} label={e.label as string} active={e.active as boolean} />
                {recent.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {recent.map((d) => (
                      <li key={d.id as string}>
                        {formatDateTime(d.created_at as string)} · {EVENT_LABEL[d.event as string] ?? d.event} ·{" "}
                        {d.ok ? "received" : `not received: ${d.error ?? "waiting"}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <AddAlertEndpoint />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
