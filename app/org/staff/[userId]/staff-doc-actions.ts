"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, type UserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { STAFF_DOCS } from "@/lib/staff-documents";
import { fileFromDataUrl } from "@/lib/data-url";

const BUCKET = "staff-docs";

/**
 * A current staff member's compliance documents (ROADMAP §3). Run as the
 * service role, so each action checks for itself what RLS would: the person
 * is in the caller's organisation, the package includes recruitment.tracker,
 * and the document is one of the four on the list.
 */
async function gate(
  context: UserContext,
  userId: string,
  docType: string,
): Promise<{ admin: ReturnType<typeof createAdminClient>; error?: string }> {
  const admin = createAdminClient();
  if (!STAFF_DOCS.some((d) => d.key === docType)) return { admin, error: "Unknown document." };
  const orgId = context.organisationId;
  if (!orgId || !(await hasFeatureForOrg(admin, orgId, "recruitment.tracker"))) {
    return { admin, error: "Staff documents are not included in your plan." };
  }
  const { data: person } = await admin.from("users").select("organisation_id").eq("id", userId).maybeSingle();
  if (!person || person.organisation_id !== orgId) return { admin, error: "That person is not in your organisation." };
  return { admin };
}

export async function uploadStaffDocAction(
  userId: string,
  docType: string,
  file: { name: string; dataUrl: string },
  expiresAt: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const { admin, error: gateError } = await gate(context, userId, docType);
  if (gateError) return { ok: false, error: gateError };
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return { ok: false, error: "Check the expiry date." };

  const { data: previous } = await admin
    .from("staff_documents")
    .select("file_path")
    .eq("user_id", userId)
    .eq("doc_type", docType)
    .maybeSingle();

  const { buffer, contentType } = fileFromDataUrl(file.dataUrl);
  const path = `${context.organisationId}/${userId}/${docType}-${crypto.randomUUID()}-${file.name.replace(/[^\w.\- ]+/g, "")}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType });
  if (upErr) return { ok: false, error: upErr.message };

  const { error } = await admin.from("staff_documents").upsert(
    {
      organisation_id: context.organisationId,
      user_id: userId,
      doc_type: docType,
      file_path: path,
      file_name: file.name,
      expires_at: expiresAt || null,
      not_required: false,
      not_required_reason: null,
      uploaded_by: context.userId,
    },
    { onConflict: "user_id,doc_type" },
  );
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: error.message };
  }
  // The file it replaces goes too: an old passport kept for no reason is
  // data we should not hold.
  if (previous?.file_path && previous.file_path !== path) {
    await admin.storage.from(BUCKET).remove([previous.file_path as string]);
  }

  await logAudit({ context, action: "staff_document.uploaded", entity: "user", entityId: userId, detail: { docType, expiresAt } });
  revalidatePath(`/org/staff/${userId}`);
  return { ok: true };
}

export async function markStaffDocNotNeededAction(
  userId: string,
  docType: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const { admin, error: gateError } = await gate(context, userId, docType);
  if (gateError) return { ok: false, error: gateError };
  const { data: existing } = await admin
    .from("staff_documents")
    .select("file_path")
    .eq("user_id", userId)
    .eq("doc_type", docType)
    .maybeSingle();
  if (existing?.file_path) return { ok: false, error: "A file is held for this — remove it first." };

  const { error } = await admin.from("staff_documents").upsert(
    {
      organisation_id: context.organisationId,
      user_id: userId,
      doc_type: docType,
      file_path: null,
      file_name: null,
      expires_at: null,
      not_required: true,
      not_required_reason: reason.trim().slice(0, 200) || null,
      uploaded_by: context.userId,
    },
    { onConflict: "user_id,doc_type" },
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "staff_document.not_required", entity: "user", entityId: userId, detail: { docType, reason: reason.trim() || null } });
  revalidatePath(`/org/staff/${userId}`);
  return { ok: true };
}

/** Remove a held file, or undo "not needed". */
export async function removeStaffDocAction(userId: string, docType: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const { admin, error: gateError } = await gate(context, userId, docType);
  if (gateError) return { ok: false, error: gateError };
  const { data: existing } = await admin
    .from("staff_documents")
    .select("file_path")
    .eq("user_id", userId)
    .eq("doc_type", docType)
    .maybeSingle();
  if (existing?.file_path) await admin.storage.from(BUCKET).remove([existing.file_path as string]);
  const { error } = await admin.from("staff_documents").delete().eq("user_id", userId).eq("doc_type", docType);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "staff_document.removed", entity: "user", entityId: userId, detail: { docType } });
  revalidatePath(`/org/staff/${userId}`);
  return { ok: true };
}

/** A one-minute link to view a held file. */
export async function staffDocUrlAction(userId: string, docType: string): Promise<{ url?: string }> {
  const context = await requireConsole();
  const { admin, error } = await gate(context, userId, docType);
  if (error) return {};
  const { data: doc } = await admin
    .from("staff_documents")
    .select("file_path")
    .eq("user_id", userId)
    .eq("doc_type", docType)
    .maybeSingle();
  if (!doc?.file_path) return {};
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(doc.file_path as string, 60);
  return { url: data?.signedUrl };
}
