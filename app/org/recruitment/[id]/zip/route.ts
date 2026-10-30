import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { docLabel } from "@/lib/recruitment";
import { hasFeatureForOrg } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

/** Download all of a candidate's documents as a ZIP (console users, own org only). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // MFA and the deactivated-account check, as every console page has.
  const context = await requireConsole();
  if (!context.organisationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const admin = createAdminClient();

  const { data: candidate } = await admin
    .from("candidates")
    .select("full_name, organisation_id")
    .eq("id", id)
    .maybeSingle();
  if (!candidate || candidate.organisation_id !== context.organisationId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // This reads as the service role, so RLS is not gating it — without this an
  // organisation that has stopped paying for recruitment could still pull a
  // candidate's DBS and right-to-work documents by URL. Same 404 as a foreign
  // candidate: an unentitled org learns nothing about what exists.
  if (!(await hasFeatureForOrg(admin, context.organisationId, "recruitment.tracker"))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: docs } = await admin
    .from("candidate_documents")
    .select("doc_type, file_path, file_name")
    .eq("candidate_id", id);

  // Fetched together rather than one after another: twelve files in series
  // was twelve round trips to storage before the ZIP could start.
  const zip = new JSZip();
  const held = (docs ?? []).filter((d) => d.file_path); // a "not needed" row has no file
  const files = await Promise.all(
    held.map(async (d) => {
      const { data: file } = await admin.storage.from("candidate-docs").download(d.file_path!);
      return { d, buffer: file ? await file.arrayBuffer() : null };
    }),
  );
  for (const { d, buffer } of files) {
    if (!buffer) continue;
    const ext = (d.file_name ?? "").split(".").pop() ?? "bin";
    zip.file(`${docLabel(d.doc_type)}.${ext}`, buffer);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const safeName = candidate.full_name.replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}-documents.zip"`,
    },
  });
}
