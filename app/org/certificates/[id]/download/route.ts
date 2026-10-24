import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const INVALID = /[\\/:*?"<>|]/g;

/** Remove characters that aren't valid in a filename; keep spaces and hyphens. */
function safeName(s: string): string {
  return s.replace(INVALID, "").replace(/\s+/g, " ").trim();
}

/**
 * An org admin downloading one of their own staff's certificates (issue #23).
 *
 * The learner route can't serve this: requireRole is an exact match, so an
 * org_admin is redirected away from it, and it only ever returns the caller's
 * own certificate. Same filename convention as that route — "<Course> -
 * <Learner>.pdf", served from our domain rather than a raw Supabase link.
 *
 * Reads run as the service role, so the organisation check below is the only
 * thing keeping one org's certificates away from another's.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await requireConsole();
  const { id } = await params;
  if (!context.organisationId) {
    return new Response("Certificate not found.", { status: 404 });
  }

  const admin = createAdminClient();
  const { data: cert } = await admin
    .from("certificates")
    .select("pdf_path, organisation_id, courses(title), users(full_name, email)")
    .eq("id", id)
    .maybeSingle();

  if (
    !cert ||
    cert.organisation_id !== context.organisationId ||
    !cert.pdf_path
  ) {
    return new Response("Certificate not found.", { status: 404 });
  }

  const { data, error } = await admin.storage
    .from("certificates")
    .download(cert.pdf_path);
  if (error || !data) {
    return new Response("Certificate not available.", { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const course = (cert.courses as { title?: string } | null)?.title ?? "Certificate";
  const u = cert.users as { full_name?: string; email?: string } | null;
  const learner = u?.full_name || u?.email || "Learner";
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
