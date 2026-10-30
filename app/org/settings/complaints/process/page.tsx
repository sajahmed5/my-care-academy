import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { loadStages } from "@/lib/complaints/data";
import { buildSteps } from "@/lib/complaints/steps";
import { SeedStages } from "@/app/org/complaints/seed-stages";
import { StageEditor } from "./stage-editor";

/**
 * The organisation's process: its stages, what each opens, which kinds of
 * record it applies to. The seven steps are shown beside them so a renamed
 * stage can be seen landing in the right place. Managers only, under Settings.
 */
export default async function StagesPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "complaints.register");
  const supabase = await createClient();
  const stages = await loadStages(supabase, context.organisationId);
  const steps = buildSteps(stages.filter((s) => s.enabled), [], false);

  return (
    <DashboardShell title="The complaints process" context={context} back={{ href: "/org/settings", label: "Settings" }}>
      <div className="space-y-6">
        {stages.length === 0 ? (
          <SeedStages />
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <p className="font-medium">The seven steps</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Where each stage sits is read from what it opens, and for a meeting from its name
                  (Triage, Findings, Follow-up — or Meeting Minutes 1, 2, 3). The steps themselves
                  are fixed; the stages inside them are yours.
                </p>
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                  {steps.map((s) => (
                    <li key={s.key} className="rounded-lg border p-2 text-sm">
                      <span className="font-medium">{s.n}. {s.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.stages.length ? s.stages.map((x) => x.name).join(", ") : "Closing the record"}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
            <StageEditor stages={stages} />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
