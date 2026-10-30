import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { responseRows } from "@/lib/form-library";
import { loadRecord } from "@/lib/form-records";
import { renderFormPdf } from "@/lib/form-pdf";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();

/** Any completed form — client, carer or company — as a PDF. RLS decides who may read it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  const { id } = await params;
  if (!context.organisationId || !(await hasFeature(context, "forms.builder"))) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const supabase = await createClient();
  const [record, { data: org }] = await Promise.all([
    loadRecord(supabase, id),
    supabase.from("organisations").select("name").eq("id", context.organisationId).maybeSingle(),
  ]);
  if (!record) return new NextResponse("Not found.", { status: 404 });

  const subject =
    record.subject === "client"
      ? `About ${record.client_name ?? "a client no longer on the list"}`
      : record.subject === "carer"
        ? `Completed by ${record.user_name}`
        : null;
  const pdf = await renderFormPdf({
    organisationName: (org?.name as string) ?? "This organisation",
    title: record.template_title,
    subject,
    filledBy: record.user_name,
    submittedAt: record.submitted_at,
    version: record.template_version,
    rows: responseRows(record.fields, record.answers),
    signedName: record.signed_name,
    signatures: record.signatures,
    meta: record.review_due
      ? [{ label: "Review by", value: formatDate(`${record.review_due}T12:00:00Z`, { day: "numeric", month: "long", year: "numeric" }) }]
      : [],
  });
  // A form about a client or a member of staff is personal data.
  await logAudit({ context, action: "form.pdf", entity: "form_response", entityId: id });

  const who = record.client_name ?? (record.subject === "carer" ? record.user_name : null);
  const filename = safeName([record.template_title, who, record.submitted_at.slice(0, 10)].filter(Boolean).join(" - "));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
