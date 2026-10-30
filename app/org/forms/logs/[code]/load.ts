import type { UserContext } from "@/lib/auth";
import { enabledMap, hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { loadFormTemplate, visibleFormPacks, type FormTemplateRecord } from "@/lib/form-library";
import { loadLogEntries, type LogEntry } from "@/lib/form-logs";

/** A log and its lines for a download: the same checks as the page, the same date range. */
export async function loadLogForDownload(
  context: UserContext,
  rawCode: string,
  url: URL,
): Promise<{ template: FormTemplateRecord; entries: LogEntry[]; from: string | null; to: string | null; organisationName: string } | null> {
  if (!context.organisationId || !(await hasFeature(context, "forms.builder"))) return null;
  const supabase = await createClient();
  const [enabled, template, { data: org }] = await Promise.all([
    enabledMap(context),
    loadFormTemplate(supabase, decodeURIComponent(rawCode)),
    supabase.from("organisations").select("name").eq("id", context.organisationId).maybeSingle(),
  ]);
  if (!template || !template.is_log) return null;
  const { packs, collections } = visibleFormPacks(enabled);
  if (!packs.includes(template.pack) || (template.pack === "addon" && !collections.includes(template.collection ?? ""))) return null;
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = date(url.searchParams.get("from"));
  const to = date(url.searchParams.get("to"));
  const entries = await loadLogEntries(supabase, { organisationId: context.organisationId, templateId: template.id, from, to, limit: 5000 });
  return { template, entries, from, to, organisationName: (org?.name as string) ?? "This organisation" };
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
