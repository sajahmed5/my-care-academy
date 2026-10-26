import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { AUDIT_KINDS } from "@/lib/audits";
import { DUE_GROUP_LABEL, type DueRowStatus } from "@/lib/due-view";
import { dueStatus } from "@/lib/records";
import { formatDate } from "@/lib/dates";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/** Which audits are due, across the service, beside supervisions and spot checks. */
export default async function AuditsDuePage() {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const supabase = await createClient();
  const { data } = await supabase
    .from("audits")
    .select("kind, held_on, next_due")
    .eq("organisation_id", context.organisationId!)
    .order("held_on", { ascending: false })
    .limit(500);
  const now = new Date();
  const rows = AUDIT_KINDS.map((k) => {
    const last = (data ?? []).find((a) => a.kind === k.key);
    const status: DueRowStatus = last ? dueStatus((last.next_due as string | null) ?? null, now) : "never";
    return { kind: k, last: (last?.held_on as string | undefined) ?? null, next: (last?.next_due as string | null | undefined) ?? null, status };
  });
  return (
    <DashboardShell title="Audits due" context={context}>
      <div className="mx-auto max-w-4xl space-y-4">
        <p className="text-sm text-muted-foreground">Each audit, when it was last carried out and when the next one falls.</p>
        <Card>
          <CardContent className="divide-y p-0">
            {rows.map((r) => (
              <Link
                key={r.kind.key}
                href={`/org/audits?run=${r.kind.key}#run`}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50"
              >
                <span className="font-medium">{r.kind.label}</span>
                <span className="text-xs text-muted-foreground">
                  {r.last ? `Last ${fmt(r.last)} · ` : ""}
                  {r.status === "never" ? DUE_GROUP_LABEL.never : r.next ? `${DUE_GROUP_LABEL[r.status]} · next ${fmt(r.next)}` : "No date set"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
