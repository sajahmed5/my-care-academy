import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { docLabel } from "@/lib/recruitment";
import { entryNamer, extOf, safeEntry } from "@/lib/evidence-files";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The source files behind one carer's evidence pack, as a ZIP — CARER-FILE.md
 * §4. Its own route, beside the PDF, because one route that renders the PDF
 * and streams every attachment is the one that runs out of time on a carer of
 * four years' standing.
 *
 *   Certificates/              every certificate PDF issued to them
 *   Recruitment documents/     their right to work, DBS, references… from the
 *                              candidate record they were hired from
 *   Care Certificate/          observation evidence and the signed award
 *
 * Read as the service role, so each folder is gated with hasFeatureForOrg()
 * exactly as the page gates its section, and the person must be in the
 * caller's organisation. ?from= narrows it to files dated on or after a day,
 * as the PDF pack does. The download is audited, like the pack.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const context = await requireConsole();
  const { userId } = await params;
  const orgId = context.organisationId;
  if (!orgId) return new NextResponse("Not found.", { status: 404 });

  const fromParam = req.nextUrl.searchParams.get("from");
  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : null;
  const onOrAfter = (d: string | null | undefined) => !from || (!!d && d.slice(0, 10) >= from);

  const admin = createAdminClient();
  const { data: person } = await admin
    .from("users")
    .select("id, full_name, email, organisation_id")
    .eq("id", userId)
    .maybeSingle();
  if (!person || person.organisation_id !== orgId) return new NextResponse("Not found.", { status: 404 });

  const [recruitment, observations] = await Promise.all([
    hasFeatureForOrg(admin, orgId, "recruitment.tracker"),
    hasFeatureForOrg(admin, orgId, "training.observations"),
  ]);

  // Everything to fetch, gathered first and downloaded together.
  const wanted: { bucket: string; path: string; folder: string; base: string; ext: string }[] = [];

  const { data: certs } = await admin
    .from("certificates")
    .select("issued_at, pdf_path, course:courses (title)")
    .eq("user_id", userId)
    .eq("organisation_id", orgId)
    .not("pdf_path", "is", null);
  for (const c of certs ?? []) {
    if (!onOrAfter(c.issued_at as string)) continue;
    const course = (Array.isArray(c.course) ? c.course[0] : c.course) as { title?: string } | null;
    wanted.push({
      bucket: "certificates",
      path: c.pdf_path as string,
      folder: "Certificates",
      base: `${course?.title ?? "Certificate"} - ${formatDate(c.issued_at as string, { day: "numeric", month: "short", year: "numeric" })}`,
      ext: "pdf",
    });
  }

  // The candidate record they were hired from, matched by email within the
  // organisation: hiring creates the account from the candidate's email.
  if (recruitment && person.email) {
    const { data: cands } = await admin
      .from("candidates")
      .select("id")
      .eq("organisation_id", orgId)
      .ilike("email", person.email as string);
    const ids = (cands ?? []).map((c) => c.id as string);
    if (ids.length) {
      const { data: docs } = await admin
        .from("candidate_documents")
        .select("doc_type, file_path, file_name, created_at")
        .in("candidate_id", ids)
        .not("file_path", "is", null);
      for (const d of docs ?? []) {
        if (!onOrAfter(d.created_at as string)) continue;
        wanted.push({
          bucket: "candidate-docs",
          path: d.file_path as string,
          folder: "Recruitment documents",
          base: docLabel(d.doc_type as string),
          ext: extOf((d.file_name as string | null) ?? (d.file_path as string)),
        });
      }
    }
  }

  if (observations) {
    const [{ data: obs }, { data: signoff }] = await Promise.all([
      admin
        .from("care_cert_observations")
        .select("standard_no, observed_at, evidence_path")
        .eq("user_id", userId)
        .eq("organisation_id", orgId)
        .not("evidence_path", "is", null),
      admin
        .from("care_cert_signoffs")
        .select("signed_at, pdf_path")
        .eq("user_id", userId)
        .eq("organisation_id", orgId)
        .not("pdf_path", "is", null)
        .maybeSingle(),
    ]);
    for (const o of obs ?? []) {
      if (!onOrAfter(o.observed_at as string | null)) continue;
      wanted.push({
        bucket: "observation-evidence",
        path: o.evidence_path as string,
        folder: "Care Certificate",
        base: `Standard ${o.standard_no} evidence`,
        ext: extOf(o.evidence_path as string),
      });
    }
    if (signoff?.pdf_path && onOrAfter(signoff.signed_at as string)) {
      wanted.push({
        bucket: "observation-evidence",
        path: signoff.pdf_path as string,
        folder: "Care Certificate",
        base: "Care Certificate award",
        ext: "pdf",
      });
    }
  }

  const zip = new JSZip();
  const name = entryNamer();
  const got = await Promise.all(
    wanted.map(async (w) => {
      const { data } = await admin.storage.from(w.bucket).download(w.path);
      return { w, buffer: data ? await data.arrayBuffer() : null };
    }),
  );
  let missing = 0;
  for (const { w, buffer } of got) {
    if (!buffer) {
      missing++;
      continue;
    }
    zip.file(name(w.folder, w.base, w.ext), buffer);
  }
  // Said inside the ZIP rather than left silent: a short or empty ZIP
  // otherwise reads as a carer with no documents.
  const readme = [
    `Source files for ${person.full_name || person.email}`,
    from
      ? `Files dated on or after ${formatDate(from, { day: "numeric", month: "long", year: "numeric" })}.`
      : "Everything on file.",
    `Generated ${formatDate(new Date(), { day: "numeric", month: "long", year: "numeric" })} by ${context.email ?? "a manager"}.`,
    "",
    `${got.length - missing} file(s) included.`,
    missing ? `${missing} file(s) are recorded but could not be read from storage.` : "",
    recruitment ? "" : "Recruitment documents are not included: recruitment is not in your package.",
    observations ? "" : "Care Certificate evidence is not included: observations are not in your package.",
  ]
    .filter((l, i) => l !== "" || i === 3)
    .join("\n");
  zip.file("README.txt", readme);

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await logAudit({
    context,
    action: "evidence_files.exported",
    entity: "user",
    entityId: userId,
    detail: { from, files: got.length - missing, missing },
  });

  const filename = `${safeEntry(person.full_name || "carer")} - source files${from ? ` since ${from}` : ""}.zip`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
