"use server";

import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { RAISED_BY_ROLES } from "@/lib/complaints/stages";
import type { SaveState } from "@/app/platform/actions";

const NOT_IN_PLAN = "Complaints are not included in your plan.";
const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/** Log a compliment, with the staff it is about. */
export async function addComplimentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "complaints.register"))) return { ok: false, error: NOT_IN_PLAN };
  const receivedOn = str(formData, "receivedOn");
  const fromName = str(formData, "fromName").slice(0, 120);
  const fromRole = str(formData, "fromRole");
  const clientId = str(formData, "clientId");
  const what = str(formData, "whatWasSaid");
  const people = [...new Set(formData.getAll("people").map(String).filter(Boolean))];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return { ok: false, error: "Say when it was received." };
  if (!what) return { ok: false, error: "Say what was said." };
  if (what.length > 5000) return { ok: false, error: "Keep it under 5,000 characters." };
  if (fromRole && !RAISED_BY_ROLES.some((r) => r.value === fromRole)) return { ok: false, error: "Pick who it came from." };

  const supabase = await createClient();
  if (clientId) {
    const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (!client) return { ok: false, error: "That client is not on your client list." };
  }
  if (people.length) {
    // Theirs, whoever they are: a form field is not a permission check.
    const { data: staff } = await supabase.from("users").select("id").in("id", people).eq("organisation_id", context.organisationId!);
    if ((staff ?? []).length !== people.length) return { ok: false, error: "Pick staff from your own organisation." };
  }
  const { data: row, error } = await supabase
    .from("compliments")
    .insert({
      organisation_id: context.organisationId,
      received_on: receivedOn,
      from_name: fromName || null,
      from_role: fromRole || null,
      client_id: clientId || null,
      what_was_said: what,
      created_by: context.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  if (people.length) {
    const { error: pErr } = await supabase
      .from("compliment_people")
      .insert(people.map((user_id) => ({ compliment_id: row.id, user_id })));
    if (pErr) return { ok: false, error: `Logged it, but could not link the staff: ${pErr.message}` };
  }
  await logAudit({ context, action: "compliment.logged", entity: "compliment", entityId: row.id as string, detail: { people: people.length } });
  revalidatePath("/org/complaints/compliments");
  for (const id of people) revalidatePath(`/org/staff/${id}`);
  if (clientId) revalidatePath(`/org/clients/${clientId}`);
  return { ok: true };
}

export async function deleteComplimentAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const context = await requireConsole();
  if (!(await hasFeature(context, "complaints.register"))) return { ok: false, error: NOT_IN_PLAN };
  const id = str(formData, "id");
  const supabase = await createClient();
  const { error } = await supabase.from("compliments").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit({ context, action: "compliment.deleted", entity: "compliment", entityId: id });
  revalidatePath("/org/complaints/compliments");
  return { ok: true };
}
