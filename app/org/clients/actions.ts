"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { logAudit } from "@/lib/audit";
import { clientProblems, FUNDER_TYPES, parseUkDate, type ClientInput, type FunderType } from "@/lib/clients";

function row(c: ClientInput) {
  return {
    full_name: c.fullName.replace(/\s+/g, " ").trim(),
    date_of_birth: c.dateOfBirth,
    region: c.region?.trim() || null,
    postcode: c.postcode?.trim().toUpperCase() || null,
    funder_type: c.funderType,
    funder_name: c.funderType === "council" || c.funderType === "other" ? c.funderName?.trim() || null : null,
    medication_support: c.medicationSupport,
    start_date: c.startDate,
    status: c.status,
  };
}

/** The same person, as the database's unique index sees them. */
const personKey = (name: string, dob: string | null) => `${name.trim().toLowerCase()}|${dob ?? ""}`;

function fromForm(formData: FormData): ClientInput | string {
  const date = (key: string) => {
    const v = parseUkDate(String(formData.get(key) ?? ""));
    return v === "invalid" ? "invalid" : v;
  };
  const dob = date("date_of_birth");
  const start = date("start_date");
  if (dob === "invalid") return "The date of birth isn't a date.";
  if (start === "invalid") return "The start date isn't a date.";
  const funderType = String(formData.get("funder_type") ?? "council") as FunderType;
  if (!FUNDER_TYPES.some((f) => f.value === funderType)) return "Choose who funds their care.";
  return {
    fullName: String(formData.get("full_name") ?? ""),
    dateOfBirth: dob,
    region: String(formData.get("region") ?? "") || null,
    postcode: String(formData.get("postcode") ?? "") || null,
    funderType,
    funderName: String(formData.get("funder_name") ?? "") || null,
    medicationSupport: formData.get("medication_support") === "on",
    startDate: start,
    status: formData.get("status") === "ended" ? "ended" : "active",
  };
}

export async function saveClientAction(
  id: string | null,
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  const input = fromForm(formData);
  if (typeof input === "string") return { error: input };
  const problems = clientProblems(input);
  if (problems.length) return { error: problems.join(". ") + "." };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("clients").update(row(input)).eq("id", id).select("id").maybeSingle()
    : await supabase
        .from("clients")
        .insert({ ...row(input), organisation_id: context.organisationId, created_by: context.userId })
        .select("id")
        .maybeSingle();
  if (error?.code === "23505") return { error: "There's already a client with this name and date of birth." };
  if (error || !data) return { error: "The client couldn't be saved. Try again." };

  revalidatePath("/org/clients");
  redirect(`/org/clients/${data.id}`);
}

/**
 * A spreadsheet of clients. Every row is checked again here — the browser's
 * preview is a convenience, not a gate. A row matching a client already on
 * the list (same name and date of birth) updates them; the rest are added.
 */
export async function importClientsAction(
  clients: ClientInput[],
): Promise<{ ok: boolean; added?: number; updated?: number; skipped?: number; error?: string }> {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  if (!Array.isArray(clients) || clients.length === 0) return { ok: false, error: "There are no clients to add." };
  if (clients.length > 5000) return { ok: false, error: "That's more than 5,000 rows. Split the file and upload each part." };

  const supabase = await createClient();
  const existing = await fetchAll((f, t) =>
    supabase
      .from("clients")
      .select("id, full_name, date_of_birth")
      .eq("organisation_id", context.organisationId!)
      .order("id")
      .range(f, t),
  );
  const known = new Map(existing.map((c) => [personKey(c.full_name as string, c.date_of_birth as string | null), c.id as string]));

  const inserts: ReturnType<typeof row>[] = [];
  const updates: { id: string; values: ReturnType<typeof row> }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const c of clients) {
    const safe: ClientInput = {
      fullName: String(c?.fullName ?? ""),
      dateOfBirth: typeof c?.dateOfBirth === "string" && parseUkDate(c.dateOfBirth) === c.dateOfBirth ? c.dateOfBirth : null,
      region: typeof c?.region === "string" ? c.region.slice(0, 120) : null,
      postcode: typeof c?.postcode === "string" ? c.postcode.slice(0, 12) : null,
      funderType: FUNDER_TYPES.some((f) => f.value === c?.funderType) ? c.funderType : "council",
      funderName: typeof c?.funderName === "string" ? c.funderName.slice(0, 160) : null,
      medicationSupport: c?.medicationSupport === true,
      startDate: typeof c?.startDate === "string" && parseUkDate(c.startDate) === c.startDate ? c.startDate : null,
      status: c?.status === "ended" ? "ended" : "active",
    };
    if (clientProblems(safe).length) {
      skipped++;
      continue;
    }
    const key = personKey(safe.fullName, safe.dateOfBirth);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    const id = known.get(key);
    if (id) updates.push({ id, values: row(safe) });
    else inserts.push(row(safe));
  }

  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await supabase.from("clients").insert(
      inserts.slice(i, i + 500).map((r) => ({ ...r, organisation_id: context.organisationId, created_by: context.userId })),
    );
    if (error) return { ok: false, error: "Some clients couldn't be added. Nothing after row " + (i + 1) + " was saved." };
  }
  // Clients already on the list, 500 at a time: an upsert on id (every one
  // exists, so each is an update) instead of one request per row, which a
  // large file couldn't finish — and whose failures went unnoticed.
  let updated = 0;
  for (let i = 0; i < updates.length; i += 500) {
    const part = updates.slice(i, i + 500);
    const { error } = await supabase
      .from("clients")
      .upsert(
        part.map((u) => ({ id: u.id, organisation_id: context.organisationId, ...u.values })),
        { onConflict: "id" },
      );
    if (error) {
      await logAudit({
        context,
        action: "clients.imported",
        entity: "client",
        entityId: context.organisationId!,
        detail: { added: inserts.length, updated, skipped, failedUpdates: updates.length - updated },
      });
      revalidatePath("/org/clients");
      return {
        ok: false,
        error: `${inserts.length} added and ${updated} updated, but ${updates.length - updated} clients already on the list couldn't be updated. Try the upload again.`,
      };
    }
    updated += part.length;
  }

  await logAudit({
    context,
    action: "clients.imported",
    entity: "client",
    entityId: context.organisationId!,
    detail: { added: inserts.length, updated: updates.length, skipped },
  });
  revalidatePath("/org/clients");
  return { ok: true, added: inserts.length, updated: updates.length, skipped };
}
