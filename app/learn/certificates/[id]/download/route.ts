import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INVALID = /[\\/:*?"<>|]/g;

/** Remove characters that aren't valid in a filename; keep spaces and hyphens. */
function safeName(s: string): string {
  return s.replace(INVALID, "").replace(/\s+/g, " ").trim();
}

/**
 * Stream a learner's certificate PDF from our own domain (so the download URL
 * is mycareacademy.co.uk, not a raw Supabase link) with a friendly filename
 * "<Course> - <Learner>.pdf". RLS ensures a learner can only fetch their own.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireStaff();
  const { id } = await params;

  const supabase = await createClient();
  const { data: cert } = await supabase
    .from("certificates")
    .select("pdf_path, user_id, courses(title), users(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!cert || cert.user_id !== context.userId || !cert.pdf_path) {
    return new Response("Certificate not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("certificates")
    .download(cert.pdf_path);
  if (error || !data) {
    return new Response("Certificate not available.", { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const course = (cert.courses as { title?: string } | null)?.title ?? "Certificate";
  const learner =
    (cert.users as { full_name?: string } | null)?.full_name ??
    context.email ??
    "Learner";
  const name = safeName(`${course} - ${learner}`) || "certificate";
  const ascii = name.replace(/[^\x20-\x7e]/g, "").trim() || "certificate";

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(
        `${name}.pdf`,
      )}`,
      "Cache-Control": "private, no-store",
    },
  });
}
