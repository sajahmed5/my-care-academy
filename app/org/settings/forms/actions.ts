"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { cleanFields } from "@/lib/forms";
import { FORM_AUDIENCES, FORM_CATEGORIES } from "@/lib/form-library";
import type { SaveState } from "@/app/platform/actions";

/**
 * Setting up a company's forms (FORMS.md, "Editable"): which of ours are
 * switched on, their review periods, a company's own copy of one of ours,
 * and forms it builds itself. Manager-only (AGENTS.md: an add-on's own forms
 * are Settings); RLS holds every write to the company's own rows.
 */

async function manager() {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "forms.builder"))) redirect("/org/settings");
  return context;
}

function done() {
  revalidatePath("/org/settings/forms");
  revalidatePath("/org/forms");
}

const ownCode = () => `ORG-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

/** Switch one of our forms on or off for this company. Nothing filled in is touched. */
export async function setFormHiddenAction(formData: FormData): Promise<void> {
  const context = await manager();
  const templateId = String(formData.get("templateId") ?? "");
  const hidden = String(formData.get("hidden") ?? "") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("organisation_form_settings").upsert(
    { organisation_id: context.organisationId, template_id: templateId, hidden, updated_by: context.userId, updated_at: new Date().toISOString() },
    { onConflict: "organisation_id,template_id" },
  );
  if (!error) await logAudit({ context, action: hidden ? "form.switched_off" : "form.switched_on", entity: "form_template", entityId: templateId });
  done();
}

/** This company's review period for one of our forms; blank goes back to ours. */
export async function setReviewMonthsAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await manager();
  const templateId = String(formData.get("templateId") ?? "");
  const raw = String(formData.get("reviewMonths") ?? "").trim();
  const months = raw ? Number(raw) : null;
  if (months !== null && !(Number.isInteger(months) && months >= 1 && months <= 60)) {
    return { ok: false, error: "A whole number of months, 1 to 60." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("organisation_form_settings").upsert(
    { organisation_id: context.organisationId, template_id: templateId, review_months: months, updated_by: context.userId, updated_at: new Date().toISOString() },
    { onConflict: "organisation_id,template_id" },
  );
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "form.review_period", entity: "form_template", entityId: templateId, detail: { months } });
  done();
  return { ok: true };
}

/**
 * Make the company's own copy of one of our forms, as a draft to edit. It
 * takes the original's place in the company's list once it is published.
 * A copy that already exists is opened instead.
 */
export async function copyLibraryFormAction(formData: FormData): Promise<void> {
  const context = await manager();
  const templateId = String(formData.get("templateId") ?? "");
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("form_templates")
    .select("code")
    .eq("organisation_id", context.organisationId!)
    .eq("based_on_id", templateId)
    .maybeSingle();
  if (existing) redirect(`/org/settings/forms/${encodeURIComponent(existing.code as string)}`);

  const { data: source } = await supabase
    .from("form_templates")
    .select("id, title, description, category, audience, review_months, is_log, log_person_label, fields, version, organisation_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!source || source.organisation_id) redirect("/org/settings/forms");

  const code = ownCode();
  const { error } = await supabase.from("form_templates").insert({
    code,
    title: source.title,
    description: source.description,
    category: source.category,
    pack: "full",
    audience: source.audience,
    review_months: source.review_months,
    is_log: source.is_log,
    log_person_label: source.log_person_label,
    fields: source.fields,
    organisation_id: context.organisationId,
    based_on_id: source.id,
    based_on_version: source.version,
    created_by: context.userId,
    status: "draft",
  });
  if (error) redirect("/org/settings/forms");
  await logAudit({ context, action: "form.copied", entity: "form_template", entityId: source.id as string, detail: { code } });
  done();
  redirect(`/org/settings/forms/${code}`);
}

/** Start a form of the company's own, from nothing, as a draft. */
export async function createOwnFormAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await manager();
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const audience = String(formData.get("audience") ?? "");
  const isLog = audience === "log";
  if (!title) return { ok: false, error: "Give the form a name." };
  if (!isLog && !FORM_AUDIENCES.some((a) => a.value === audience)) return { ok: false, error: "Say who the form is about." };
  const code = ownCode();
  const supabase = await createClient();
  const { error } = await supabase.from("form_templates").insert({
    code,
    title,
    category: "other",
    pack: "full",
    audience: isLog ? "company" : audience,
    is_log: isLog,
    organisation_id: context.organisationId,
    created_by: context.userId,
    status: "draft",
  });
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "form.created_own", entity: "form_template", detail: { code, title } });
  done();
  redirect(`/org/settings/forms/${code}`);
}

/**
 * Save one of the company's own forms. Changing the questions bumps its
 * version, so anything already filled in keeps the questions it was asked.
 */
export async function saveOwnFormAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await manager();
  const code = String(formData.get("code") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const description = String(formData.get("description") ?? "").trim().slice(0, 300);
  const category = String(formData.get("category") ?? "other");
  const audience = String(formData.get("audience") ?? "carer");
  const reviewRaw = String(formData.get("reviewMonths") ?? "").trim();
  const reviewMonths = reviewRaw ? Number(reviewRaw) : null;
  const isLog = String(formData.get("isLog") ?? "") === "1";
  const personLabel = String(formData.get("personLabel") ?? "").trim().slice(0, 40) || null;
  if (!title) return { ok: false, error: "Give the form a name." };
  if (!FORM_CATEGORIES.some((c) => c.value === category)) return { ok: false, error: "Pick a category." };
  if (!FORM_AUDIENCES.some((a) => a.value === audience)) return { ok: false, error: "Say who the form is about." };
  if (isLog && audience === "carer") return { ok: false, error: "A log is about the company or a client." };
  if (reviewMonths !== null && !(Number.isInteger(reviewMonths) && reviewMonths >= 1 && reviewMonths <= 60)) {
    return { ok: false, error: "A review period is a whole number of months, 1 to 60." };
  }
  let fields;
  try {
    fields = cleanFields(JSON.parse(String(formData.get("fields") ?? "[]")));
  } catch {
    return { ok: false, error: "The questions could not be read." };
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("form_templates")
    .select("id, version, fields")
    .eq("code", code)
    .eq("organisation_id", context.organisationId!)
    .maybeSingle();
  if (!current) return { ok: false, error: "That form is no longer there." };
  const changed = JSON.stringify(current.fields) !== JSON.stringify(fields);
  const { error } = await supabase
    .from("form_templates")
    .update({
      title,
      description: description || null,
      category,
      audience,
      review_months: isLog ? null : reviewMonths,
      is_log: isLog,
      log_person_label: isLog ? personLabel : null,
      fields,
      version: changed ? (current.version as number) + 1 : (current.version as number),
    })
    .eq("id", current.id as string);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "form.saved_own", entity: "form_template", entityId: current.id as string, detail: { code, fields: fields.length, versionBumped: changed } });
  done();
  revalidatePath(`/org/settings/forms/${code}`);
  return { ok: true };
}

/** Put one of the company's own forms into use, back to draft, or retire it. */
export async function setOwnFormStatusAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await manager();
  const code = String(formData.get("code") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["draft", "published", "retired"].includes(status)) return { ok: false, error: "Unknown status." };
  const supabase = await createClient();
  if (status === "published") {
    const { data: t } = await supabase.from("form_templates").select("fields").eq("code", code).maybeSingle();
    if (!t || !Array.isArray(t.fields) || t.fields.length === 0) return { ok: false, error: "Add a question before putting it into use." };
  }
  const { error, count } = await supabase
    .from("form_templates")
    .update({ status }, { count: "exact" })
    .eq("code", code)
    .eq("organisation_id", context.organisationId!);
  if (error) return { ok: false, error: error.message };
  if (!count) return { ok: false, error: "That form is no longer there." };
  await logAudit({ context, action: "form.status_own", entity: "form_template", detail: { code, status } });
  done();
  revalidatePath(`/org/settings/forms/${code}`);
  return { ok: true };
}
