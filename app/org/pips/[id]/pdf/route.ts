import { orgBranding } from "@/lib/branding";
import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { loadPip } from "@/lib/pips/data";
import { renderPipPdf } from "@/lib/pips/pdf";

export const dynamic = "force-dynamic";

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  const { id } = await params;
  if (!context.organisationId) return new NextResponse("Not found.", { status: 404 });
  const supabase = await createClient();
  const [pip, { data: org }] = await Promise.all([
    loadPip(supabase, id),
    supabase.from("organisations").select("name").eq("id", context.organisationId).maybeSingle(),
  ]);
  if (!pip) return new NextResponse("Not found.", { status: 404 });

  const logo = (await orgBranding(context.organisationId))?.logoUrl ?? null;
  const pdf = await renderPipPdf(pip, (org?.name as string) ?? "This organisation", logo);
  // A plan is personal data about a named member of staff.
  await logAudit({ context, action: "pip.pdf", entity: "pip", entityId: id });

  const filename = safeName(`Performance plan - ${pip.carerName} - ${new Date().toISOString().slice(0, 10)}`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
