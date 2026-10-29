import { notFound } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { currentStage, outstandingSteps, progress, settingsFromRow, STAGES, type CandidateDocRecord } from "@/lib/recruitment";
import { DashboardShell } from "@/components/dashboard-shell";
import { StepRow, type StepView } from "../step-row";
import { CandidateActions, DbsConviction } from "./candidate-detail";
import { ApplicationTools } from "./application-tools";
import { LiteracyPanel, type AttemptView } from "./literacy-panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { latestAttempt } from "@/lib/literacy-attempts";
import { markLiteracy, sanitiseLiteracyAnswers } from "@/lib/literacy-test";

/**
 * One candidate (RECRUITMENT.md): the four stages, each step with where it
 * stands and what the office can do. Finished stages fold away; a stage
 * locked behind an earlier one says so.
 */
export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: candidate }, { data: docs }, { data: settingsRow }, { data: application }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, email, phone, postcode, entry_date, status, role_applied, source, dbs_conviction, hired_at, rejected_at, user_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("candidate_documents")
      .select("id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason, review_status, review_note, uploaded_by_candidate")
      .eq("candidate_id", id),
    supabase.from("recruitment_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle(),
    supabase.from("candidate_applications").select("status, sent_at").eq("candidate_id", id).maybeSingle(),
  ]);
  if (!candidate) notFound();

  // The latest literacy attempt, marked here (the key never leaves the server).
  const a = await latestAttempt(createAdminClient(), id);
  const attempt: AttemptView | null = a
    ? {
        attemptNo: a.attempt_no as number,
        mode: a.mode as string,
        status: a.status as string,
        score: (a.score as number | null) ?? null,
        max: (a.max_score as number | null) ?? null,
        percent: (a.percent as number | null) ?? null,
        passed: (a.passed as boolean | null) ?? null,
        leftPage: (a.left_page_count as number) ?? 0,
        endedByTime: a.ended_by === "time",
        marked: a.status === "submitted" ? markLiteracy(sanitiseLiteracyAnswers(a.answers)).questions : [],
      }
    : null;
  const settings = settingsFromRow(settingsRow);
  const stages = progress((docs ?? []) as CandidateDocRecord[], settings, { dbsConviction: candidate.dbs_conviction === true });
  const now = currentStage(stages);
  const outstanding = outstandingSteps(stages, settings);
  const status = candidate.status as string;
  const meta = [
    candidate.role_applied,
    candidate.source && `heard about us through ${candidate.source}`,
    candidate.entry_date && `applied ${formatDate(candidate.entry_date as string)}`,
  ].filter(Boolean).join(" · ");

  return (
    <DashboardShell title={candidate.full_name as string} context={context} back={{ href: "/org/recruitment", label: "Recruitment" }}>
      <div className="max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            {status === "hired" ? "Hired" : status === "rejected" ? "Not taken forward" : `Stage ${now} · ${STAGES[now - 1].label}`}
          </span>
          {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
          {(candidate.email || candidate.phone) && (
            <span className="text-sm text-muted-foreground">{[candidate.email, candidate.phone].filter(Boolean).join(" · ")}</span>
          )}
        </div>

        <CandidateActions
          candidateId={id}
          status={status}
          hasEmail={!!candidate.email}
          outstanding={outstanding.map((s) => (s.state === "expired" ? `${s.label} (expired)` : s.label))}
        />

        {stages.map((s) => {
          const steps: StepView[] = s.steps.map((st) => ({
            key: st.key,
            label: st.label,
            hint: st.hint,
            optionalNote: st.optionalNote,
            tracksExpiry: st.tracksExpiry,
            required: st.required,
            locked: st.locked,
            state: st.state,
            doc: (docs ?? []).find((d) => d.doc_type === st.key) as StepView["doc"],
          }));
          const body = (
            <ul className="border-t">
              {steps.map((st) => (
                <StepRow key={st.key} candidateId={id} step={st} />
              ))}
              {s.stage === 1 && !s.locked && (
                <li className="border-t bg-muted/30 px-5 py-3.5">
                  <ApplicationTools
                    candidateId={id}
                    status={(application?.status as "draft" | "submitted" | undefined) ?? "none"}
                    hasEmail={!!candidate.email}
                    sentAt={application?.sent_at ? formatDate(application.sent_at as string) : null}
                    hasLogin={!!candidate.user_id}
                  />
                </li>
              )}
              {s.stage === 1 && !s.locked && s.steps.some((st) => st.key === "literacy") && (
                <li className="border-t bg-muted/30 px-5 py-3.5">
                  <LiteracyPanel candidateId={id} hasEmail={!!candidate.email} attempt={attempt} />
                </li>
              )}
              {s.stage === 3 && !s.locked && (
                <li className="border-t bg-muted/30 px-5 py-3.5">
                  <DbsConviction candidateId={id} conviction={candidate.dbs_conviction === true} />
                </li>
              )}
            </ul>
          );
          if (s.locked) {
            return (
              <section key={s.stage} aria-label={`Stage ${s.stage}`} className="rounded-2xl border border-dashed bg-card/60 px-5 py-4">
                <h2 className="flex items-center gap-2 font-semibold text-muted-foreground">
                  <Lock className="size-4" aria-hidden="true" /> Stage {s.stage} · {s.label}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.steps.map((st) => st.label).join(", ")}. Opens when stage {s.stage - 1} is done: your company does the stages in order.
                </p>
              </section>
            );
          }
          if (s.complete && s.stage !== now) {
            return (
              <details key={s.stage} className="rounded-2xl border bg-card">
                <summary className="flex cursor-pointer items-center gap-2.5 px-5 py-4 font-semibold">
                  <CheckCircle2 className="size-5 text-green-700" aria-hidden="true" /> Stage {s.stage} · {s.label}
                  <span className="text-sm font-normal text-muted-foreground">{s.done} of {s.total} done</span>
                </summary>
                {body}
              </details>
            );
          }
          return (
            <section key={s.stage} aria-labelledby={`stage-${s.stage}`} className={`overflow-hidden rounded-2xl border bg-card ${s.stage === now && status === "candidate" ? "border-primary" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
                <h2 id={`stage-${s.stage}`} className="font-semibold">Stage {s.stage} · {s.label}</h2>
                <span className="text-sm text-muted-foreground">{s.done} of {s.total} done</span>
              </div>
              {body}
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}
