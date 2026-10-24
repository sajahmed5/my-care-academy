import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";

const INVALID = /[\\/:*?"<>|]/g;
const safeName = (s: string) => s.replace(INVALID, "").replace(/\s+/g, " ").trim();

/** Don't zip the whole history by accident, and don't time out trying. */
const MAX = 400;
/** Storage downloads in flight at once. */
const PARALLEL = 8;

/**
 * Every certificate for one carer, or for one course, as a single ZIP.
 *
 * Managers were downloading PDFs one at a time for an inspection, or
 * exporting a spreadsheet and printing that instead (usability audit,
 * 7 Oct 2026). The recruitment section already did exactly this for a
 * candidate's documents; this is the same pattern, scoped to the caller's
 * organisation, which — because reads run as the service role — is the only
 * thing keeping one org's certificates away from another's.
 *
 *   /org/certificates/pack?userId=…   one carer, every course
 *   /org/certificates/pack?course=…   one course, every carer
 */
export async function GET(req: NextRequest) {
  const context = await requireConsole();
  if (!context.organisationId) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  const courseId = req.nextUrl.searchParams.get("course");
  if (!userId && !courseId) {
    return new NextResponse("Choose a carer or a course.", { status: 400 });
  }

  const admin = createAdminClient();
  const rows = await fetchAll((from, to) => {
    let q = admin
      .from("certificates")
      .select("id, pdf_path, issued_at, courses(title), users(full_name, email)")
      .eq("organisation_id", context.organisationId!)
      .not("pdf_path", "is", null);
    if (userId) q = q.eq("user_id", userId);
    if (courseId) q = q.eq("course_id", courseId);
    return q.order("id").range(from, to);
  });

  if (rows.length === 0) {
    return new NextResponse("No certificates to download.", { status: 404 });
  }

  // Downloaded a few at a time rather than strictly one after another: a
  // course held by 260 carers was 260 sequential storage round trips, which
  // is most of the 60-second function limit. Files are added to the ZIP in
  // the original order, so names and renewal suffixes come out the same.
  const wanted = rows.slice(0, MAX);
  const files: (Blob | null)[] = new Array(wanted.length).fill(null);
  for (let i = 0; i < wanted.length; i += PARALLEL) {
    const batch = wanted.slice(i, i + PARALLEL);
    const got = await Promise.all(
      batch.map((r) =>
        admin.storage.from("certificates").download(r.pdf_path as string),
      ),
    );
    got.forEach(({ data }, j) => (files[i + j] = data ?? null));
  }

  const zip = new JSZip();
  const used = new Set<string>();
  let packed = 0;
  for (const [i, r] of wanted.entries()) {
    const file = files[i];
    if (!file) continue;
    const course = (r.courses as { title?: string } | null)?.title ?? "Course";
    const u = r.users as { full_name?: string; email?: string } | null;
    const learner = u?.full_name || u?.email || "Learner";
    // Two certificates for the same pair (a renewal) would collide.
    let name = safeName(`${learner} - ${course}`) || "certificate";
    if (used.has(name)) name = `${name} (${String(r.issued_at).slice(0, 10)})`;
    used.add(name);
    zip.file(`${name}.pdf`, await file.arrayBuffer());
    packed += 1;
  }

  if (packed === 0) {
    return new NextResponse("No certificates to download.", { status: 404 });
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const label = userId
    ? safeName(
        ((rows[0].users as { full_name?: string; email?: string } | null)?.full_name ??
          "carer") as string,
      )
    : safeName(((rows[0].courses as { title?: string } | null)?.title ?? "course") as string);
  const filename = `${(label || "certificates").replace(/\s+/g, "-").toLowerCase()}-certificates.zip`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
