import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import type { Answers } from "@/lib/recruitment-application";
import { DashboardShell } from "@/components/dashboard-shell";
import { InterviewForm } from "./interview-form";

/**
 * The interview record (RECRUITMENT.md, mock-up R5): the questions, what to
 * listen for, notes on each, then one overall score and the outcome. The
 * candidate's own answer to "why care?" from their application is shown
 * beside the first question.
 */
export default async function InterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: candidate }, { data: interview }, { data: app }, { data: me }] = await Promise.all([
    supabase.from("candidates").select("full_name, role_applied").eq("id", id).maybeSingle(),
    supabase.from("candidate_interviews").select("answers, status").eq("candidate_id", id).maybeSingle(),
    supabase.from("candidate_applications").select("answers").eq("candidate_id", id).maybeSingle(),
    supabase.from("users").select("full_name").eq("id", context.userId).maybeSingle(),
  ]);
  if (!candidate) notFound();
  const fromApp = (app?.answers ?? {}) as Answers;
  const start: Answers = (interview?.answers as Answers | null) ?? {
    interviewDate: new Date().toISOString().slice(0, 10),
    interviewers: (me?.full_name as string | null) ?? "",
    heldHow: "In the office",
  };
  return (
    <DashboardShell
      title={`Interview: ${candidate.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: candidate.full_name as string }}
    >
      <InterviewForm
        candidateId={id}
        initial={start}
        complete={interview?.status === "complete"}
        whyCare={typeof fromApp.whyCarer === "string" ? fromApp.whyCarer : null}
        experience={typeof fromApp.careExperience === "string" ? fromApp.careExperience : null}
      />
    </DashboardShell>
  );
}
