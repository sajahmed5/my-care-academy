import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPORT_COLUMNS, fileResponse, reportFile, type StoredReport } from "@/lib/bespoke/render";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Our copy of a company's report as a file, to check it before they see it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("platform_admin");
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  const admin = createAdminClient();
  const { data } = await admin.from("bespoke_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return new NextResponse("Not found.", { status: 404 });
  return fileResponse(await reportFile(admin, data as StoredReport, format));
}
