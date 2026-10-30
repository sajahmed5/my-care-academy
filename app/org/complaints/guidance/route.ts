import { orgBranding } from "@/lib/branding";
import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { complaintGuidance } from "@/lib/complaints/guidance";
import { renderGuidancePdf } from "@/lib/complaints/pdf";
import { safeName } from "@/lib/complaints/papers";

export const dynamic = "force-dynamic";

/**
 * "How we handle complaints and concerns", as a PDF in the company's name, to
 * hand to a client, a council or CQC. The councils are the ones its clients
 * are funded by.
 */
export async function GET() {
  const context = await requireConsole();
  if (!context.organisationId || !(await hasFeature(context, "complaints.register"))) return new NextResponse("Not found.", { status: 404 });
  const supabase = await createClient();
  const [{ data: org }, councils] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", context.organisationId).maybeSingle(),
    hasFeature(context, "clients.list").then(async (on) => {
      if (!on) return [];
      const { data } = await supabase
        .from("clients")
        .select("funder_name")
        .eq("organisation_id", context.organisationId!)
        .eq("funder_type", "council")
        .eq("status", "active")
        .not("funder_name", "is", null)
        .limit(1000);
      return [...new Set((data ?? []).map((r) => (r.funder_name as string).trim()).filter(Boolean))].sort();
    }),
  ]);
  const name = (org?.name as string) ?? "Our organisation";
  const logo = (await orgBranding(context.organisationId))?.logoUrl ?? null;
  const pdf = await renderGuidancePdf(complaintGuidance(name, councils), name, logo);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName(`${name} - how we handle complaints`)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
