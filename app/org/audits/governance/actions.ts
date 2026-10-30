"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { askClaudeJson } from "@/lib/ai";
import { GOVERNANCE_SUMMARY_SCHEMA, governancePrompt, monthRange } from "@/lib/governance";
import type { SaveState } from "@/app/platform/actions";
import { governanceFor } from "./load";

/**
 * The governance report's summary (SERVICE-AUDITS.md): the one part a person
 * writes. AI can draft it from the month's figures — never names — when the
 * company has switched AI on; it is billed at 1.5 times cost (lib/ai.ts) and a
 * person always reads and edits it before saving.
 */

const NOT_IN_PLAN = "The governance report is not included in your plan.";

export async function draftGovernanceSummaryAction(month: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "quality.audits"))) return { ok: false, error: NOT_IN_PLAN };
  const range = monthRange(month);
  if (!range) return { ok: false, error: "Pick a month." };
  const report = await governanceFor(context, range);
  const r = await askClaudeJson<{ paragraphs: string[] }>({
    orgId: context.organisationId!,
    userId: context.userId,
    feature: "governance_summary",
    prompt: governancePrompt(report),
    schema: GOVERNANCE_SUMMARY_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2000,
  });
  if (!r.ok) return r;
  const text = (r.data.paragraphs ?? []).map((p) => String(p).trim()).filter(Boolean).join("\n\n");
  if (!text) return { ok: false, error: "The draft came back empty. Try again, or write it yourself." };
  await logAudit({ context, action: "governance.summary_drafted_ai", entity: "organisation", entityId: context.organisationId!, detail: { month } });
  return { ok: true, text };
}

export async function saveGovernanceSummaryAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "quality.audits"))) return { ok: false, error: NOT_IN_PLAN };
  const range = monthRange(String(formData.get("month") ?? ""));
  if (!range) return { ok: false, error: "Pick a month." };
  const summary = String(formData.get("summary") ?? "").trim();
  if (summary.length > 8000) return { ok: false, error: "Keep the summary under 8,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("governance_reports").upsert(
    {
      organisation_id: context.organisationId,
      month: range.start,
      summary,
      ai_drafted: formData.get("aiDrafted") === "1",
      updated_by: context.userId,
    },
    { onConflict: "organisation_id,month" },
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "governance.summary_saved", entity: "organisation", entityId: context.organisationId!, detail: { month: range.month } });
  revalidatePath("/org/audits/governance");
  return { ok: true };
}
