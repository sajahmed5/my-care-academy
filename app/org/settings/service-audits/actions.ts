"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, type UserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { hasFeature } from "@/lib/entitlements";
import { DEFAULT_SERVICE_FORMS, ownAuditKey, readServiceQuestions } from "@/lib/service-audits";
import type { SaveState } from "@/app/platform/actions";

/**
 * A company's own service audits (SERVICE-AUDITS.md, Editable): each audit's
 * questions and due period, its own audits, and the level below which an
 * audit waits for a manager. Audits already done keep the questions they
 * were asked with. Managers only: they sit under Settings (30 Oct 2026).
 */

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const KEY = /^[a-z0-9_]{1,60}$/;

async function gate(): Promise<UserContext | null> {
  const context = await requireRole("org_admin");
  return (await hasFeature(context, "quality.audits")) ? context : null;
}

function parse(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(str(fd, key) || "null");
  } catch {
    return null;
  }
}

function done() {
  revalidatePath("/org/settings/service-audits");
  revalidatePath("/org/audits");
  redirect("/org/settings/service-audits");
}

const NOT_IN_PLAN = "Service audits are not included in your plan.";

export async function saveServiceFormAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  let key = str(formData, "key");
  const ours = DEFAULT_SERVICE_FORMS.find((d) => d.key === key);
  const label = str(formData, "label").slice(0, 80);
  const dueEvery = parseInt(str(formData, "dueEvery"), 10);
  const dueUnit = str(formData, "dueUnit");
  if (key && !KEY.test(key)) return { ok: false, error: "Which audit is this?" };
  if (!label) return { ok: false, error: "Give the audit a name." };
  if (!(dueEvery >= 1 && dueEvery <= 104)) return { ok: false, error: "Say how often it falls due: between 1 and 104." };
  if (dueUnit !== "weeks" && dueUnit !== "months") return { ok: false, error: "Weeks or months?" };
  const questions = readServiceQuestions(parse(formData, "questions"));
  if (!questions.ok) return { ok: false, error: questions.error };

  const supabase = await createClient();
  // Ours keep their scope; a new one of the company's own takes the one chosen.
  let scope = ours?.scope ?? (str(formData, "scope") === "client" ? "client" : "service");
  if (!key) {
    const { data: rows } = await supabase.from("service_audit_forms").select("key").eq("organisation_id", context.organisationId!);
    key = ownAuditKey(label, [...DEFAULT_SERVICE_FORMS.map((d) => d.key), "client_qa", "staff_file", "training", ...(rows ?? []).map((r) => r.key as string)]);
  } else if (!ours) {
    // An existing own audit keeps the scope it was made with: its records are already client by client, or not.
    const { data: row } = await supabase.from("service_audit_forms").select("scope").eq("organisation_id", context.organisationId!).eq("key", key).maybeSingle();
    if (!row) return { ok: false, error: "That audit is no longer there." };
    scope = row.scope === "client" ? "client" : "service";
  }

  const { error } = await supabase.from("service_audit_forms").upsert(
    {
      organisation_id: context.organisationId,
      key,
      label,
      scope,
      questions: questions.questions,
      due_every: dueEvery,
      due_unit: dueUnit,
      archived: false,
      updated_by: context.userId,
    },
    { onConflict: "organisation_id,key" },
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "service_audit_form.saved", entity: "service_audit_form", entityId: key, detail: { questions: questions.questions.length, dueEvery, dueUnit } });
  done();
  return { ok: true };
}

/** Back to our default — or, for a company's own audit, removed. Audits already done keep their questions. */
export async function resetServiceFormAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const key = str(formData, "key");
  if (!KEY.test(key)) return { ok: false, error: "Which audit is this?" };
  const supabase = await createClient();
  const { error } = await supabase.from("service_audit_forms").delete().eq("organisation_id", context.organisationId!).eq("key", key);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "service_audit_form.reset", entity: "service_audit_form", entityId: key });
  done();
  return { ok: true };
}

/** Stop doing one of ours, or start again. Kept as a row, so audits done before still read as they did. */
export async function setServiceFormArchivedAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const key = str(formData, "key");
  const archived = formData.get("archived") === "1";
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("service_audit_forms")
    .update({ archived, updated_by: context.userId })
    .eq("organisation_id", context.organisationId!)
    .eq("key", key)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const ours = DEFAULT_SERVICE_FORMS.find((d) => d.key === key);
  if (!updated?.length && archived && ours) {
    const { error: insertError } = await supabase.from("service_audit_forms").insert({
      organisation_id: context.organisationId,
      key,
      label: ours.label,
      scope: ours.scope,
      questions: ours.questions,
      due_every: ours.due.every,
      due_unit: ours.due.unit,
      archived: true,
      updated_by: context.userId,
    });
    if (insertError) return { ok: false, error: insertError.message };
  }
  await logAudit({ context, action: archived ? "service_audit_form.stopped" : "service_audit_form.restored", entity: "service_audit_form", entityId: key });
  done();
  return { ok: true };
}

/** The score below which an audit or QA waits for a manager to review it. */
export async function saveReviewLevelAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await gate();
  if (!context) return { ok: false, error: NOT_IN_PLAN };
  const level = parseInt(str(formData, "reviewBelow"), 10);
  if (!(level >= 0 && level <= 100)) return { ok: false, error: "Give a percentage between 0 and 100." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_audit_settings")
    .upsert({ organisation_id: context.organisationId, review_below: level, updated_by: context.userId }, { onConflict: "organisation_id" });
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "service_audit.review_level", entity: "organisation", entityId: context.organisationId!, detail: { level } });
  revalidatePath("/org/settings/service-audits");
  return { ok: true };
}
