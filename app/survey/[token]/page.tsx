import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { surveyKind } from "@/lib/feedback";
import { orgBranding } from "@/lib/branding";
import { BrandMark } from "@/components/brand-mark";
import { SurveyForm } from "./survey-form";

export const metadata: Metadata = { title: "Feedback", robots: { index: false, follow: false } };

/**
 * A feedback survey, answered without an account (ROADMAP §4). The token in
 * the address is the whole key; the survey and its organisation are read as
 * the service role, since anon reads no table. A closed survey says so.
 */
export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: survey } = await admin
    .from("feedback_surveys")
    .select("organisation_id, kind, title, is_open")
    .eq("token", token)
    .maybeSingle();
  const kind = survey ? surveyKind(survey.kind as string) : undefined;
  if (!survey || !kind) notFound();
  const branding = await orgBranding(survey.organisation_id as string);
  const orgName = branding?.name ?? "the service";

  return (
    <main className="mx-auto min-h-svh max-w-2xl space-y-6 px-4 py-10">
      <div className="inline-flex rounded-lg bg-white px-3 py-2 shadow-sm">
        <BrandMark logoUrl={branding?.logoUrl} orgName={branding?.name} width={140} />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{(survey.title as string | null) || `${orgName}: ${kind.label}`}</h1>
        <p className="text-sm text-muted-foreground">
          {orgName} would like to hear from {kind.audience}. It takes about two minutes.
        </p>
      </div>
      {survey.is_open ? (
        <SurveyForm token={token} questions={kind.questions} />
      ) : (
        <p className="rounded-lg bg-muted p-4 text-sm">This survey has closed. Thank you for your interest.</p>
      )}
    </main>
  );
}
