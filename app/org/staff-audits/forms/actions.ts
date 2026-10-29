"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole, type UserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import { COMPETENCY_FORMS, areaKeyFor, readQuestions } from "@/lib/audit-forms";
import type { SaveState } from "@/app/platform/actions";

/**
 * A company's own Staff Audits forms (STAFF-AUDITS.md, Editable): the
 * questions, a skill's criteria, its own skills, and each due period.
 * Records already made keep the wording they were asked with, so a change
 * here only affects the next one. Managers and office staff both edit them —
 * only the Account page, billing and console access are manager-only.
 */

const KINDS = ["supervision", "appraisal", "spot_check", "competency"] as const;
type Kind = (typeof KINDS)[number];
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

async function gate(kind: Kind): Promise<UserContext | null> {
  const context = await requireConsole();
  const feature = kind === "supervision" || kind === "appraisal" ? "people.supervisions" : "people.competency";
  return (await hasFeature(context, feature)) ? context : null;
}

function parse(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(str(fd, key) || "null");
  } catch {
    return null;
  }
}

function done() {
  revalidatePath("/org/staff-audits/forms");
  redirect("/org/staff-audits/forms");
}

export async function saveAuditFormAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const kind = str(formData, "kind") as Kind;
  if (!KINDS.includes(kind)) return { ok: false, error: "Which form is this?" };
  const context = await gate(kind);
  if (!context) return { ok: false, error: "This is not included in your plan." };

  let areaKey = kind === "competency" ? str(formData, "areaKey") : "";
  const label = str(formData, "label").slice(0, 80);
  const dueEvery = parseInt(str(formData, "dueEvery"), 10);
  const dueUnit = str(formData, "dueUnit");
  if (!(dueEvery >= 1 && dueEvery <= 104)) return { ok: false, error: "Say how often it falls due: between 1 and 104." };
  if (dueUnit !== "weeks" && dueUnit !== "months") return { ok: false, error: "Weeks or months?" };
  const questions = readQuestions(parse(formData, "questions"));
  if (!questions.ok) return { ok: false, error: questions.error };
  const self = kind === "appraisal" ? readQuestions(parse(formData, "selfAssessment"), { allowEmpty: true }) : { ok: true as const, questions: [] };
  if (!self.ok) return { ok: false, error: self.error };
  if (kind === "competency" && !label) return { ok: false, error: "Give the skill a name." };

  const supabase = await createClient();
  if (kind === "competency" && !areaKey) {
    // A new skill of the company's own.
    const { data: rows } = await supabase
      .from("staff_audit_forms")
      .select("area_key")
      .eq("organisation_id", context.organisationId!)
      .eq("kind", "competency");
    areaKey = areaKeyFor(label, [...COMPETENCY_FORMS.map((f) => f.key), ...(rows ?? []).map((r) => r.area_key as string)]);
  }

  const { error } = await supabase.from("staff_audit_forms").upsert(
    {
      organisation_id: context.organisationId,
      kind,
      area_key: areaKey,
      label: kind === "competency" ? label : null,
      questions: questions.questions,
      self_assessment: self.questions,
      due_every: dueEvery,
      due_unit: dueUnit,
      archived: false,
      updated_by: context.userId,
    },
    { onConflict: "organisation_id,kind,area_key" },
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "audit_form.saved", entity: "staff_audit_form", entityId: `${kind}:${areaKey}`, detail: { questions: questions.questions.length, dueEvery, dueUnit } });
  done();
  return { ok: true };
}

/** Back to our default — or, for a company's own skill, nothing to go back to: it is removed. */
export async function resetAuditFormAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const kind = str(formData, "kind") as Kind;
  if (!KINDS.includes(kind)) return { ok: false, error: "Which form is this?" };
  const context = await gate(kind);
  if (!context) return { ok: false, error: "This is not included in your plan." };
  const areaKey = kind === "competency" ? str(formData, "areaKey") : "";
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_audit_forms")
    .delete()
    .eq("organisation_id", context.organisationId!)
    .eq("kind", kind)
    .eq("area_key", areaKey);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "audit_form.reset", entity: "staff_audit_form", entityId: `${kind}:${areaKey}` });
  done();
  return { ok: true };
}

/**
 * Stop assessing a skill. Kept rather than deleted, so assessments already
 * made still read with its name; it comes back with Assess again.
 */
export async function setSkillArchivedAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate("competency");
  if (!context) return { ok: false, error: "This is not included in your plan." };
  const areaKey = str(formData, "areaKey");
  const archived = formData.get("archived") === "1";
  const supabase = await createClient();
  // Its row, if the company has changed or stopped it before: just flip it,
  // keeping whatever wording it had.
  const { data: updated, error } = await supabase
    .from("staff_audit_forms")
    .update({ archived, updated_by: context.userId })
    .eq("organisation_id", context.organisationId!)
    .eq("kind", "competency")
    .eq("area_key", areaKey)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const ours = COMPETENCY_FORMS.find((f) => f.key === areaKey);
  if (!updated?.length && archived && ours) {
    // One of ours, unchanged until now: stopping it needs a row to say so.
    const { error: insertError } = await supabase.from("staff_audit_forms").insert({
      organisation_id: context.organisationId,
      kind: "competency",
      area_key: areaKey,
      label: ours.label,
      questions: ours.items,
      due_every: ours.due.every,
      due_unit: ours.due.unit,
      archived: true,
      updated_by: context.userId,
    });
    if (insertError) return { ok: false, error: insertError.message };
  }
  await logAudit({ context, action: archived ? "audit_form.skill_stopped" : "audit_form.skill_restored", entity: "staff_audit_form", entityId: `competency:${areaKey}` });
  done();
  return { ok: true };
}
