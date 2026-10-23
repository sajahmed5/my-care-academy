"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { FIELD_TYPES, type FormField } from "@/lib/forms";
import { FORM_CATEGORIES } from "@/lib/form-library";
import type { SaveState } from "@/app/platform/actions";

/**
 * Authoring, by the platform only. form_templates_platform_admin is the gate.
 *
 * Saving fields bumps the version. A response records the version it was
 * given, so changing the questions after someone answered does not rewrite
 * what they were asked — it just means the next person gets the new form.
 */

const STATUSES = ["draft", "published", "retired"] as const;

export async function createFormTemplateAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState & { code?: string }> {
  const context = await requireRole("platform_admin");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  if (!title) return { ok: false, error: "Give the form a title." };
  if (!FORM_CATEGORIES.some((c) => c.value === category)) return { ok: false, error: "Pick a category." };

  const code = `MCA-FORM-${title.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const supabase = await createClient();
  const { error } = await supabase.from("form_templates").insert({ code, title, category, status: "draft" });
  if (error) return { ok: false, error: error.message };

  await logAudit({ context, action: "form_template.created", entity: "form_template", detail: { code, title } });
  revalidatePath("/platform/forms");
  return { ok: true, code };
}

export async function saveFormTemplateAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const code = String(formData.get("code") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "other");
  const pack = String(formData.get("pack") ?? "full");
  if (!code) return { ok: false, error: "No form given." };
  if (!title) return { ok: false, error: "Give the form a title." };
  if (!FORM_CATEGORIES.some((c) => c.value === category)) return { ok: false, error: "Pick a category." };
  if (!["basic", "full", "addon"].includes(pack)) return { ok: false, error: "Pick a pack." };

  let fields: FormField[];
  try {
    const raw = JSON.parse(String(formData.get("fields") ?? "[]")) as Partial<FormField>[];
    const validTypes = new Set(FIELD_TYPES.map((t) => t.value));
    fields = raw
      .filter((f) => f && typeof f.label === "string" && f.label.trim())
      .map((f, i) => ({
        id: typeof f.id === "string" && f.id ? f.id : randomUUID(),
        label: (f.label as string).trim(),
        type: validTypes.has(f.type as FormField["type"]) ? (f.type as FormField["type"]) : "text",
        options: Array.isArray(f.options) ? f.options.map(String).filter(Boolean) : [],
        required: !!f.required,
        conditional:
          f.conditional && typeof f.conditional.whenFieldId === "string" && f.conditional.whenFieldId
            ? { whenFieldId: f.conditional.whenFieldId, equals: String(f.conditional.equals ?? "") }
            : null,
        sort_order: i,
      }));
  } catch {
    return { ok: false, error: "The fields could not be read." };
  }

  const supabase = await createClient();
  const { data: current } = await supabase.from("form_templates").select("version, fields").eq("code", code).maybeSingle();
  if (!current) return { ok: false, error: "That form is no longer there." };
  const changed = JSON.stringify(current.fields) !== JSON.stringify(fields);

  const { error } = await supabase
    .from("form_templates")
    .update({
      title,
      description: description || null,
      category,
      pack,
      fields,
      version: changed ? (current.version as number) + 1 : (current.version as number),
    })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };

  await logAudit({ context, action: "form_template.saved", entity: "form_template", detail: { code, fields: fields.length, versionBumped: changed } });
  revalidatePath("/platform/forms");
  revalidatePath(`/platform/forms/${code}`);
  revalidatePath("/org/forms");
  return { ok: true };
}

export async function setFormStatusAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const context = await requireRole("platform_admin");
  const code = String(formData.get("code") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!code) return { ok: false, error: "No form given." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return { ok: false, error: "Unknown status." };

  const supabase = await createClient();
  const { error, count } = await supabase.from("form_templates").update({ status }, { count: "exact" }).eq("code", code);
  if (error) return { ok: false, error: error.message };
  if (count === 0) return { ok: false, error: "That form is no longer there." };

  await logAudit({ context, action: "form_template.status", entity: "form_template", detail: { code, status } });
  revalidatePath("/platform/forms");
  revalidatePath(`/platform/forms/${code}`);
  revalidatePath("/org/forms");
  return { ok: true };
}
