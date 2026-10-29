import { NextResponse, type NextRequest } from "next/server";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { renderInterimPdf } from "@/lib/complaints/pdf";
import { completedItems, outstandingItems } from "@/lib/complaints/interim";
import { loadPdfContext, safeName } from "@/lib/complaints/papers";
import { RESPOND_WITHIN_DAYS } from "@/lib/complaints/stages";

export const dynamic = "force-dynamic";

/** The interim update: for when the council chases part-way through. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  if (!context.organisationId || !(await hasFeature(context, "complaints.register"))) return new NextResponse("Not found.", { status: 404 });
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await loadPdfContext(supabase, id, context.organisationId);
  if (!ctx) return new NextResponse("Not found.", { status: 404 });

  const { data: me } = await supabase.from("users").select("full_name").eq("id", context.userId).maybeSingle();
  const pdf = await renderInterimPdf(ctx, {
    done: completedItems(ctx.complaint, ctx.stages),
    outstanding: outstandingItems(ctx.complaint, ctx.stages),
    findings: ctx.complaint.interimFindings?.trim() || null,
    preparedBy: (me?.full_name as string | null) ?? null,
    targetDays: RESPOND_WITHIN_DAYS,
  });
  await logAudit({ context, action: "complaint.interim_pdf", entity: "complaint", entityId: id });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName(`${ctx.complaint.reference} - interim update`)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
