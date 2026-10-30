"use server";

import { revalidatePath } from "next/cache";
import { assertActiveMember, requireConsole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import {
  appliesTo,
  cleanBlocks,
  loadCopy,
  loadPolicy,
  loadPolicySettings,
  mergeDetails,
  stillToWrite,
  ukToday,
} from "@/lib/policy-library";
import { addMonths } from "@/lib/records";
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
 * with their name and details already in it (ROADMAP §1; the details from
 * Settings → Policies). Staff see nothing until it is completed and published.
 */
export async function adoptPolicyAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "documents.library"))) return { ok: false, error: "The policy library is not in your plan." };
  const code = String(formData.get("code") ?? "");
  const supabase = await createClient();
  const [doc, { data: org }, settings] = await Promise.all([
    loadPolicy(supabase, code, context.userId),
    supabase.from("organisations").select("name, service_type").eq("id", context.organisationId!).single(),
    loadPolicySettings(supabase, context.organisationId!),
  ]);
  if (!doc || doc.kind !== "policy" || !appliesTo(doc.service_types, (org?.service_type as string | null) ?? null)) {
    return { ok: false, error: "That policy is not in your library." };
  }
  const { error } = await supabase.from("organisation_policies").insert({
    organisation_id: context.organisationId,
    policy_id: doc.id,
    blocks: [],
    draft_blocks: mergeDetails(doc.blocks, (org?.name as string) ?? "Your organisation", settings.details),
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
 * Only a manager publishes or signs off a review: a published policy is the
 * company's official word (POLICIES.md, "Who publishes"). Office staff
 * prepare it. Checked here rather than with requireRole, which would
 * redirect an action instead of saying why.
 */
async function requireManager() {
  const context = await requireConsole();
  return context.role === "org_admin" ? context : null;
}

/** The next review date for a copy: its own period, else the company's. */
async function nextReviewOn(supabase: Awaited<ReturnType<typeof createClient>>, organisationId: string, ownMonths: number | null) {
  const months = ownMonths ?? (await loadPolicySettings(supabase, organisationId)).review_months;
  return addMonths(ukToday(), months);
}

/**
 * Publish the working copy to staff: it becomes the text they read, as a new
 * version, and everyone is asked to accept it afresh. Refused while any
 * guidance or bracketed fill-in is left. Publishing is a review too: the
 * next one falls a review period from today, and a republish is recorded in
 * the policy's review history as one that changed it.
 */
export async function publishPolicyAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireManager();
  if (!context) return { ok: false, error: "Only a manager can publish a policy. Save your draft and ask them to publish it." };
  const copyId = String(formData.get("copyId") ?? "");
  const code = String(formData.get("code") ?? "");
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("organisation_policies")
    .select("id, policy_id, version, draft_blocks, review_months")
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
  const reviewDue = await nextReviewOn(supabase, context.organisationId!, (row.review_months as number | null) ?? null);
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
      review_due_on: reviewDue,
    })
    .eq("id", copyId);
  if (error) return { ok: false, error: error.message };
  if (version > 1) {
    await supabase.from("organisation_policy_reviews").insert({
      organisation_id: context.organisationId,
      organisation_policy_id: copyId,
      reviewed_by: context.userId,
      outcome: "new_version",
      version,
      next_due_on: reviewDue,
    });
  }
  await logAudit({ context, action: "policy.published", entity: "policy_document", entityId: row.policy_id as string, detail: { code, version } });
  revalidatePath("/org/policies");
  revalidatePath(`/org/policies/${code}`);
  revalidatePath("/org/due/policies");
  revalidatePath("/learn/policies");
  return { ok: true };
}

/**
 * Reviewed, and nothing needed changing: the date moves on, the version
 * stays, and nobody is asked to accept it again.
 */
export async function reviewNoChangeAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireManager();
  if (!context) return { ok: false, error: "Only a manager can sign off a review." };
  const copyId = String(formData.get("copyId") ?? "");
  const code = String(formData.get("code") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("organisation_policies")
    .select("id, policy_id, status, version, review_months")
    .eq("id", copyId)
    .maybeSingle();
  if (!row || row.status !== "published" || (row.version as number) < 1) {
    return { ok: false, error: "Only a published policy can be reviewed." };
  }
  const reviewDue = await nextReviewOn(supabase, context.organisationId!, (row.review_months as number | null) ?? null);
  const { error } = await supabase.from("organisation_policy_reviews").insert({
    organisation_id: context.organisationId,
    organisation_policy_id: copyId,
    reviewed_by: context.userId,
    outcome: "no_change",
    version: row.version,
    next_due_on: reviewDue,
    note: note || null,
  });
  if (error) return { ok: false, error: error.message };
  const { error: upd } = await supabase
    .from("organisation_policies")
    .update({ review_due_on: reviewDue, updated_by: context.userId })
    .eq("id", copyId);
  if (upd) return { ok: false, error: upd.message };
  await logAudit({
    context,
    action: "policy.reviewed",
    entity: "policy_document",
    entityId: row.policy_id as string,
    detail: { code, version: row.version, next: reviewDue },
  });
  revalidatePath("/org/policies");
  revalidatePath(`/org/policies/${code}`);
  revalidatePath("/org/due/policies");
  return { ok: true };
}

/**
 * Put the company's details (Settings → Policies) into the working copy,
 * wherever a [Registered manager]-style fill-in is still waiting for one.
 */
export async function fillDetailsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  const copyId = String(formData.get("copyId") ?? "");
  const code = String(formData.get("code") ?? "");
  const supabase = await createClient();
  const [{ data: row }, { data: org }, settings] = await Promise.all([
    supabase.from("organisation_policies").select("id, blocks, draft_blocks").eq("id", copyId).maybeSingle(),
    supabase.from("organisations").select("name").eq("id", context.organisationId!).single(),
    loadPolicySettings(supabase, context.organisationId!),
  ]);
  if (!row) return { ok: false, error: "That policy is no longer there." };
  const current = cleanBlocks(row.draft_blocks ?? row.blocks) ?? [];
  const merged = mergeDetails(current, (org?.name as string) ?? "Your organisation", settings.details);
  if (JSON.stringify(merged) === JSON.stringify(current)) {
    return { ok: false, error: "Nothing to fill in: add the missing details under Settings → Policies first." };
  }
  const { error } = await supabase
    .from("organisation_policies")
    .update({ draft_blocks: merged, updated_by: context.userId })
    .eq("id", copyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/policies/${code}`);
  return { ok: true };
}
