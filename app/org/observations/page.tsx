import Link from "next/link";
import { ClipboardCheck, ArrowRight, Lock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { loadOrgObservationRollup } from "@/lib/observations";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/learner-ui";

export default async function ObservationsPage() {
  const context = await requireRole("org_admin");
  const supabase = await createClient();

  // Upsell when the add-on is off — a sales surface, not a dead end.
  if (!(await hasFeature(context, "training.observations"))) {
    return (
      <DashboardShell title="Care Certificate assessment" context={context}>
        <div className="mx-auto max-w-2xl space-y-6">
          <Link href="/org" className="text-sm text-muted-foreground hover:underline">
            ← Back to console
          </Link>
          <Card>
            <CardHeader>
              <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Lock className="size-5" />
              </div>
              <CardTitle>Care Certificate workplace assessment</CardTitle>
              <CardDescription>
                An add-on for organisations completing the full Care Certificate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                E-learning covers the knowledge element of the Care Certificate.
                Full achievement also requires each of the 16 standards to be
                observed in real work and signed off by the employer.
              </p>
              <p>
                This add-on gives your assessors a place to record workplace
                observations against every standard, attach evidence, and award
                the Care Certificate once a learner is fully competent — with an
                optional onsite assessment service from My Care Academy.
              </p>
              <p className="font-medium text-foreground">
                Contact My Care Academy to enable it for your organisation.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardShell>
    );
  }

  const rollup = await loadOrgObservationRollup(supabase);

  return (
    <DashboardShell title="Care Certificate assessment" context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/org" className="text-sm text-muted-foreground hover:underline">
          ← Back to console
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Workplace observation &amp; sign-off</CardTitle>
            <CardDescription>
              Record competence against each of the 16 standards, then award the
              Care Certificate. Pick a staff member to begin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rollup.length === 0 ? (
              <p className="text-sm text-muted-foreground">No staff yet.</p>
            ) : (
              <ul className="divide-y">
                {rollup.map((r) => (
                  <li key={r.userId}>
                    <Link
                      href={`/org/observations/${r.userId}`}
                      className="flex items-center justify-between gap-3 py-3 transition hover:opacity-80"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <ClipboardCheck className="size-4" />
                        </span>
                        <span className="font-medium">{r.fullName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {r.signedOff ? (
                          <StatusPill variant="completed" />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {r.observedCompetent}/{r.total} observed
                          </span>
                        )}
                        <ArrowRight className="size-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
