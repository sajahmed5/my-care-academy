"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { hasFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { pruneAnswers, validateAnswers, type FormTemplateRecord } from "@/lib/form-library";
import { cleanSignatures, recordHref } from "@/lib/form-records";
import { cleanReviewDue } from "@/lib/form-reviews";
import { discardFormFiles, storeFormFiles } from "@/lib/form-uploads";
import type { FormField } from "@/lib/forms";
import type { SubmitState } from "@/app/learn/forms/actions";

/**
 * Fill in a client or company form (FORMS.md).
 *
 * The office's own record: the insert runs as the person filling it in, and
 * form_responses_own_insert holds it to their organisation, a console role,
 * a package with forms, and — for a client form — one of the organisation's
 * own clients. Answers are validated and pruned against the form's questions
 * exactly as a carer's are. Signatures drawn on the device are cleaned and
 * timed by the server.
 */
export async function submitFormRecordAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "forms.builder"))) return { ok: false, error: "Forms are not included in your package." };
  const orgId = context.organisationId!;

  const templateId = String(formData.get("templateId") ?? "");
  const clientId = String(formData.get("clientId") ?? "") || null;
  const reviewOfRaw = String(formData.get("reviewOf") ?? "") || null;
  const signedName = String(formData.get("signedName") ?? "").trim();
  let answers: Record<string, unknown> = {};
  let rawSignatures: unknown = [];
  try {
    answers = JSON.parse(String(formData.get("answers") ?? "{}"));
    rawSignatures = JSON.parse(String(formData.get("signatures") ?? "[]"));
  } catch {
    return { ok: false, error: "The answers could not be read. Try again." };
  }
  if (!templateId) return { ok: false, error: "No form given." };

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("form_templates")
    .select("id, code, title, audience, version, fields")
    .eq("id", templateId)
    .maybeSingle();
  if (!t) return { ok: false, error: "That form is not in your library." };
  const template = t as Pick<FormTemplateRecord, "id" | "code" | "title" | "audience" | "version" | "fields">;
  if (template.audience === "carer") return { ok: false, error: "A carer form is asked of a member of staff, not filled in here." };
  if (template.audience === "client" && !clientId) return { ok: false, error: "Choose the client this form is about." };
  if (template.audience === "company" && clientId) return { ok: false, error: "A company form is not about a client." };

  if (clientId) {
    const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (!client) return { ok: false, error: "That client is not on your list." };
  }

  // A review points back at the record it reviews — the same form, about the
  // same client (or the company). Anything else is simply not linked.
  let reviewOf: string | null = null;
  if (reviewOfRaw) {
    const { data: prev } = await supabase
      .from("form_responses")
      .select("id, template_id, client_id")
      .eq("id", reviewOfRaw)
      .maybeSingle();
    if (prev && prev.template_id === template.id && (prev.client_id ?? null) === clientId) reviewOf = prev.id as string;
  }

  const fields = (template.fields as FormField[]) ?? [];
  for (const f of fields) if (f.type === "signature" && signedName) answers[f.id] = signedName;

  const admin = createAdminClient();
  const stored = await storeFormFiles(admin, formData, fields, answers, `${orgId}/records/${template.id}/${crypto.randomUUID()}`);
  if (stored.error) return { ok: false, error: stored.error };

  const problems = validateAnswers(fields, answers);
  if (problems.length) {
    await discardFormFiles(admin, stored.uploaded);
    return { ok: false, error: "Some required answers are missing.", missing: problems.map((p) => p.label) };
  }

  const signatures = template.audience === "client" ? cleanSignatures(rawSignatures, new Date()) : [];
  const { data: created, error } = await supabase
    .from("form_responses")
    .insert({
      organisation_id: orgId,
      template_id: template.id,
      template_version: template.version,
      user_id: context.userId,
      subject: template.audience,
      client_id: clientId,
      answers: pruneAnswers(fields, answers),
      signed_name: signedName || null,
      signatures,
      review_due: cleanReviewDue(formData.get("reviewDue"), new Date()),
      review_of: reviewOf,
    })
    .select("id")
    .single();
  if (error || !created) {
    await discardFormFiles(admin, stored.uploaded);
    return { ok: false, error: error?.message ?? "It could not be saved." };
  }

  await logAudit({
    context,
    action: "form.recorded",
    entity: "form_response",
    entityId: created.id as string,
    detail: { template: template.code, version: template.version, subject: template.audience, clientId, signed: signatures.length, reviewOf },
  });

  revalidatePath("/org/forms");
  revalidatePath("/org/due/forms");
  revalidatePath(`/org/forms/library/${encodeURIComponent(template.code)}`);
  if (clientId) revalidatePath(`/org/clients/${clientId}`);
  return { ok: true, href: recordHref(created.id as string) };
}
