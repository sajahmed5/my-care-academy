import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { answerText, isShown, type Answers } from "@/lib/recruitment-application";
import { kindForType, referenceFlags, referenceSections } from "@/lib/recruitment-references";
import { createAdminClient } from "@/lib/supabase/admin";
import { companyQuestions } from "@/lib/company-questions";
import { REFERENCE_CUSTOM_TITLE, customSection } from "@/lib/custom-questions";
import { DashboardShell } from "@/components/dashboard-shell";

/** A reference as the referee sent it, with anything worth a second look first. */
export default async function ReferencePage({ params }: { params: Promise<{ id: string; refId: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id, refId } = await params;
  const supabase = await createClient();
  const [{ data: candidate }, { data: ref }] = await Promise.all([
    supabase.from("candidates").select("full_name").eq("id", id).maybeSingle(),
    supabase
      .from("candidate_references")
      .select("candidate_id, position, referee_type, referee_name, email, phone, received_at, answers")
      .eq("id", refId)
      .maybeSingle(),
  ]);
  if (!candidate || !ref || ref.candidate_id !== id || !ref.answers) notFound();
  const kind = kindForType(ref.referee_type as string);
  const answers = ref.answers as Answers;
  const flags = referenceFlags(kind, answers);
  const { custom } = await companyQuestions(createAdminClient(), context.organisationId!);
  const sections = referenceSections(kind, customSection(custom.reference, { title: REFERENCE_CUSTOM_TITLE, forRecord: true }));
  return (
    <DashboardShell
      title={`Reference ${ref.position}: ${ref.referee_name as string}`}
      context={context}
      back={{ href: `/org/recruitment/${id}`, label: candidate.full_name as string }}
    >
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          {ref.referee_type as string} for {candidate.full_name as string}
          {ref.received_at && `, received ${formatDate(ref.received_at as string)}`}. {[ref.email, ref.phone].filter(Boolean).join(" · ")}
        </p>
        {flags.length > 0 && (
          <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Look at these first</p>
            <ul className="mt-1 list-disc pl-5">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`r-${s.id}`} className="rounded-2xl border bg-card p-5">
            <h2 id={`r-${s.id}`} className="font-semibold">{s.title}</h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              {s.fields.filter((f) => isShown(f, answers)).map((f) => (
                <div key={f.id} className="grid gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="whitespace-pre-line">{answerText(f, answers[f.id])}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-sm text-muted-foreground">Confirm or send back the reference on the candidate&apos;s page, at Reference {ref.position as number}.</p>
      </div>
    </DashboardShell>
  );
}
