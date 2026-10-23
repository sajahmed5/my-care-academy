"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, getUserContext, type UserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { FORM_TEMPLATES, type FieldType, type Conditional } from "@/lib/forms";
import { hasFeatureForOrg, requireFeature } from "@/lib/entitlements";

/** Forms is a paid add-on; block if the org isn't entitled. */
async function assertForms(context: UserContext): Promise<void> {
  await requireFeature(context, "forms.builder");
}

export async function createFormAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const context = await requireRole("org_admin");
  await assertForms(context);

  const title = String(formData.get("title") ?? "").trim();
  const templateKey = String(formData.get("template") ?? "");
  const template = FORM_TEMPLATES.find((t) => t.key === templateKey);

  const supabase = await createClient();
  const { data: form, error } = await supabase
    .from("forms")
    .insert({
      organisation_id: context.organisationId,
      title: title || template?.title || "Untitled form",
      description: template?.description ?? null,
    })
    .select("id")
    .single();
  if (error || !form) return { error: error?.message ?? "Could not create form." };

  if (template) {
    const rows = template.fields.map((f, i) => ({
      form_id: form.id,
      organisation_id: context.organisationId,
      label: f.label,
      type: f.type,
      options: f.options ?? [],
      required: !!f.required,
      sort_order: i,
    }));
    const { data: inserted } = await supabase
      .from("form_fields")
      .insert(rows)
      .select("id, label");
    const byLabel = new Map((inserted ?? []).map((r) => [r.label, r.id]));
    for (const f of template.fields) {
      if (f.conditionalOn) {
        const fid = byLabel.get(f.label);
        const whenId = byLabel.get(f.conditionalOn.label);
        if (fid && whenId) {
          await supabase
            .from("form_fields")
            .update({
              conditional: { whenFieldId: whenId, equals: f.conditionalOn.equals },
            })
            .eq("id", fid);
        }
      }
    }
  }

  redirect(`/org/forms/${form.id}`);
}

export async function updateFormAction(
  formId: string,
  patch: { title?: string; status?: string },
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  await assertForms(context);
  const supabase = await createClient();
  const { error } = await supabase.from("forms").update(patch).eq("id", formId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/forms/${formId}`);
  revalidatePath("/org/forms");
  return { ok: true };
}

export async function deleteFormAction(formId: string): Promise<void> {
  const context = await requireRole("org_admin");
  await assertForms(context);
  const supabase = await createClient();
  await supabase.from("forms").delete().eq("id", formId);
  redirect("/org/forms");
}

export interface FieldInput {
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
  conditional: Conditional | null;
}

export async function addFieldAction(
  formId: string,
  input: FieldInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const context = await requireRole("org_admin");
  await assertForms(context);
  if (!input.label.trim()) return { ok: false, error: "Label is required." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("form_fields")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId);

  const { data, error } = await supabase
    .from("form_fields")
    .insert({
      form_id: formId,
      organisation_id: context.organisationId,
      label: input.label.trim(),
      type: input.type,
      options: input.options,
      required: input.required,
      conditional: input.conditional,
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/forms/${formId}`);
  return { ok: true, id: data.id };
}

export async function updateFieldAction(
  fieldId: string,
  formId: string,
  input: FieldInput,
): Promise<{ ok: boolean; error?: string }> {
  const context = await requireRole("org_admin");
  await assertForms(context);
  const supabase = await createClient();
  const { error } = await supabase
    .from("form_fields")
    .update({
      label: input.label.trim(),
      type: input.type,
      options: input.options,
      required: input.required,
      conditional: input.conditional,
    })
    .eq("id", fieldId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/org/forms/${formId}`);
  return { ok: true };
}

export async function deleteFieldAction(
  fieldId: string,
  formId: string,
): Promise<{ ok: boolean }> {
  const context = await requireRole("org_admin");
  await assertForms(context);
  const supabase = await createClient();
  await supabase.from("form_fields").delete().eq("id", fieldId);
  revalidatePath(`/org/forms/${formId}`);
  return { ok: true };
}

/** Submit a filled form. Files arrive as base64 and are stored via the service role. */
export async function submitFormAction(
  formId: string,
  values: Record<string, unknown>,
  files: Record<string, { name: string; dataUrl: string }>,
): Promise<{ ok: boolean; error?: string }> {
  const context = await getUserContext();
  if (!context || context.role === "platform_admin" || !context.organisationId) {
    return { ok: false, error: "Not permitted." };
  }

  const admin = createAdminClient();

  // Confirm the form belongs to the caller's org and the feature is on. This
  // runs as the service role, so RLS is not doing the entitlement check here —
  // ask for the form's organisation explicitly.
  const { data: form } = await admin
    .from("forms")
    .select("id, title, organisation_id")
    .eq("id", formId)
    .maybeSingle();
  if (
    !form ||
    form.organisation_id !== context.organisationId ||
    !(await hasFeatureForOrg(admin, form.organisation_id, "forms.builder"))
  ) {
    return { ok: false, error: "Form not available." };
  }

  // Upload any files, replacing their value with a storage path.
  const data: Record<string, unknown> = { ...values };
  for (const [fieldId, file] of Object.entries(files)) {
    const base64 = file.dataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(base64, "base64");
    const path = `${context.organisationId}/${formId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await admin.storage
      .from("form-uploads")
      .upload(path, buffer, { upsert: true });
    if (!upErr) data[fieldId] = { file: path, name: file.name };
  }

  const { error } = await admin.from("form_submissions").insert({
    form_id: formId,
    organisation_id: context.organisationId,
    submitted_by: context.userId,
    data,
  });
  if (error) return { ok: false, error: error.message };

  // Notify org admins.
  const { data: admins } = await admin
    .from("users")
    .select("email")
    .eq("organisation_id", context.organisationId)
    .eq("role", "org_admin")
    .eq("status", "active");
  for (const a of admins ?? []) {
    const sent = await sendEmail({
      to: a.email,
      subject: `New submission: ${form.title}`,
      html: `<p>A new submission was received for <strong>${form.title}</strong>.</p>`,
    });
    await admin.from("email_log").insert({
      organisation_id: context.organisationId,
      to_email: a.email,
      type: "form_submission",
      subject: `New submission: ${form.title}`,
      sent,
    });
  }

  return { ok: true };
}

/** Signed URL to view an uploaded submission file (org_admin only). */
export async function getSubmissionFileUrlAction(
  path: string,
): Promise<{ url?: string }> {
  const context = await requireRole("org_admin");
  if (!path.startsWith(`${context.organisationId}/`)) return {};
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from("form-uploads")
    .createSignedUrl(path, 60);
  return { url: data?.signedUrl };
}
