import { NextResponse, type NextRequest } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { loadComplaint, loadStaffOptions, loadStages } from "@/lib/complaints/data";
import { stagesFor } from "@/lib/complaints/stages";
import { renderResponsePdf, renderStagePdf } from "@/lib/complaints/pdf";

export const dynamic = "force-dynamic";

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();

/**
 *   /org/complaints/<id>/pdf             the response
 *   /org/complaints/<id>/pdf?stage=<id>  one stage's form
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  const { id } = await params;
  if (!context.organisationId) return new NextResponse("Not found.", { status: 404 });
  const stageId = req.nextUrl.searchParams.get("stage");

  const supabase = await createClient();
  const [complaint, allStages, staff, { data: org }] = await Promise.all([
    loadComplaint(supabase, id),
    loadStages(supabase),
    loadStaffOptions(supabase),
    supabase.from("organisations").select("name").eq("id", context.organisationId).maybeSingle(),
  ]);
  if (!complaint) return new NextResponse("Not found.", { status: 404 });

  const names = new Map(staff.map((s) => [s.value, s.label]));
  const ctx = {
    complaint,
    stages: stagesFor(allStages, complaint.kind),
    organisationName: (org?.name as string) ?? "This organisation",
    nameOf: (uid: string) => names.get(uid) ?? uid,
  };

  const stage = stageId ? allStages.find((s) => s.id === stageId) : null;
  if (stageId && !stage) return new NextResponse("Not found.", { status: 404 });

  const pdf = stage ? await renderStagePdf(ctx, stage) : await renderResponsePdf(ctx);
  await logAudit({
    context,
    action: "complaint.pdf",
    entity: "complaint",
    entityId: id,
    detail: { stage: stage?.name ?? null },
  });

  const filename = safeName(`${complaint.reference} - ${stage ? stage.name : "response"}`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
