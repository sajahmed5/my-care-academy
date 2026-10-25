import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { groupByBucket } from "@/lib/user-erasure";

/**
 * Removing an organisation that has left the platform (Saj, 26 Oct 2026:
 * there is no retention period — records are kept while the organisation
 * uses the platform, and removed when it leaves).
 *
 * Deleting the organisations row cascades to every table that belongs to it
 * (users, training, certificates, supervisions, complaints, policies …), so
 * the work here is what a cascade cannot reach:
 *
 *   - sign-in accounts: auth.users is the parent of public.users, so each
 *     account is deleted through the Auth admin API, which then takes the
 *     profile row with it;
 *   - stored files: the rows that name them vanish with the cascade, and a
 *     file nobody points at sits in its bucket for ever. Files are found two
 *     ways — by the organisation's folder in the buckets that are laid out by
 *     organisation, and by the rows that name them in the ones laid out by
 *     person;
 *   - the email log, whose rows only lose their organisation on a cascade and
 *     would keep every address.
 *
 * Audit log rows for the organisation are removed too, leaving one row that
 * records the removal itself. Support reports (issue_reports) are ours and
 * stay, with their organisation cleared by the existing foreign key.
 */

/** Buckets whose files sit under `<organisation id>/…`. */
export const ORG_FOLDER_BUCKETS = ["candidate-docs", "staff-docs", "form-uploads", "complaint-documents", "org-logos"] as const;

export interface RemovalSummary {
  name: string;
  accounts: number;
  files: number;
  fileFailures: string[];
}

/** Every file under a folder, however deep. */
async function listFolder(admin: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error || !data || data.length === 0) break;
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      // A folder comes back with no id; a file has one.
      if (item.id) out.push(path);
      else out.push(...(await listFolder(admin, bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

export async function removeOrganisation(admin: SupabaseClient, organisationId: string): Promise<RemovalSummary> {
  const { data: org } = await admin.from("organisations").select("name").eq("id", organisationId).single();
  const name = (org?.name as string) ?? "Unknown organisation";

  const { data: people } = await admin.from("users").select("id").eq("organisation_id", organisationId);
  const userIds = (people ?? []).map((u) => u.id as string);

  // Files named by rows, in the buckets laid out by person.
  const [certs, obs, signoffs] = await Promise.all([
    admin.from("certificates").select("pdf_path").eq("organisation_id", organisationId),
    admin.from("care_cert_observations").select("evidence_path").eq("organisation_id", organisationId),
    admin.from("care_cert_signoffs").select("pdf_path").eq("organisation_id", organisationId),
  ]);
  const found = [
    ...(certs.data ?? []).map((r) => ({ bucket: "certificates", path: r.pdf_path as string })),
    ...(obs.data ?? []).map((r) => ({ bucket: "observation-evidence", path: r.evidence_path as string })),
    ...(signoffs.data ?? []).map((r) => ({ bucket: "observation-evidence", path: r.pdf_path as string })),
  ];
  for (const bucket of ORG_FOLDER_BUCKETS) {
    for (const path of await listFolder(admin, bucket, organisationId)) found.push({ bucket, path });
  }

  let files = 0;
  const fileFailures: string[] = [];
  for (const { bucket, paths } of groupByBucket(found)) {
    for (let i = 0; i < paths.length; i += 1000) {
      const chunk = paths.slice(i, i + 1000);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) fileFailures.push(`${bucket}: ${error.message}`);
      else files += chunk.length;
    }
  }

  // Accounts, ten at a time: each takes its profile row with it.
  let accounts = 0;
  for (let i = 0; i < userIds.length; i += 10) {
    const results = await Promise.all(userIds.slice(i, i + 10).map((id) => admin.auth.admin.deleteUser(id)));
    accounts += results.filter((r) => !r.error).length;
  }

  await admin.from("email_log").delete().eq("organisation_id", organisationId);
  await admin.from("audit_logs").delete().eq("organisation_id", organisationId);
  const { error } = await admin.from("organisations").delete().eq("id", organisationId);
  if (error) throw new Error(`The organisation could not be removed: ${error.message}`);

  return { name, accounts, files, fileFailures };
}
