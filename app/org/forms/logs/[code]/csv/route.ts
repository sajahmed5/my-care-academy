import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logCsv } from "@/lib/form-logs";
import { loadLogForDownload, safeName } from "../load";

export const dynamic = "force-dynamic";

/** A log as a spreadsheet, for the range on the page. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const context = await requireConsole();
  const { code } = await params;
  const log = await loadLogForDownload(context, code, new URL(req.url));
  if (!log) return new NextResponse("Not found.", { status: 404 });
  const csv = logCsv(log.entries, log.template.fields, {
    personLabel: log.template.log_person_label ?? "Done by",
    withClient: log.template.audience === "client",
  });
  await logAudit({ context, action: "form_log.csv", entity: "form_template", entityId: log.template.id, detail: { lines: log.entries.length } });
  const filename = safeName(`${log.template.title} - ${new Date().toISOString().slice(0, 10)}`);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
