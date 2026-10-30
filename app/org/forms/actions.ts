"use server";

import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";

/**
 * Signed URL to view a file answer on a form or a log (own organisation
 * only). The old builder's actions lived here too; it was retired when a
 * company's own forms moved under Settings → Forms.
 */
export async function getSubmissionFileUrlAction(
  path: string,
): Promise<{ url?: string }> {
  const context = await requireConsole();
  if (!path.startsWith(`${context.organisationId}/`)) return {};
  if (!(await hasFeature(context, "forms.builder"))) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("form-uploads")
    .createSignedUrl(path, 60);
  return { url: data?.signedUrl };
}
