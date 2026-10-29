import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { AuthShell } from "@/components/auth-shell";
import { StartApplication } from "./start-application";

export const metadata: Metadata = { title: "Apply", robots: { index: false } };

/**
 * A company's apply link, for its job adverts (RECRUITMENT.md). A name and an
 * email start an application; the full form follows on the next page.
 */
export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("recruitment_settings")
    .select("organisation_id, organisations(name)")
    .eq("apply_token", token)
    .maybeSingle();
  if (!data || !(await hasFeatureForOrg(admin, data.organisation_id as string, "recruitment.tracker"))) notFound();
  const company = (data.organisations as unknown as { name: string } | null)?.name ?? "us";
  return (
    <AuthShell
      title={`Apply to ${company}`}
      description="Start with your name and email. The application form follows, and your answers save as you go."
    >
      <StartApplication applyToken={token} />
    </AuthShell>
  );
}
