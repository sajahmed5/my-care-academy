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
import { importReferees } from "@/lib/reference-requests";
import { isFreeWebmail } from "@/lib/recruitment-references";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ReferencesPanel, type RefereeView } from "./references-panel";

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
  const admin = createAdminClient();
  const a = await latestAttempt(admin, id);
  // Referees: copied from their application the first time anyone looks.
  await importReferees(admin, id, context.organisationId!);
  const [{ data: refRows }, { data: interview }, { data: offerLetter }, { data: starter }] = await Promise.all([
    admin
      .from("candidate_references")
      .select("id, position, referee_type, referee_name, email, phone, organisation, status, requested_at, reminder_count")
      .eq("candidate_id", id)
      .order("position"),
    admin.from("candidate_interviews").select("status, overall_score, outcome").eq("candidate_id", id).maybeSingle(),
    admin.from("candidate_letters").select("sent_at").eq("candidate_id", id).eq("kind", "offer").maybeSingle(),
    admin.from("candidate_starter_forms").select("status, submitted_at").eq("candidate_id", id).maybeSingle(),
  ]);
  const referees: RefereeView[] = (refRows ?? []).map((r) => ({
    id: r.id as string,
    position: r.position as number,
    type: r.referee_type as string,
    name: r.referee_name as string,
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    organisation: (r.organisation as string | null) ?? null,
    status: r.status as string,
    requested: r.requested_at ? formatDate(r.requested_at as string) : null,
    reminders: (r.reminder_count as number) ?? 0,
    webmailEmployer: r.referee_type === "Previous employer" && isFreeWebmail(r.email as string | null),
  }));
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
  const interviewConfirmed = stages.flatMap((x) => x.steps).find((st) => st.key === "interview")?.state === "confirmed";
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
              {s.stage === 2 && !s.locked && (
                <li className="border-t bg-muted/30 px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="font-medium">Interview record</span>
                    <span className="text-muted-foreground">
                      {interview?.status === "complete"
                        ? `Scored ${interview.overall_score} of 5 · ${interview.outcome}.`
                        : interview
                          ? "Started, not finished."
                          : "Fill it in as the interview runs."}
                    </span>
                    <Link href={`/org/recruitment/${id}/interview`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      {interview ? "Open the interview record" : "Start the interview record"}
                    </Link>
                  </div>
                </li>
              )}
              {s.stage === 2 && !s.locked && status === "candidate" && (
                <li className="border-t bg-muted/30 px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="font-medium">Offer letter</span>
                    <span className="text-muted-foreground">
                      {offerLetter?.sent_at
                        ? `Sent ${formatDate(offerLetter.sent_at as string)}.`
                        : interviewConfirmed
                          ? "Write it, with why you chose them, and email it."
                          : "Once the interview is confirmed."}
                    </span>
                    {interviewConfirmed && (
                      <Link href={`/org/recruitment/${id}/offer`} className={buttonVariants({ size: "sm", variant: offerLetter?.sent_at ? "outline" : "default" })}>
                        {offerLetter?.sent_at ? "Open the offer" : offerLetter ? "Carry on with the offer" : "Write the offer"}
                      </Link>
                    )}
                  </div>
                </li>
              )}
              {s.stage === 3 && !s.locked && s.steps.some((st) => st.key === "starter_form") && (
                <li className="border-t bg-muted/30 px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="font-medium">Health, equality and DBS form</span>
                    <span className="text-muted-foreground">
                      {starter?.status === "submitted"
                        ? `Sent in ${formatDate(starter.submitted_at as string)}.`
                        : starter
                          ? "They've started it."
                          : candidate.user_id
                            ? "They fill it in when they sign in to their application."
                            : "They fill it in once they have a login: sending the offer gives them one."}
                    </span>
                    {starter?.status === "submitted" && (
                      <Link href={`/org/recruitment/${id}/starter`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                        Read their answers
                      </Link>
                    )}
                  </div>
                </li>
              )}
              {s.stage === 3 && !s.locked && (
                <li className="border-t bg-muted/30 px-5 py-3.5">
                  <ReferencesPanel candidateId={id} referees={referees} slots={3} />
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
