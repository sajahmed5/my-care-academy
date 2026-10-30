import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { renderLogPdf } from "@/lib/log-pdf";
import { loadLogForDownload, safeName } from "../load";

export const dynamic = "force-dynamic";

/** A log as a PDF table, for the range on the page — for a folder or an inspector. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const context = await requireConsole();
  const { code } = await params;
  const log = await loadLogForDownload(context, code, new URL(req.url));
  if (!log) return new NextResponse("Not found.", { status: 404 });
  const pdf = await renderLogPdf({
    organisationName: log.organisationName,
    title: log.template.title,
    description: log.template.description,
    fields: log.template.fields,
    personLabel: log.template.log_person_label ?? "Done by",
    withClient: log.template.audience === "client",
    entries: log.entries,
    from: log.from,
    to: log.to,
  });
  await logAudit({ context, action: "form_log.pdf", entity: "form_template", entityId: log.template.id, detail: { lines: log.entries.length } });
  const filename = safeName(`${log.template.title} - ${new Date().toISOString().slice(0, 10)}`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
