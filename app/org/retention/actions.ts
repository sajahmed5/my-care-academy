"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { isPastRetention } from "@/lib/retention";
import type { SaveState } from "@/app/platform/actions";

/**
 * Deleting a record that has passed 7-year retention (lib/retention.ts).
 * Manager-only, like the Account page it hangs off. Each action re-checks
 * that the record is this organisation's and really is past retention, so
 * the button cannot be used to delete anything newer.
 */

export async function deleteRetainedComplaintAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("complaints")
    .select("organisation_id, reference, status, closed_on")
    .eq("id", id)
    .maybeSingle();
  if (!c || c.organisation_id !== context.organisationId) return { ok: false, error: "Not found." };
  if (c.status === "open" || !isPastRetention(c.closed_on as string | null, new Date())) {
    return { ok: false, error: "This record is not past retention yet." };
  }
  // Files first: the rows naming them cascade with the complaint.
  const { data: docs } = await admin.from("complaint_documents").select("file_path").eq("complaint_id", id);
  const paths = (docs ?? []).map((d) => d.file_path as string).filter(Boolean);
  if (paths.length) await admin.storage.from("complaint-documents").remove(paths);
  await admin.from("record_actions").delete().eq("source_type", "complaint").eq("source_id", id);
  const { error } = await admin.from("complaints").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({
    context,
    action: "complaint.deleted_after_retention",
    entity: "complaint",
    entityId: id,
    detail: { reference: c.reference, closedOn: c.closed_on, files: paths.length },
  });
  revalidatePath("/org/retention");
  return { ok: true };
}

export async function deleteRetainedIncidentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  const id = String(formData.get("id") ?? "");
  const admin = createAdminClient();
  const { data: i } = await admin
    .from("incidents")
    .select("organisation_id, status, closed_on, kind")
    .eq("id", id)
    .maybeSingle();
  if (!i || i.organisation_id !== context.organisationId) return { ok: false, error: "Not found." };
  if (i.status !== "closed" || !isPastRetention(i.closed_on as string | null, new Date())) {
    return { ok: false, error: "This record is not past retention yet." };
  }
  const { error } = await admin.from("incidents").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({
    context,
    action: "incident.deleted_after_retention",
    entity: "incident",
    entityId: id,
    detail: { kind: i.kind, closedOn: i.closed_on },
  });
  revalidatePath("/org/retention");
  return { ok: true };
}
