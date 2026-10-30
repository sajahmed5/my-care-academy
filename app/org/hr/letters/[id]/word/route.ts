import { NextResponse, type NextRequest } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hrLetterDoc, hrPerson } from "@/lib/hr/server";
import { canSeeLetter } from "@/lib/hr/letter-access";
import { ukDate } from "@/lib/hr-pdf";
import { letterFileName } from "@/lib/hr/letterhead";
import { DOCX_TYPE, renderLetterDocx } from "@/lib/hr/letter-word";

export const dynamic = "force-dynamic";

/**
 * An HR letter as a Word document, on the company's letterhead (issue #89):
 * as it was sent, dated the day it went, or a draft dated today. Same 404
 * for missing and not yours, as the PDF.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  if (!context.organisationId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data: letter } = await admin.from("hr_letters").select("*").eq("id", id).maybeSingle();
  const person = letter && letter.organisation_id === context.organisationId ? await hrPerson(admin, context.organisationId, letter.user_id as string) : null;
  if (!letter || !person || !(await canSeeLetter(admin, context, letter))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const sentBy = (letter.sent_by as string | null) ?? context.userId;
  const date = ukDate((letter.sent_at as string | null) ?? new Date().toISOString());
  const { doc, logoUrl } = await hrLetterDoc(admin, context.organisationId, sentBy, letter, person, date);
  const file = await renderLetterDocx(doc, logoUrl);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${letterFileName(String(letter.subject || "Letter"))}.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
