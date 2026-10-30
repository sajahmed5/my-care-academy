import { NextResponse, type NextRequest } from "next/server";
import { getUserContext, isConsoleRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { HR_BUCKET, hrPerson } from "@/lib/hr/server";
import { canSeeLetter } from "@/lib/hr/letter-access";

export const dynamic = "force-dynamic";

/** A sent HR letter's PDF, for the console. Same 404 for missing and not yours. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getUserContext();
  if (!context || !isConsoleRole(context.role) || !context.organisationId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data: letter } = await admin.from("hr_letters").select("*").eq("id", id).maybeSingle();
  if (
    !letter?.pdf_path ||
    letter.organisation_id !== context.organisationId ||
    !(await hrPerson(admin, context.organisationId, letter.user_id as string)) ||
    !(await canSeeLetter(admin, context, letter))
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const { data } = await admin.storage.from(HR_BUCKET).download(letter.pdf_path as string);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = String(letter.subject || "Letter").replace(/[^\w .-]+/g, "").slice(0, 80) || "Letter";
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
