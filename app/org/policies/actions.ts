"use server";

import { revalidatePath } from "next/cache";
import { assertActiveMember, requireConsole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import { appliesTo, cleanBlocks, loadCopy, loadPolicy, render, stillToWrite } from "@/lib/policy-library";
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
  if (!policyId) return { ok: false, error: "No policy given." };

  // Staff accept their organisation's published copy, at the version it is
  // now — read here, not taken from the page, so nobody accepts a version
  // that was never published.
  const supabase = await createClient();
  const copy = await loadCopy(supabase, context.organisationId, policyId);
  if (!copy || copy.status !== "published" || copy.version < 1) {
    return { ok: false, error: "This policy has not been published to staff yet." };
  }
  const version = copy.version;
  const { error } = await supabase.from("policy_acknowledgements").insert({
    organisation_id: context.organisationId,
    user_id: context.userId,
    policy_id: policyId,
    organisation_policy_id: copy.id,
    version,
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
    detail: { code, version, copy: copy.id },
  });

  revalidatePath("/org/policies");
  if (code) revalidatePath(`/org/policies/${code}`);
  return { ok: true };
}

/**
 * Adopt a template: the organisation's own copy, starting from the template
 * with their name already in it (ROADMAP §1). Staff see nothing until it is
 * completed and published.
 */
export async function adoptPolicyAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "documents.library"))) return { ok: false, error: "The policy library is not in your plan." };
  const code = String(formData.get("code") ?? "");
  const supabase = await createClient();
  const [doc, { data: org }] = await Promise.all([
    loadPolicy(supabase, code, context.userId),
    supabase.from("organisations").select("name, service_type").eq("id", context.organisationId!).single(),
  ]);
  if (!doc || doc.kind !== "policy" || !appliesTo(doc.service_types, (org?.service_type as string | null) ?? null)) {
    return { ok: false, error: "That policy is not in your library." };
  }
  const { error } = await supabase.from("organisation_policies").insert({
    organisation_id: context.organisationId,
    policy_id: doc.id,
    blocks: [],
    draft_blocks: render(doc.blocks, (org?.name as string) ?? "Your organisation"),
    template_version: doc.version ?? 1,
    updated_by: context.userId,
  });
  if (error && !error.message.toLowerCase().includes("duplicate")) return { ok: false, error: error.message };
  await logAudit({ context, action: "policy.adopted", entity: "policy_document", entityId: doc.id, detail: { code } });
  revalidatePath("/org/policies");
  revalidatePath(`/org/policies/${code}`);
  return { ok: true };
}

/** Save the working copy. Staff keep reading the published version. */
export async function savePolicyDraftAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  const copyId = String(formData.get("copyId") ?? "");
  const code = String(formData.get("code") ?? "");
  let blocks;
  try {
    blocks = cleanBlocks(JSON.parse(String(formData.get("blocks") ?? "[]")));
  } catch {
    blocks = null;
  }
  if (!blocks) return { ok: false, error: "The policy text could not be read. Try again." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("organisation_policies")
    .update({ draft_blocks: blocks, updated_by: context.userId })
    .eq("id", copyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/policies/${code}`);
  return { ok: true };
}

/**
 * Publish the working copy to staff: it becomes the text they read, as a new
 * version, and everyone is asked to accept it afresh. Refused while any
 * guidance or bracketed fill-in is left.
 */
export async function publishPolicyAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  const copyId = String(formData.get("copyId") ?? "");
  const code = String(formData.get("code") ?? "");
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("organisation_policies")
    .select("id, policy_id, version, draft_blocks")
    .eq("id", copyId)
    .maybeSingle();
  if (!row) return { ok: false, error: "That policy is no longer there." };
  const draft = cleanBlocks(row.draft_blocks);
  if (!draft || draft.length === 0) return { ok: false, error: "There are no changes to publish." };
  const left = stillToWrite(draft);
  if (left.guidance + left.fillIns > 0) {
    return { ok: false, error: `Finish writing it first: ${left.guidance + left.fillIns} part(s) still to complete.` };
  }
  const version = ((row.version as number) ?? 0) + 1;
  const { error } = await supabase
    .from("organisation_policies")
    .update({
      blocks: draft,
      draft_blocks: null,
      status: "published",
      version,
      published_at: new Date().toISOString(),
      published_by: context.userId,
      updated_by: context.userId,
    })
    .eq("id", copyId);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "policy.published", entity: "policy_document", entityId: row.policy_id as string, detail: { code, version } });
  revalidatePath("/org/policies");
  revalidatePath(`/org/policies/${code}`);
  revalidatePath("/learn/policies");
  return { ok: true };
}
