"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireConsole, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { managerSignature } from "@/lib/supervisions";
import { itemFindings, itemsTally, needsReview, readItems, serviceForm, type AuditItem } from "@/lib/service-audits";
import { autoFindings, autoTally, combinedScore } from "@/lib/auto-audits";
import { loadAutoSnapshot } from "@/lib/auto-audits-data";
import { loadReviewBelow, loadServiceForms } from "@/lib/service-audits-data";
import type { SaveState } from "@/app/platform/actions";

/**
 * Service audits (SERVICE-AUDITS.md). Carried out by managers and office,
 * often on a phone in a client's home; signed off by the auditor. Each "No"
 * (or a rating of 2 or under) that is given an owner becomes an action in
 * that person's task list, dated, as before. One scoring below the
 * company's level waits for a manager to review it.
 */

const NOT_IN_PLAN = "Audits are not included in your plan.";
const PHOTO_BUCKET = "service-audit-photos";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PHOTO = 3 * 1024 * 1024;
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function json(fd: FormData, key: string): unknown {
  try {
    return JSON.parse(str(fd, key) || "null");
  } catch {
    return null;
  }
}

export async function saveServiceAuditAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "quality.audits"))) return { ok: false, error: NOT_IN_PLAN };
  const orgId = context.organisationId!;
  const [forms, reviewBelow] = await Promise.all([loadServiceForms(orgId), loadReviewBelow(orgId)]);
  const form = serviceForm(forms, str(formData, "form"));
  if (!form) return { ok: false, error: "Pick which audit this is." };
  const heldOn = str(formData, "heldOn");
  if (!ISO_DATE.test(heldOn)) return { ok: false, error: "Say when it was carried out." };
  if (heldOn > new Date().toISOString().slice(0, 10)) return { ok: false, error: "It can't have been carried out in the future." };
  const nextDue = str(formData, "nextDue");
  const notes = str(formData, "notes");
  if (notes.length > 5000) return { ok: false, error: "Keep the notes under 5,000 characters." };
  const clientId = str(formData, "clientId");
  if (form.scope === "client" && !clientId) return { ok: false, error: "Pick the client this audit is about." };

  const read = readItems(form.questions, json(formData, "items"));
  if (!read.ok) return { ok: false, error: read.error };
  const items: AuditItem[] = read.items;

  const photos = new Map<string, File>();
  for (const item of items) {
    if (item.type !== "photo") continue;
    const file = formData.get(`photo_${item.id}`);
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return { ok: false, error: `"${item.label}" needs a photo, not another kind of file.` };
      if (file.size > MAX_PHOTO) return { ok: false, error: `The photo for "${item.label}" is too large. Take it again.` };
      photos.set(item.id, file);
    }
  }

  const signed = managerSignature({ signature: str(formData, "managerSignature"), name: str(formData, "managerSignedName"), now: new Date() });
  if (!signed.ok) return { ok: false, error: signed.error };

  const supabase = await createClient();
  let clientName: string | null = null;
  if (form.scope === "client") {
    const { data: client } = await supabase.from("clients").select("full_name").eq("id", clientId).eq("organisation_id", orgId).maybeSingle();
    if (!client) return { ok: false, error: "That client is not on your client list." };
    clientName = client.full_name as string;
  }

  // The staff file and training audits: what the site finds now, read again
  // here rather than trusted from the form, kept with the audit as it was.
  const auto = form.auto ? await loadAutoSnapshot(supabase, orgId, form.auto) : null;
  const people = autoFindings(auto);

  // Owners are their own staff: a form field is not a permission check.
  const owners = [
    ...new Set(
      [...itemFindings(items).map((f) => str(formData, `owner_${f.id}`)), ...people.map((p) => str(formData, `owner_person_${p.person.id}`))].filter(Boolean),
    ),
  ];
  if (owners.length) {
    const { data: staff } = await supabase.from("users").select("id").in("id", owners).eq("organisation_id", orgId);
    if ((staff ?? []).length !== owners.length) return { ok: false, error: "Pick action owners from your own staff." };
  }

  const score = combinedScore(autoTally(auto), itemsTally(items));
  const waiting = needsReview(score, reviewBelow);
  const { data: audit, error } = await supabase
    .from("audits")
    .insert({
      organisation_id: orgId,
      kind: form.key,
      title: form.label,
      subject: clientName,
      client_id: form.scope === "client" ? clientId : null,
      client_name: clientName,
      held_on: heldOn,
      auditor_id: context.userId,
      items,
      auto,
      score,
      notes: notes || null,
      next_due: ISO_DATE.test(nextDue) ? nextDue : null,
      auditor_signature: signed.fields.manager_signature,
      auditor_signed_name: signed.fields.manager_signed_name,
      auditor_signed_at: signed.fields.manager_signed_at,
      review_status: waiting ? "waiting" : "not_needed",
      review_below: reviewBelow,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const auditId = audit.id as string;

  // Photos are kept beside the audit, written as the service role once the
  // audit is known to be theirs (the insert above went through RLS).
  if (photos.size) {
    const admin = createAdminClient();
    for (const [id, file] of photos) {
      const path = `${orgId}/${auditId}/${id}.jpg`;
      const { error: upErr } = await admin.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: true });
      if (!upErr) items.find((i) => i.id === id)!.photo = path;
    }
    await supabase.from("audits").update({ items }).eq("id", auditId);
  }

  // A finding with an owner becomes an action; one without stays a finding on the audit.
  const action = (key: string, title: string) => {
    const owner = str(formData, `owner_${key}`);
    const due = str(formData, `due_${key}`);
    if (!owner) return [];
    return [
      {
        organisation_id: orgId,
        user_id: owner,
        title: title.slice(0, 200),
        due_date: ISO_DATE.test(due) ? due : null,
        source_type: "audit",
        source_id: auditId,
        created_by: context.userId,
      },
    ];
  };
  const actions = [
    ...itemFindings(items).flatMap((f) => action(f.id, `${form.label}${clientName ? ` (${clientName})` : ""}: ${f.label}`)),
    ...people.flatMap((p) => action(`person_${p.person.id}`, `${form.label}: ${p.person.name} — ${p.failing.join("; ")}`)),
  ];
  if (actions.length) {
    const { error: actError } = await supabase.from("record_actions").insert(actions);
    if (actError) return { ok: false, error: `The audit saved, but its actions did not: ${actError.message}` };
  }

  await logAudit({
    context,
    action: "audit.recorded",
    entity: "audit",
    entityId: auditId,
    detail: { kind: form.key, score, findings: itemFindings(items).length + people.length, actions: actions.length, waiting },
  });
  revalidatePath("/org/audits");
  revalidatePath("/org/due/audits");
  if (clientId) revalidatePath(`/org/clients/${clientId}`);
  redirect(`/org/audits/${auditId}`);
}

/** A manager has looked at an audit that scored below the company's level, and says so. */
export async function reviewAuditAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireRole("org_admin");
  if (!(await hasFeature(context, "quality.audits"))) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "id");
  const note = str(formData, "note");
  if (!note) return { ok: false, error: "Say what you found, and what happens next." };
  if (note.length > 3000) return { ok: false, error: "Keep it under 3,000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audits")
    .update({ review_status: "reviewed", reviewed_by: context.userId, reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", id)
    .eq("review_status", "waiting")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That audit isn't waiting for review." };
  await logAudit({ context, action: "audit.reviewed", entity: "audit", entityId: id });
  revalidatePath(`/org/audits/${id}`);
  revalidatePath("/org/audits");
  return { ok: true };
}
