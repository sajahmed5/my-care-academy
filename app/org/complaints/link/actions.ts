"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import type { SaveState } from "@/app/platform/actions";

const NOT_IN_PLAN = "Complaints are not included in your plan.";

/**
 * Make the organisation's raise-a-concern link, or a new one in its place.
 * A new token is how a link that has been passed too far is withdrawn: the
 * old address stops working at once.
 */
export async function makeConcernLinkAction(): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "complaints.register"))) return { ok: false, error: NOT_IN_PLAN };
  const supabase = await createClient();
  const { error } = await supabase.from("concern_links").upsert(
    {
      organisation_id: context.organisationId,
      // The whole address: long and random, so a link cannot be guessed.
      token: crypto.randomBytes(24).toString("base64url"),
      is_open: true,
      created_by: context.userId,
    },
    { onConflict: "organisation_id" },
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "complaint.link_made", entity: "concern_link" });
  revalidatePath("/org/complaints/link");
  return { ok: true };
}

/** Open or close the link. A closed link says so and takes nothing. */
export async function setConcernLinkOpenAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "complaints.register"))) return { ok: false, error: NOT_IN_PLAN };
  const open = formData.get("open") === "1";
  const supabase = await createClient();
  const { error } = await supabase
    .from("concern_links")
    .update({ is_open: open })
    .eq("organisation_id", context.organisationId!);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: open ? "complaint.link_opened" : "complaint.link_closed", entity: "concern_link" });
  revalidatePath("/org/complaints/link");
  return { ok: true };
}
