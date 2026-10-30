import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import {
  STAGES,
  currentStage,
  nextMove,
  progress,
  jobTitlesOf,
  settingsFromRow,
  type CandidateDocRecord,
} from "@/lib/recruitment";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/learner-ui";
import { AddCandidateForm } from "./add-candidate-form";
import { ApplyLink } from "./apply-link";

const FILTERS = [
  { key: "in_progress", label: "Everyone in progress" },
  { key: "us", label: "Waiting on us" },
  { key: "them", label: "Waiting on the candidate" },
  { key: "hired", label: "Hired" },
  { key: "rejected", label: "Not taken forward" },
] as const;

/**
 * The tracker (RECRUITMENT.md, mock-up R1): one row per candidate across the
 * four stages, and who the next move is with. Amber is waiting on the office,
 * grey on the candidate or a referee.
 */
export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { show = "in_progress" } = await searchParams;

  const supabase = await createClient();
  // Embedded rather than read separately: a dozen steps a candidate passes
  // the 1,000-row cap quickly, and the cap drops rows silently.
  const [candidates, { data: settingsRow }] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("candidates")
        .select("id, full_name, role_applied, source, status, entry_date, created_at, hired_at, dbs_conviction, candidate_documents (doc_type, file_path, expires_at, not_required, review_status)")
        .eq("organisation_id", context.organisationId!)
        .order("created_at", { ascending: false })
        .range(f, t),
    ),
    supabase.from("recruitment_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle(),
  ]);
  const settings = settingsFromRow(settingsRow);

  const rows = candidates.map((c) => {
    const stages = progress((c.candidate_documents ?? []) as CandidateDocRecord[], settings, { dbsConviction: c.dbs_conviction === true });
    return { c, stages, stage: currentStage(stages), next: nextMove(stages) };
  });
  const live = rows.filter((r) => r.c.status === "candidate");
  const shown = rows.filter((r) =>
    show === "hired" ? r.c.status === "hired"
      : show === "rejected" ? r.c.status === "rejected"
        : r.c.status === "candidate" && (show === "us" ? r.next.who === "us" : show === "them" ? r.next.who === "them" : true),
  );

  const monthStart = new Date();
  monthStart.setDate(1);
  const appliedThisMonth = rows.filter((r) => new Date((r.c.created_at as string) ?? 0) >= monthStart).length;
  const hired = rows.filter((r) => r.c.status === "hired" && r.c.hired_at);
  const days = hired.map((r) => (Date.parse(r.c.hired_at as string) - Date.parse(r.c.created_at as string)) / 86_400_000);
  const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  const bySource = new Map<string, number>();
  for (const r of hired) if (r.c.source) bySource.set(r.c.source as string, (bySource.get(r.c.source as string) ?? 0) + 1);
  const topSource = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const tiles = [
    { value: String(appliedThisMonth), label: "Applied this month" },
    { value: String(live.filter((r) => r.stage === 2).length), label: "At interview" },
    { value: String(live.filter((r) => r.stage === 3).length), label: "In checks" },
    { value: avgDays === null ? "—" : `${avgDays} day${avgDays === 1 ? "" : "s"}`, label: "Average time to hire" },
    { value: topSource ?? "—", label: "Brings the most hires" },
  ];

  return (
    <DashboardShell title="Recruitment" context={context}>
      <div className="space-y-5">
        <ApplyLink />
        <details className="group rounded-2xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
            <Plus className="size-4 transition-transform group-open:rotate-45" aria-hidden="true" />
            Add a candidate
          </summary>
          <div className="border-t px-5 pb-5 pt-4">
            <AddCandidateForm jobTitles={jobTitlesOf(settingsRow?.job_titles)} />
          </div>
        </details>

        {rows.length === 0 ? (
          <EmptyState title="No candidates yet" icon={Plus}>
            Add a candidate to start their recruitment: four stages, from application to sign-up.
          </EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-2xl border bg-card p-4">
                  <p className="truncate text-2xl font-semibold">{t.value}</p>
                  <p className="text-[13px] text-muted-foreground">{t.label}</p>
                </div>
              ))}
            </div>

            <nav aria-label="Show" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={`/org/recruitment?show=${f.key}`}
                  aria-current={show === f.key ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-medium ${
                    show === f.key ? "bg-foreground text-background" : "border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </nav>

            <div className="overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-semibold">Candidate</th>
                    {STAGES.map((s) => (
                      <th key={s.stage} scope="col" className="px-3 py-3 font-semibold">{s.stage} · {s.short}</th>
                    ))}
                    <th scope="col" className="px-4 py-3 font-semibold">Next</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ c, stages, next }) => (
                    <tr key={c.id as string} className="border-t">
                      <th scope="row" className="px-4 py-3.5 text-left font-normal">
                        <Link href={`/org/recruitment/${c.id}`} className="font-semibold text-foreground hover:underline">
                          {c.full_name as string}
                        </Link>
                        <span className="block text-[13px] text-muted-foreground">
                          {[c.role_applied, c.source].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </th>
                      {stages.map((s) => (
                        <td key={s.stage} className="px-3 py-3.5">
                          {s.complete ? (
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-green-700">
                              <Check className="size-4" aria-hidden="true" /> Done
                            </span>
                          ) : s.locked ? (
                            <span className="text-[13px] text-muted-foreground">Not yet</span>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-[13px]">
                              <span aria-hidden="true" className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                                <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${s.total ? Math.round((s.done / s.total) * 100) : 0}%` }} />
                              </span>
                              {s.done} of {s.total}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3.5">
                        {c.status === "hired" ? (
                          <span className="text-[13px] font-medium text-green-700">Hired</span>
                        ) : c.status === "rejected" ? (
                          <span className="text-[13px] text-muted-foreground">Not taken forward</span>
                        ) : (
                          <span
                            className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                              next.who === "us" ? "bg-amber-100 text-amber-900" : next.who === "done" ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {next.text}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nobody here.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted-foreground">Amber is waiting on your office; grey is waiting on the candidate or a referee.</p>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
