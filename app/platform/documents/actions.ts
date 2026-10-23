"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { SaveState } from "@/app/platform/actions";

/** A save that can also say how many documents it moved. */
export interface LibraryState extends SaveState {
  count?: number;
}

/**
 * Publishing is what makes a document real to customers, so it is a platform
 * admin's deliberate act and nothing else's side effect. The importer writes
 * drafts and keeps whatever has been decided here; this is the only place a
 * status changes.
 *
 * Written through the RLS-scoped client: policy_documents_platform_admin is
 * the gate, so there is one rule rather than two that can drift.
 */

const STATUSES = ["draft", "published", "retired"] as const;

export async function setPolicyStatusAction(
  _prev: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const context = await requireRole("platform_admin");

  const code = String(formData.get("code") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!code) return { ok: false, error: "No document given." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { ok: false, error: "Unknown status." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("policy_documents")
    .update({ status }, { count: "exact" })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };
  if (count === 0) return { ok: false, error: "That document is no longer there." };

  await logAudit({
    context,
    action: "policy.status",
    entity: "policy_document",
    detail: { code, status },
  });

  revalidatePath("/platform/documents");
  revalidatePath(`/platform/documents/${code}`);
  revalidatePath("/org/policies");
  return { ok: true };
}

/**
 * Publish or withdraw a whole pack at once.
 *
 * Reviewing 129 documents one at a time is the reason a library sits in draft
 * for a year. Scoped by pack and kind, because "publish the policies, leave
 * the forms" is the real decision being made.
 */
export async function setPackStatusAction(
  _prev: LibraryState,
  formData: FormData,
): Promise<LibraryState> {
  const context = await requireRole("platform_admin");

  const pack = String(formData.get("pack") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { ok: false, error: "Unknown status." };
  }

  const supabase = await createClient();
  let query = supabase.from("policy_documents").update({ status }, { count: "exact" });
  if (pack) query = query.eq("pack", pack);
  if (kind) query = query.eq("kind", kind);
  // Guard against a formless request becoming "publish everything".
  if (!pack && !kind) return { ok: false, error: "Choose a pack or a type first." };

  const { error, count } = await query;
  if (error) return { ok: false, error: error.message };

  await logAudit({
    context,
    action: "policy.status.bulk",
    entity: "policy_document",
    detail: { pack: pack || null, kind: kind || null, status, count },
  });

  revalidatePath("/platform/documents");
  revalidatePath("/org/policies");
  return { ok: true, count: count ?? 0 };
}
