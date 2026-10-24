import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Open a document held against a stage. The row is read through the user's
 * own client — so RLS decides whether they may see it — and only then is a
 * short-lived signed URL minted with the service role.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  await requireRole("org_admin");
  const { id, docId } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("complaint_documents")
    .select("file_path")
    .eq("id", docId)
    .eq("complaint_id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Not found.", { status: 404 });

  const { data, error } = await createAdminClient()
    .storage.from("complaint-documents")
    .createSignedUrl(doc.file_path as string, 60);
  if (error || !data) return new NextResponse("Could not open the file.", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
