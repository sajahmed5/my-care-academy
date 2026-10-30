"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { SaveState } from "@/app/platform/actions";

export type LibraryState = SaveState;

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
  // Forms and logs are on their way to Forms; publishing one here would put
  // it nowhere a customer can see (policy_documents_read is policies only).
  const { error, count } = await supabase
    .from("policy_documents")
    .update({ status }, { count: "exact" })
    .eq("code", code)
    .eq("kind", "policy");
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
