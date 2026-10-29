/**
 * Reading a company's Staff Audits forms: our defaults with its own changes
 * (staff_audit_forms) laid over them, by resolveForms(). Read under RLS, so
 * a console user gets their own organisation's and nobody else's.
 */

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { resolveForms, type FormOverride, type ResolvedForms } from "./audit-forms";

async function read(supabase: SupabaseClient, organisationId: string): Promise<ResolvedForms> {
  const { data } = await supabase
    .from("staff_audit_forms")
    .select("kind, area_key, label, questions, self_assessment, due_every, due_unit, archived")
    .eq("organisation_id", organisationId)
    .limit(200);
  return resolveForms(
    (data ?? []).map((r) => ({
      kind: r.kind as FormOverride["kind"],
      area_key: (r.area_key as string) ?? "",
      label: (r.label as string | null) ?? null,
      questions: Array.isArray(r.questions) ? r.questions : [],
      self_assessment: Array.isArray(r.self_assessment) ? r.self_assessment : [],
      due_every: r.due_every as number,
      due_unit: r.due_unit === "weeks" ? "weeks" : "months",
      archived: !!r.archived,
    })),
  );
}

/** Once per request, per organisation: the file page and its forms all ask. */
export const loadAuditForms = cache(async (organisationId: string): Promise<ResolvedForms> => read(await createClient(), organisationId));
