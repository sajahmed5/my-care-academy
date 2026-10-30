import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { orgBranding } from "@/lib/branding";
import { BrandStyle } from "@/components/brand-style";
import { BrandMark } from "@/components/brand-mark";
import { ConcernForm } from "./concern-form";

export const metadata: Metadata = { title: "Raise a concern", robots: { index: false, follow: false } };

/**
 * Raise a concern with a care company, without an account
 * (COMPLAINTS-SAFEGUARDING.md). The token in the address is the whole key;
 * the link and its organisation are read as the service role, since anon
 * reads no table. A closed link says so.
 */
export default async function RaiseConcernPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: link } = await admin
    .from("concern_links")
    .select("organisation_id, is_open")
    .eq("token", token)
    .maybeSingle();
  if (!link) notFound();
  const orgId = link.organisation_id as string;
  const [branding, entitled] = await Promise.all([orgBranding(orgId), hasFeatureForOrg(admin, orgId, "complaints.register")]);
  const orgName = branding?.name ?? "the care company";
  const open = link.is_open && entitled;

  return (
    <main className="mx-auto min-h-svh max-w-2xl space-y-6 px-4 py-10">
      <div className="inline-flex rounded-lg bg-white px-3 py-2 shadow-sm">
        <BrandStyle colour={branding?.colour} />
        <BrandMark logoUrl={branding?.logoUrl} orgName={branding?.name} width={140} />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Raise a concern with {orgName}</h1>
        <p className="text-sm text-muted-foreground">
          Tell us about anything that worries you about the care you or your relative receives. A manager will read it and get back to you.
        </p>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          If someone is in danger right now, call 999. If you think someone is being abused or neglected, you can also tell your local council&apos;s adult social care team directly.
        </p>
      </div>
      {open ? (
        <ConcernForm token={token} orgName={orgName} />
      ) : (
        <p className="rounded-lg bg-muted p-4 text-sm">This link is no longer taking concerns. Please phone the office.</p>
      )}
    </main>
  );
}
