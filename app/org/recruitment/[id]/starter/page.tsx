import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { answerText, isShown, type Answers } from "@/lib/recruitment-application";
import { STARTER_SECTIONS, healthFlags } from "@/lib/recruitment-starter";
import { logAudit } from "@/lib/audit";
import { DashboardShell } from "@/components/dashboard-shell";

/**
 * A candidate's health, equality and DBS answers, as the office reads them.
 * Confidential: each opening is written to the audit log.
 */
export default async function StarterAnswersPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: candidate }, { data: form }] = await Promise.all([
    supabase.from("candidates").select("full_name").eq("id", id).maybeSingle(),
    supabase.from("candidate_starter_forms").select("status, answers, submitted_at").eq("candidate_id", id).maybeSingle(),
  ]);
  if (!candidate || !form) notFound();
  await logAudit({ context, action: "candidate.starter_form_viewed", entity: "candidate", entityId: id });
  const answers = (form.answers ?? {}) as Answers;
  const flags = healthFlags(answers);

  return (
    <DashboardShell
      title={`Health, equality and DBS: ${candidate.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: candidate.full_name as string }}
    >
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          {form.status === "submitted" && form.submitted_at ? `Sent in on ${formatDate(form.submitted_at as string)}.` : "Not sent in yet: this is what they've filled in so far."}{" "}
          Confidential: for the office only. Equality answers play no part in any decision about them.
        </p>
        {flags.length > 0 && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">To talk through with them privately</p>
            <ul className="mt-1 list-disc pl-5">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
        {STARTER_SECTIONS.map((section) => (
          <section key={section.id} aria-labelledby={`s-${section.id}`} className="rounded-2xl border bg-card p-5">
            <h2 id={`s-${section.id}`} className="font-semibold">{section.title}</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              {section.fields.filter((f) => isShown(f, answers)).map((f) => (
                <div key={f.id} className="grid gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="whitespace-pre-line">{answerText(f, answers[f.id])}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </DashboardShell>
  );
}
