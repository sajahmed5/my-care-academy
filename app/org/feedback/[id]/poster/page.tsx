import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { surveyKind } from "@/lib/feedback";
import { siteOrigin } from "@/lib/site-url";
import { orgBranding } from "@/lib/branding";
import { BrandMark } from "@/components/brand-mark";
import { PrintButton } from "../print-button";

/**
 * A round's open link as a printed QR code (FORMS.md, "Sent"): an A4 sheet
 * for the office wall, a care home's reception, or a letter to families.
 */
export default async function SurveyPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.feedback");
  const { id } = await params;
  const supabase = await createClient();
  const { data: survey } = await supabase.from("feedback_surveys").select("id, kind, title, token").eq("id", id).maybeSingle();
  const kind = survey ? surveyKind(survey.kind as string) : undefined;
  if (!survey || !kind) notFound();
  const [origin, branding] = await Promise.all([siteOrigin(), orgBranding(context.organisationId!)]);
  const url = `${origin}/survey/${survey.token}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: "M" });
  const orgName = branding?.name ?? "Us";

  return (
    <main className="mx-auto max-w-2xl space-y-8 bg-white px-6 py-10 text-center text-gray-900">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/org/feedback/${id}`} className="text-sm text-gray-600 hover:underline">← Back to the round</Link>
        <PrintButton label="Print the poster" />
      </div>
      <div className="flex justify-center">
        <BrandMark logoUrl={branding?.logoUrl} orgName={branding?.name} width={180} />
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-bold">{kind.key === "client" ? "How are we doing?" : "Tell us what it's like to work here"}</h1>
        <p className="text-lg text-gray-700">
          {orgName} would like to hear from {kind.audience}. Scan the code with your phone&apos;s camera — it takes about two minutes, and your answers are anonymous.
        </p>
      </div>
      {/* A data URL made on the server; next/image adds nothing here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR code for the survey" className="mx-auto h-72 w-72" />
      <p className="break-all text-sm text-gray-500">Or type: {url}</p>
      {(survey.title as string | null) && <p className="text-sm text-gray-500">{survey.title as string}</p>}
    </main>
  );
}
