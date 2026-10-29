import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import {
  answerText,
  applicationSections,
  employmentGaps,
  isShown,
  type Answers,
  type Entry,
} from "@/lib/recruitment-application";
import { createAdminClient } from "@/lib/supabase/admin";
import { companyQuestions } from "@/lib/company-questions";
import { APPLICATION_CUSTOM_TITLE, customSection } from "@/lib/custom-questions";
import { DashboardShell } from "@/components/dashboard-shell";

/**
 * A candidate's application as the office reads it: every section, the
 * breaks in their work history worked out for you, and their signature.
 */
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: candidate }, { data: app }] = await Promise.all([
    supabase.from("candidates").select("full_name").eq("id", id).maybeSingle(),
    supabase.from("candidate_applications").select("status, answers, signature, submitted_at").eq("candidate_id", id).maybeSingle(),
  ]);
  if (!candidate || !app) notFound();
  const answers = (app.answers ?? {}) as Answers;
  // The company's questions, retired ones too, so an earlier answer still shows.
  const { custom } = await companyQuestions(createAdminClient(), context.organisationId!);
  const sections = applicationSections(customSection(custom.application, { title: APPLICATION_CUSTOM_TITLE, forRecord: true }));
  const gaps = employmentGaps(answers, new Date().toISOString().slice(0, 10));
  const signature = app.signature as { dataUrl?: string; signedName?: string; signedAt?: string } | null;

  return (
    <DashboardShell
      title={`Application: ${candidate.full_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: candidate.full_name as string }}
    >
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          {app.status === "submitted" && app.submitted_at
            ? `Sent in on ${formatDate(app.submitted_at as string)}.`
            : "Not sent in yet: this is what they've filled in so far."}
        </p>
        {sections.map((section) => (
          <section key={section.id} aria-labelledby={`s-${section.id}`} className="rounded-2xl border bg-card p-5">
            <h2 id={`s-${section.id}`} className="font-semibold">{section.title}</h2>
            {section.id === "employment" && gaps.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Breaks in their work history: {gaps.map((g) => g.label).join("; ")}.
              </p>
            )}
            <dl className="mt-3 space-y-2.5 text-sm">
              {section.fields.filter((f) => f.type !== "info" && isShown(f, answers)).map((f) =>
                f.type === "repeat" ? (
                  <div key={f.id}>
                    <dt className="font-medium">{f.label}</dt>
                    <dd className="mt-1 space-y-2">
                      {((answers[f.id] as Entry[] | undefined) ?? []).length === 0 && <span className="text-muted-foreground">None given</span>}
                      {((answers[f.id] as Entry[] | undefined) ?? []).map((entry, i) => (
                        <div key={i} className="rounded-lg bg-muted/50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.itemLabel} {i + 1}</p>
                          <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                            {(f.fields ?? []).filter((sub) => isShown(sub, entry)).map((sub) => (
                              <div key={sub.id}>
                                <dt className="text-xs text-muted-foreground">{sub.label}</dt>
                                <dd className="whitespace-pre-line">{answerText(sub, entry[sub.id])}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </dd>
                  </div>
                ) : (
                  <div key={f.id} className="grid gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="whitespace-pre-line">{answerText(f, answers[f.id])}</dd>
                  </div>
                ),
              )}
            </dl>
          </section>
        ))}
        {signature?.dataUrl && (
          <section aria-label="Signature" className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Signed</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signature.dataUrl} alt={`Signature of ${signature.signedName ?? "the candidate"}`} className="mt-2 h-16 rounded border bg-white" />
            <p className="mt-1 text-sm">
              {signature.signedName}
              {signature.signedAt && `, ${formatDate(signature.signedAt)}`}
            </p>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
