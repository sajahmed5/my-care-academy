import { NextResponse, type NextRequest } from "next/server";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { orgBranding } from "@/lib/branding";
import { monthRange, previousMonth } from "@/lib/governance";
import { renderGovernancePdf } from "@/lib/governance-pdf";
import { governanceFor } from "../load";

export const dynamic = "force-dynamic";

/** /org/audits/governance/pdf?month=YYYY-MM — the month's governance report. */
export async function GET(req: NextRequest) {
  const context = await requireConsole();
  if (!context.organisationId || !(await hasFeature(context, "quality.audits"))) return new NextResponse("Not found.", { status: 404 });
  const range = monthRange(req.nextUrl.searchParams.get("month") ?? previousMonth(new Date()));
  if (!range) return new NextResponse("Not found.", { status: 404 });
  const [report, branding] = await Promise.all([governanceFor(context, range), orgBranding(context.organisationId)]);
  const pdf = await renderGovernancePdf(report, undefined, branding?.logoUrl ?? null);
  await logAudit({ context, action: "governance.pdf", entity: "organisation", entityId: context.organisationId, detail: { month: range.month } });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Governance report ${range.label}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
