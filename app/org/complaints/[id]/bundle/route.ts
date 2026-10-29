import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { renderInterimPdf, renderResponsePdf, renderStagePdf } from "@/lib/complaints/pdf";
import { completedItems, outstandingItems } from "@/lib/complaints/interim";
import { loadPdfContext, safeName } from "@/lib/complaints/papers";
import { formForStage } from "@/lib/complaints/forms";
import { LETTER_KINDS } from "@/lib/complaints/compute";
import { sentOutcomeLetter } from "@/lib/complaints/findings";
import { RESPOND_WITHIN_DAYS, kindLabel } from "@/lib/complaints/stages";

export const dynamic = "force-dynamic";

const ukDate = (d = new Date()) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const ext = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[0] ?? "";

/**
 * Everything on a record in one ZIP, for a council or the Ombudsman. Brought
 * across from MyRoster (src/lib/complaintBundle.ts) on 29 Oct 2026.
 *
 *   1.  the lead document: the response once the outcome letter has gone or
 *       the record is closed; until then an interim update saying the
 *       enquiry is still running and what is still to come
 *   2…  each finished stage as its own PDF, in the order the work happened
 *   Documents/  every file on the record, numbered as the response lists them
 *   Contents.txt  what is in here, and — the important half — what is not
 *
 * A file that cannot be fetched does NOT fail the export: it is listed as
 * missing. A bundle that silently dropped one would read as evidence we do
 * not have.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  if (!context.organisationId || !(await hasFeature(context, "complaints.register"))) return new NextResponse("Not found.", { status: 404 });
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await loadPdfContext(supabase, id, context.organisationId);
  if (!ctx) return new NextResponse("Not found.", { status: 404 });
  const { complaint, stages } = ctx;
  const ref = complaint.reference;
  const noun = kindLabel(complaint.kind);

  const zip = new JSZip();
  const contents: string[] = [];
  const missing: string[] = [];
  const { data: me } = await supabase.from("users").select("full_name").eq("id", context.userId).maybeSingle();

  // 1. The lead document.
  const finished = complaint.status !== "open" || !!sentOutcomeLetter(complaint, stages);
  const outstanding = outstandingItems(complaint, stages);
  const lead = finished
    ? await renderResponsePdf(ctx)
    : await renderInterimPdf(ctx, {
        done: completedItems(complaint, stages),
        outstanding,
        findings: complaint.interimFindings?.trim() || null,
        preparedBy: (me?.full_name as string | null) ?? null,
        targetDays: RESPOND_WITHIN_DAYS,
      });
  const leadName = `01. ${finished ? "Response" : "Interim update"} - ${safeName(ref)}.pdf`;
  zip.file(leadName, lead);
  contents.push(
    `${leadName}\n    ${finished ? "Our response, with the stage records as appendices." : "Where our enquiry has got to. Read this first: the enquiry is still running."}`,
  );

  // 2. Each finished stage, in the order the work happened. Half-typed
  //    minutes are not minutes, so only what is done goes in.
  let n = 2;
  for (const st of stages) {
    const entry = complaint.stageEntries.find((e) => e.stageId === st.id);
    if (entry?.status !== "done" || (!formForStage(st) && !LETTER_KINDS.has(st.kind))) continue;
    const name = `${String(n++).padStart(2, "0")}. ${safeName(st.name)}.pdf`;
    zip.file(name, await renderStagePdf(ctx, st));
    contents.push(`${name}\n    The record of this stage${formForStage(st) ? ", with the actions agreed" : ""}.`);
  }

  // 3. The files on the record, numbered as the response lists them.
  //    Fetched together, listed in order: a contents page running 4, 3, 5
  //    looks like nobody checked it.
  if (complaint.documents.length) {
    const { data: paths } = await supabase
      .from("complaint_documents")
      .select("id, file_path")
      .eq("complaint_id", id);
    const pathOf = new Map((paths ?? []).map((p) => [p.id as string, p.file_path as string]));
    const admin = createAdminClient();
    const folder = zip.folder("Documents");
    const rows = await Promise.all(
      complaint.documents.map(async (d, i) => {
        const label = `Document ${String(i + 1).padStart(2, "0")}`;
        const path = pathOf.get(d.id);
        if (!path) return { label, d, ok: false };
        const { data: file } = await admin.storage.from("complaint-documents").download(path);
        if (!file) return { label, d, ok: false };
        folder?.file(`${label} - ${safeName(d.fileName.replace(/\.[a-z0-9]{1,5}$/i, ""))}${ext(d.fileName)}`, await file.arrayBuffer());
        return { label, d, ok: true };
      }),
    );
    for (const r of rows) {
      const where = stages.find((s) => s.id === r.d.stageId)?.name ?? "the record";
      if (r.ok) contents.push(`Documents/${r.label}: ${r.d.fileName} (${where})`);
      else missing.push(`${r.label}: ${r.d.fileName} (${where}) — could not be fetched`);
    }
  }

  const lines = [
    `${noun} — ${finished ? "response bundle" : "interim update"}`,
    `${ref}${complaint.aboutName ? ` — ${complaint.aboutName}` : ""}`,
    `Prepared ${ukDate()}${me?.full_name ? ` by ${me.full_name as string}` : ""}`,
    `${ctx.organisationName} — confidential`,
    "",
    ...(finished
      ? []
      : [
          "This enquiry is NOT finished. What follows is what we hold today.",
          ...(complaint.completeBy ? [`Our full written response is due by ${ukDate(new Date(`${complaint.completeBy}T12:00:00Z`))}.`] : []),
          ...(outstanding.length ? ["", "Still to come", ...outstanding.map((o) => `  ${o.label}`)] : []),
          "",
        ]),
    "Contents",
    ...contents.map((c) => `  ${c}`),
    ...(missing.length
      ? ["", "Not included", ...missing.map((m) => `  ${m}`), "", "These are on the record but are not in this bundle. Send them separately, or download the bundle again."]
      : []),
  ];
  zip.file("Contents.txt", lines.join("\n"));

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await logAudit({ context, action: "complaint.bundle", entity: "complaint", entityId: id, detail: { finished, missing: missing.length } });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName(`${noun} ${finished ? "bundle" : "interim update"} - ${ref}`)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
