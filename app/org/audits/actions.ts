"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { auditFindings, auditKind, auditScore, unanswered, type AuditAnswer } from "@/lib/audits";
import type { SaveState } from "@/app/platform/actions";

/**
 * Save an audit (ROADMAP §4). Every question must be answered; each "no" that
 * is given an owner becomes an action in that person's task list, dated, the
 * same as an action agreed at a supervision or a spot check.
 */
export async function saveAuditAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "quality.audits"))) return { ok: false, error: "Audits are not included in your plan." };
  const kind = auditKind(String(formData.get("kind") ?? ""));
  if (!kind) return { ok: false, error: "Pick which audit this is." };
  const heldOn = String(formData.get("heldOn") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) return { ok: false, error: "Say when it was carried out." };
  const nextDue = String(formData.get("nextDue") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const answers: Record<string, AuditAnswer> = {};
  for (const q of kind.questions) {
    const a = String(formData.get(`q_${q.id}`) ?? "");
    if (a === "yes" || a === "no" || a === "na") answers[q.id] = a;
  }
  const missing = unanswered(kind, answers);
  if (missing.length) return { ok: false, error: `Answer every question — ${missing.length} still to answer.` };

  const supabase = await createClient();
  const { data: audit, error } = await supabase
    .from("audits")
    .insert({
      organisation_id: context.organisationId,
      kind: kind.key,
      subject: subject || null,
      held_on: heldOn,
      auditor_id: context.userId,
      answers,
      score: auditScore(answers),
      notes: notes || null,
      next_due: /^\d{4}-\d{2}-\d{2}$/.test(nextDue) ? nextDue : null,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // A finding with an owner becomes an action; one without stays a finding on the audit.
  const actions = auditFindings(kind, answers).flatMap((f) => {
    const owner = String(formData.get(`owner_${f.id}`) ?? "");
    const due = String(formData.get(`due_${f.id}`) ?? "");
    if (!owner) return [];
    return [
      {
        organisation_id: context.organisationId,
        user_id: owner,
        title: `${kind.label}: ${f.text}`.slice(0, 200),
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
        source_type: "audit",
        source_id: audit.id,
        created_by: context.userId,
      },
    ];
  });
  if (actions.length) {
    const { error: actError } = await supabase.from("record_actions").insert(actions);
    if (actError) return { ok: false, error: `The audit saved, but its actions did not: ${actError.message}` };
  }

  await logAudit({
    context,
    action: "audit.recorded",
    entity: "audit",
    entityId: audit.id as string,
    detail: { kind: kind.key, score: auditScore(answers), findings: auditFindings(kind, answers).length, actions: actions.length },
  });
  revalidatePath("/org/audits");
  revalidatePath("/org/due/audits");
  redirect(`/org/audits/${audit.id}`);
}
