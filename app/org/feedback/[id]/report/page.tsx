import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { averages, headlineQuestion, questionsForRound, responseRate, surveyKind, type SurveyResponseRow } from "@/lib/feedback";
import { orgBranding } from "@/lib/branding";
import { BrandMark } from "@/components/brand-mark";
import { formatDate } from "@/lib/dates";
import { PrintButton } from "../print-button";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "long", year: "numeric" });

/**
 * "You said, we did" (FORMS.md): a one-page report of a round — how many
 * answered, how people rated the service, what they said and what was done
 * about it — to print for a reception wall or a newsletter, or hand to an
 * inspector. Nothing on it names anyone.
 */
export default async function YouSaidWeDidPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.feedback");
  const { id } = await params;
  const supabase = await createClient();
  const { data: survey } = await supabase
    .from("feedback_surveys")
    .select("id, kind, title, questions, sent_to_count, created_at, closes_on")
    .eq("id", id)
    .maybeSingle();
  const kind = survey ? surveyKind(survey.kind as string) : undefined;
  if (!survey || !kind) notFound();
  const questions = questionsForRound(survey);
  const [rows, { count: invited }, { data: actions }, branding] = await Promise.all([
    fetchAll((f, t) => supabase.from("feedback_responses").select("id, submitted_at, answers").eq("survey_id", id).order("id").range(f, t)),
    supabase.from("feedback_invitations").select("id", { count: "exact", head: true }).eq("survey_id", id),
    supabase.from("feedback_actions").select("id, you_said, we_did").eq("survey_id", id).order("created_at").limit(50),
    orgBranding(context.organisationId!),
  ]);
  const responses = rows as unknown as SurveyResponseRow[];
  const avgs = averages({ questions }, responses).filter((a) => a.average !== null);
  const headline = headlineQuestion(questions);
  const top = avgs.find((a) => a.id === headline?.id);
  const rate = responseRate({ invited: invited ?? 0, sentTo: (survey.sent_to_count as number | null) ?? null, responses: responses.length });
  const title = (survey.title as string | null) || kind.label;

  return (
    <main className="mx-auto max-w-3xl space-y-6 bg-white px-8 py-10 text-gray-900 print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/org/feedback/${id}`} className="text-sm text-gray-600 hover:underline">← Back to the round</Link>
        <PrintButton label="Print the report" />
      </div>
      <header className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-700">You said, we did</p>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-gray-600">
            {kind.key === "client" ? "What the people we care for and their families told us" : "What our staff told us"} ·{" "}
            {fmt(survey.created_at as string)}
            {survey.closes_on ? ` to ${fmt(survey.closes_on as string)}` : ""}
          </p>
        </div>
        <BrandMark logoUrl={branding?.logoUrl} orgName={branding?.name} width={130} />
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-2xl font-bold">{responses.length}</p>
          <p className="text-xs text-gray-600">people answered{rate ? `, ${rate.percent}% of those asked` : ""}</p>
        </div>
        {top && (
          <div className="rounded-lg border p-3 sm:col-span-2">
            <p className="text-2xl font-bold">{top.average} / 5</p>
            <p className="text-xs text-gray-600">{top.text}</p>
          </div>
        )}
      </section>

      {avgs.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold">How you rated us</h2>
          {avgs.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{a.text}</span>
              <span className="font-medium">{a.average} / 5</span>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">What you told us, and what we did</h2>
        {(actions ?? []).length === 0 ? (
          <p className="text-sm text-gray-500 print:hidden">Nothing added yet — add &ldquo;you said, we did&rdquo; lines on the round&apos;s page.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="w-1/2 py-1 pr-4 font-semibold">You said</th>
                <th className="py-1 font-semibold">We did</th>
              </tr>
            </thead>
            <tbody>
              {(actions ?? []).map((a) => (
                <tr key={a.id as string} className="border-b align-top">
                  <td className="whitespace-pre-wrap py-2 pr-4">{a.you_said as string}</td>
                  <td className="whitespace-pre-wrap py-2">{(a.we_did as string | null) || "We are working on this."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-gray-500">Thank you to everyone who took part. {branding?.name ?? ""}</p>
    </main>
  );
}
