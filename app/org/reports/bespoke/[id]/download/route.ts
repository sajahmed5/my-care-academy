import { NextResponse, type NextRequest } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { reportForConsole } from "@/lib/bespoke/access";
import { fileResponse, reportFile } from "@/lib/bespoke/render";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A bespoke report as a PDF or Excel file, run now: ?format=pdf or ?format=xlsx. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  const report = await reportForConsole(context, id);
  if (!report) return new NextResponse("Not found.", { status: 404 });
  const file = await reportFile(createAdminClient(), report, format);
  await logAudit({ context, action: "bespoke_report.downloaded", entity: "bespoke_report", entityId: id, detail: { format } });
  return fileResponse(file);
}
