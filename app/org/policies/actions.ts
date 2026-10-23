"use server";

import { revalidatePath } from "next/cache";
import { assertActiveMember, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { SaveState } from "@/app/platform/actions";

/**
 * Accept a policy.
 *
 * Written as the signed-in person through the RLS-scoped client, never on
 * their behalf: `policy_ack_own_insert` only permits a row whose user_id is
 * the caller, which is the point. An acknowledgement somebody else recorded is
 * worth nothing as evidence, and that policy is what stops us creating one.
 *
 * Any member of an organisation may accept — a carer most of all — so this
 * guards on being signed in and having an organisation, not on a role.
 *
 * The version accepted is stored on the row. Revise the policy and this stays
 * true about the text they read, while the new version shows as unaccepted.
 */
export async function acceptPolicyAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireUser();
  if (!context.organisationId) {
    return { ok: false, error: "Only a member of an organisation can accept a policy." };
  }
  await assertActiveMember(context);

  const policyId = String(formData.get("policyId") ?? "");
  const code = String(formData.get("code") ?? "");
  const version = Number(formData.get("version") ?? 0);
  if (!policyId) return { ok: false, error: "No policy given." };

  const supabase = await createClient();
  const { error } = await supabase.from("policy_acknowledgements").insert({
    organisation_id: context.organisationId,
    user_id: context.userId,
    policy_id: policyId,
    version: version || 1,
  });
  // Accepting twice is not a failure worth showing anyone.
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return { ok: false, error: error.message };
  }

  await logAudit({
    context,
    action: "policy.accepted",
    entity: "policy_document",
    entityId: policyId,
    detail: { code, version: version || 1 },
  });

  revalidatePath("/org/policies");
  if (code) revalidatePath(`/org/policies/${code}`);
  return { ok: true };
}
