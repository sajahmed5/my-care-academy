import "server-only";
import type { UserContext } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { REPORT_COLUMNS, type StoredReport } from "./render";

/**
 * Whether this console user may open a bespoke report (BESPOKE-REPORTS.md):
 * it was built for their company, the package still has bespoke reports, it
 * hasn't been taken down, and — when a manager keeps it to managers — they
 * are one. Read through the service role and checked here, because the rows
 * a report shows are read that way too.
 */
export async function reportForConsole(context: UserContext, id: string): Promise<StoredReport | null> {
  if (!context.organisationId || !(await hasFeature(context, "reports.bespoke"))) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("bespoke_reports")
    .select(REPORT_COLUMNS)
    .eq("id", id)
    .eq("organisation_id", context.organisationId)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  const report = data as StoredReport;
  if (report.managers_only && context.role !== "org_admin") return null;
  return report;
}

/** The reports a console user can see, newest first. */
export async function reportsForConsole(context: UserContext): Promise<{ id: string; title: string; description: string | null; managers_only: boolean; updated_at: string }[]> {
  if (!context.organisationId || !(await hasFeature(context, "reports.bespoke"))) return [];
  const admin = createAdminClient();
  let q = admin
    .from("bespoke_reports")
    .select("id, title, description, managers_only, updated_at")
    .eq("organisation_id", context.organisationId)
    .is("archived_at", null)
    .order("title")
    .limit(500);
  if (context.role !== "org_admin") q = q.eq("managers_only", false);
  const { data } = await q;
  return (data ?? []) as { id: string; title: string; description: string | null; managers_only: boolean; updated_at: string }[];
}
