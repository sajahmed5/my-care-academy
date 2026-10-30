"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { pruneAnswers, validateAnswers } from "@/lib/form-library";
import { discardFormFiles, storeFormFiles } from "@/lib/form-uploads";
import type { FormField } from "@/lib/forms";
import type { SubmitState } from "@/app/learn/forms/actions";
import type { SaveState } from "@/app/platform/actions";

/**
 * Add a line to a log: the date, who did it, (the client), and the answers
 * to the log's columns, validated like any form. The insert runs as the
 * person typing it; RLS holds it to the console, a package with forms, and
 * the company's own staff and clients.
 */
export async function addLogLineAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "forms.builder"))) return { ok: false, error: "Forms are not included in your package." };
  const orgId = context.organisationId!;

  const templateId = String(formData.get("templateId") ?? "");
  const entryDate = String(formData.get("entryDate") ?? "");
  const doneBy = String(formData.get("doneBy") ?? "") || null;
  const doneByName = String(formData.get("doneByName") ?? "").trim().slice(0, 120) || null;
  const clientId = String(formData.get("clientId") ?? "") || null;
  let answers: Record<string, unknown> = {};
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}"));
  } catch {
    return { ok: false, error: "The line could not be read. Try again." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return { ok: false, error: "Give the date." };
  if (entryDate > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) return { ok: false, error: "The date is in the future." };

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("form_templates")
    .select("id, code, title, audience, version, fields, is_log")
    .eq("id", templateId)
    .maybeSingle();
  if (!t || !t.is_log) return { ok: false, error: "That log is not in your library." };
  if (t.audience === "client" && !clientId) return { ok: false, error: "Choose the client." };

  const fields = (t.fields as FormField[]) ?? [];
  const admin = createAdminClient();
  const stored = await storeFormFiles(admin, formData, fields, answers, `${orgId}/logs/${t.id}/${crypto.randomUUID()}`);
  if (stored.error) return { ok: false, error: stored.error };
  const problems = validateAnswers(fields, answers);
  if (problems.length) {
    await discardFormFiles(admin, stored.uploaded);
    return { ok: false, error: "Some required answers are missing.", missing: problems.map((p) => p.label) };
  }

  const { data: created, error } = await supabase
    .from("form_log_entries")
    .insert({
      organisation_id: orgId,
      template_id: t.id,
      template_version: t.version,
      entry_date: entryDate,
      done_by: doneBy,
      done_by_name: doneBy ? null : doneByName,
      client_id: t.audience === "client" ? clientId : null,
      answers: pruneAnswers(fields, answers),
      recorded_by: context.userId,
    })
    .select("id")
    .single();
  if (error || !created) {
    await discardFormFiles(admin, stored.uploaded);
    return { ok: false, error: error?.message ?? "The line could not be saved." };
  }

  await logAudit({ context, action: "form_log.line_added", entity: "form_log_entry", entityId: created.id as string, detail: { log: t.code } });
  revalidatePath(`/org/forms/logs/${encodeURIComponent(t.code as string)}`);
  if (clientId) revalidatePath(`/org/clients/${clientId}`);
  return { ok: true };
}

/** Take back a line typed by mistake — your own, on the day (RLS enforces both). */
export async function deleteLogLineAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  const id = String(formData.get("entryId") ?? "");
  const code = String(formData.get("code") ?? "");
  const supabase = await createClient();
  const { error, count } = await supabase.from("form_log_entries").delete({ count: "exact" }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "Only the person who added a line can remove it, and only on the day." };
  await logAudit({ context, action: "form_log.line_removed", entity: "form_log_entry", entityId: id, detail: { log: code } });
  revalidatePath(`/org/forms/logs/${encodeURIComponent(code)}`);
  return { ok: true };
}
