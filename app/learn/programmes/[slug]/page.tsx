import { notFound } from "next/navigation";
import { Award, Info } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadProgramme } from "@/lib/programmes";
import { DashboardShell } from "@/components/dashboard-shell";
import { ProgressRing } from "@/components/learner-ui";
import { StandardGrid } from "./standard-grid";
import { formatDate } from "@/lib/dates";

export default async function ProgrammePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const context = await requireRole("learner");
  const { slug } = await params;

  const supabase = await createClient();
  // Workplace observation status for the learner, if the org has the add-on.
  // Tolerant of the 2B tables not existing yet (query error → no observations),
  // so this page is safe to deploy before the observations migration is applied.
  // Read alongside the programme, filtered to this learner so the user_id
  // index is used rather than an RLS check on every row.
  const [programme, obsRes, signoffRes] = await Promise.all([
    loadProgramme(supabase, slug, context.userId),
    supabase
      .from("care_cert_observations")
      .select("standard_no, status")
      .eq("user_id", context.userId),
    supabase
      .from("care_cert_signoffs")
      .select("signed_at")
      .eq("user_id", context.userId)
      .maybeSingle(),
  ]);
  if (!programme) notFound();
  const obsByStandard = new Map(
    (obsRes.data ?? []).map((o) => [o.standard_no, o.status]),
  );
  const signedOffAt: string | null = signoffRes.data?.signed_at ?? null;
  const hasObservations = obsByStandard.size > 0 || signedOffAt !== null;

  const standards = programme.standards.map((s) => ({
    ...s,
    observationStatus: hasObservations
      ? ((obsByStandard.get(s.standardNo) as
          | "pending"
          | "competent"
          | "not_yet_competent"
          | undefined) ?? "pending")
      : undefined,
  }));

  const pct = programme.total
    ? Math.round((programme.completedCount / programme.total) * 100)
    : 0;

  return (
    <DashboardShell title={programme.title} context={context}>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header: intro + overall progress ring */}
        <div className="flex flex-col items-center gap-6 rounded-3xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:flex-row sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {programme.title}
            </h2>
            {programme.summary && (
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {programme.summary}
              </p>
            )}
            <p className="mt-3 text-sm font-medium text-primary">
              {programme.completedCount} of {programme.total} standards complete
            </p>
          </div>
          <ProgressRing value={pct} color="var(--primary)">
            <span className="text-2xl font-bold">{pct}%</span>
            <span className="text-xs text-muted-foreground">complete</span>
          </ProgressRing>
        </div>

        {/* Compliance callout — non-dismissible; sourced from the DB so it can be
            edited without a deploy. This is where a learner forms the belief
            "finishing these gives me the Care Certificate", so it must be here. */}
        {programme.complianceNote && (
          <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <Info className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <p>{programme.complianceNote}</p>
          </div>
        )}

        {/* Care Certificate awarded by the employer */}
        {signedOffAt && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            <Award className="size-5 shrink-0 text-emerald-600" />
            <p>
              Your employer awarded your Care Certificate on{" "}
              {formatDate(signedOffAt)}. Well done!
            </p>
          </div>
        )}

        {/* The standards */}
        <StandardGrid standards={standards} />
      </div>
    </DashboardShell>
  );
}
