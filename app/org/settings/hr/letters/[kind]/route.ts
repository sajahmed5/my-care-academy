import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgBranding } from "@/lib/branding";
import { renderLetterPdf } from "@/lib/hr-pdf";
import { letterSigner, loadHrSettingsRow } from "@/lib/hr/server";
import { sanitiseOverrides, templateInForce } from "@/lib/hr/letters";
import { letterFileName, sanitiseLetterhead, templateDoc } from "@/lib/hr/letterhead";
import { DOCX_TYPE, renderLetterDocx } from "@/lib/hr/letter-word";

export const dynamic = "force-dynamic";

/**
 * One HR letter template, in the company's wording, on its letterhead, as a
 * PDF or a Word document to fill in (issue #89). ?format=docx for Word.
 * Managers only, as the Letters page is.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const context = await requireRole("org_admin");
  await requireFeature(context, "recruitment.tracker");
  const { kind } = await params;
  const admin = createAdminClient();
  const orgId = context.organisationId!;
  const [settings, { data: org }, brand, signer] = await Promise.all([
    loadHrSettingsRow(admin, orgId),
    admin.from("organisations").select("name").eq("id", orgId).maybeSingle(),
    orgBranding(orgId),
    letterSigner(admin, orgId, context.userId),
  ]);
  const template = templateInForce(kind, sanitiseOverrides(settings?.letter_templates));
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });
  const doc = templateDoc(template, null, {
    company: (org?.name as string | undefined) ?? "",
    letterhead: sanitiseLetterhead(settings?.letterhead),
    signer,
  });
  const word = req.nextUrl.searchParams.get("format") === "docx";
  const file = word ? await renderLetterDocx(doc, brand?.logoUrl) : await renderLetterPdf(doc, brand?.logoUrl);
  const name = letterFileName(template.label);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": word ? DOCX_TYPE : "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.${word ? "docx" : "pdf"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
