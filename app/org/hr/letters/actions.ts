"use server";

import { revalidatePath } from "next/cache";
import { requireConsole, type UserContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { askClaudeJson } from "@/lib/ai";
import { hrPerson, sendLetter, type Admin } from "@/lib/hr/server";
import { LETTER_DRAFT_SCHEMA, letterPrompt, sanitiseOverrides, templateInForce, unfilled } from "@/lib/hr/letters";
import { canSeeLetter } from "@/lib/hr/letter-access";

/**
 * A letter on its way out (HR-PACK.md): edited, drafted by AI if the company
 * has it on, and sent by a person. Never sent by anything else.
 */

async function gate(context: UserContext, admin: Admin, id: string) {
  const { data: letter } = await admin.from("hr_letters").select("*").eq("id", id).maybeSingle();
  if (!letter || letter.organisation_id !== context.organisationId) return null;
  if (!(await hrPerson(admin, context.organisationId, letter.user_id as string))) return null;
  if (!(await canSeeLetter(admin, context, letter))) return null;
  return letter;
}

const clean = (v: string, max: number) => v.replace(/\r/g, "").trim().slice(0, max);

export async function saveLetterAction(id: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const letter = await gate(context, admin, id);
  if (!letter) return { ok: false, error: "Letter not found." };
  if (letter.status === "sent") return { ok: false, error: "It has been sent, so it can't be changed." };
  const { error } = await admin.from("hr_letters").update({ subject: clean(subject, 200).replace(/\s+/g, " "), body: clean(body, 8000) }).eq("id", id);
  if (error) return { ok: false, error: "That didn't save. Try again." };
  return { ok: true };
}

export async function draftLetterWithAiAction(id: string, notes: string): Promise<{ ok: boolean; subject?: string; body?: string; error?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const letter = await gate(context, admin, id);
  if (!letter) return { ok: false, error: "Letter not found." };
  if (letter.status === "sent") return { ok: false, error: "It has been sent." };
  const [{ data: org }, { data: settings }] = await Promise.all([
    admin.from("organisations").select("name").eq("id", context.organisationId!).maybeSingle(),
    admin.from("hr_settings").select("letter_templates").eq("organisation_id", context.organisationId!).maybeSingle(),
  ]);
  const t = templateInForce(letter.kind as string, sanitiseOverrides(settings?.letter_templates));
  const r = await askClaudeJson<{ subject: string; paragraphs: string[] }>({
    orgId: context.organisationId!,
    userId: context.userId,
    feature: "hr_letter",
    prompt: letterPrompt({
      company: (org?.name as string | undefined) ?? "",
      label: t?.label ?? String(letter.kind),
      template: t?.body ?? "",
      current: String(letter.body),
      notes: clean(notes, 3000),
      fixed: Array.isArray(letter.fixed) ? (letter.fixed as string[]) : [],
    }),
    schema: LETTER_DRAFT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 3000,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, subject: r.data.subject.trim().slice(0, 200), body: r.data.paragraphs.map((p) => p.trim()).filter(Boolean).join("\n\n").slice(0, 8000) };
}

export async function sendLetterAction(id: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const saved = await saveLetterAction(id, subject, body);
  if (!saved.ok) return saved;
  const left = unfilled(`${subject}\n${body}`);
  if (left.length) return { ok: false, error: `Fill in or take out ${left.map((f) => `{{${f}}}`).join(", ")} before sending.` };
  if (!body.trim()) return { ok: false, error: "The letter is empty." };
  const admin = createAdminClient();
  const letter = await gate(context, admin, id);
  if (!letter) return { ok: false, error: "Letter not found." };
  const r = await sendLetter(admin, id, context.organisationId!, context.userId);
  if (!r.ok) return r;
  await logAudit({ context, action: "hr_letter.sent", entity: "user", entityId: letter.user_id as string, detail: { kind: letter.kind, letter: id } });
  revalidatePath(`/org/staff/${letter.user_id as string}`);
  return { ok: true };
}

export async function discardLetterAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const context = await requireConsole();
  const admin = createAdminClient();
  const letter = await gate(context, admin, id);
  if (!letter) return { ok: false, error: "Letter not found." };
  if (letter.status === "sent") return { ok: false, error: "A sent letter stays on record." };
  await admin.from("hr_letters").delete().eq("id", id);
  return { ok: true };
}
