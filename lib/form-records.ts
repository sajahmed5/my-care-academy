/**
 * Completed forms read as records (FORMS.md): a client form on the client
 * page, a company form on its own, and any completed form — a carer's too —
 * opened by its id for reading back or as a PDF.
 *
 * A carer form answers an ask (form_assignments); a client or company form
 * has no ask behind it and is simply filled in by the office. Both are rows
 * in form_responses, told apart by `subject`.
 *
 * Pure except for the loaders.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormField } from "./forms";
import { audienceOf, type FormAudience, type FormTemplateRecord } from "./form-library";

/** Who signed on the device, beside the staff member's typed name. */
export const SIGNER_ROLES = [
  { value: "client", label: "The client" },
  { value: "family", label: "A family member" },
  { value: "representative", label: "A representative (power of attorney, advocate)" },
] as const;

export type SignerRole = (typeof SIGNER_ROLES)[number]["value"];

export interface DeviceSignature {
  role: SignerRole;
  name: string;
  /** For a family member or representative: "daughter", "LPA for health". */
  relationship: string | null;
  /** The drawn signature, a PNG data URL; null when they gave a typed name only. */
  image: string | null;
  signed_at: string;
}

export function signerLabel(s: Pick<DeviceSignature, "role" | "relationship">): string {
  if (s.role === "client") return "Client";
  const base = s.role === "family" ? "Family member" : "Representative";
  return s.relationship ? `${base} (${s.relationship})` : base;
}

/** A signature image is a small PNG; anything else, or anything huge, is dropped. */
const MAX_SIGNATURE_CHARS = 300_000;

/**
 * The signatures as sent by the form, kept only if they make sense: a known
 * role, a name, and — if there is a drawing — a PNG of a sane size. The time
 * is the server's, not the browser's.
 */
export function cleanSignatures(raw: unknown, now: Date): DeviceSignature[] {
  if (!Array.isArray(raw)) return [];
  const out: DeviceSignature[] = [];
  for (const r of raw.slice(0, 3)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const role = SIGNER_ROLES.find((x) => x.value === o.role)?.value;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!role || !name) continue;
    const image =
      typeof o.image === "string" && o.image.startsWith("data:image/png;base64,") && o.image.length <= MAX_SIGNATURE_CHARS
        ? o.image
        : null;
    const relationship =
      role !== "client" && typeof o.relationship === "string" && o.relationship.trim()
        ? o.relationship.trim().slice(0, 80)
        : null;
    out.push({ role, name, relationship, image, signed_at: now.toISOString() });
  }
  return out;
}

export interface FormRecord {
  id: string;
  template_id: string;
  template_code: string;
  template_title: string;
  template_version: number;
  subject: FormAudience;
  assignment_id: string | null;
  client_id: string | null;
  client_name: string | null;
  user_id: string;
  user_name: string;
  answers: Record<string, unknown>;
  signed_name: string | null;
  signatures: DeviceSignature[];
  submitted_at: string;
}

function unwrap(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

const RECORD_SELECT =
  "id, template_id, template_version, subject, assignment_id, client_id, user_id, answers, signed_name, signatures, submitted_at, template:form_templates (code, title), client:clients (full_name), person:users!form_responses_user_id_fkey (full_name, email)";

function toRecord(r: Record<string, unknown>): FormRecord {
  const t = unwrap(r.template) as { code?: string; title?: string } | undefined;
  const c = unwrap(r.client) as { full_name?: string } | undefined;
  const u = unwrap(r.person) as { full_name?: string | null; email?: string | null } | undefined;
  return {
    id: r.id as string,
    template_id: r.template_id as string,
    template_code: t?.code ?? "",
    template_title: t?.title ?? "Form",
    template_version: (r.template_version as number) ?? 1,
    subject: audienceOf(r.subject),
    assignment_id: (r.assignment_id as string | null) ?? null,
    client_id: (r.client_id as string | null) ?? null,
    client_name: c?.full_name ?? null,
    user_id: r.user_id as string,
    user_name: u?.full_name ?? u?.email ?? "Unnamed",
    answers: (r.answers as Record<string, unknown> | null) ?? {},
    signed_name: (r.signed_name as string | null) ?? null,
    signatures: Array.isArray(r.signatures) ? (r.signatures as DeviceSignature[]) : [],
    submitted_at: r.submitted_at as string,
  };
}

/** Everything filled in about one client, newest first. */
export async function loadRecordsForClient(supabase: SupabaseClient, clientId: string): Promise<FormRecord[]> {
  const { data } = await supabase
    .from("form_responses")
    .select(RECORD_SELECT)
    .eq("client_id", clientId)
    .order("submitted_at", { ascending: false })
    .limit(500);
  return (data ?? []).map(toRecord);
}

/** Every client or company record of one form, newest first. */
export async function loadRecordsForTemplate(
  supabase: SupabaseClient,
  organisationId: string,
  templateId: string,
  subject: Exclude<FormAudience, "carer">,
): Promise<FormRecord[]> {
  const { data } = await supabase
    .from("form_responses")
    .select(RECORD_SELECT)
    .eq("organisation_id", organisationId)
    .eq("template_id", templateId)
    .eq("subject", subject)
    .order("submitted_at", { ascending: false })
    .limit(500);
  return (data ?? []).map(toRecord);
}

/** One completed form, with the template's current questions to read it by. */
export async function loadRecord(
  supabase: SupabaseClient,
  id: string,
): Promise<(FormRecord & { fields: FormField[]; current_version: number; description: string | null }) | null> {
  const { data } = await supabase
    .from("form_responses")
    .select(
      "id, template_id, template_version, subject, assignment_id, client_id, user_id, answers, signed_name, signatures, submitted_at, template:form_templates (code, title, description, version, fields), client:clients (full_name), person:users!form_responses_user_id_fkey (full_name, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const t = unwrap(data.template) as Partial<FormTemplateRecord> | undefined;
  return {
    ...toRecord(data),
    fields: (t?.fields as FormField[] | undefined) ?? [],
    current_version: (t?.version as number | undefined) ?? 1,
    description: (t?.description as string | null | undefined) ?? null,
  };
}

/** Where a completed form is read back. */
export function recordHref(id: string): string {
  return `/org/forms/responses/${id}`;
}
