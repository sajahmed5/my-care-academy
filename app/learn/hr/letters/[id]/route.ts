import { NextResponse, type NextRequest } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HR_BUCKET } from "@/lib/hr/server";

export const dynamic = "force-dynamic";

/**
 * A letter sent to me, as its PDF. The row is read under RLS (my own, and
 * sent), so a draft or someone else's letter is a 404; only then is the file
 * read as the service role.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getUserContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: letter } = await supabase.from("hr_letters").select("subject, pdf_path, user_id").eq("id", id).maybeSingle();
  if (!letter?.pdf_path || letter.user_id !== context.userId) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data } = await createAdminClient().storage.from(HR_BUCKET).download(letter.pdf_path as string);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const name = String(letter.subject || "Letter").replace(/[^\w .-]+/g, "").slice(0, 80) || "Letter";
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
