/**
 * Reading a company's service audits: our defaults with its own changes
 * (service_audit_forms) laid over them, and the score below which an audit
 * waits for a manager. Read under RLS, so a console user gets their own
 * organisation's and nobody else's.
 */

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import {
  DEFAULT_REVIEW_BELOW,
  isQuestionType,
  resolveServiceForms,
  type DueClient,
  type ServiceAuditForm,
  type ServiceQuestion,
} from "./service-audits";
import { fetchAll } from "./fetch-all";
import { QA_FORM_KEY, resolveQaForm, type QaForm } from "./client-qa";

function questions(raw: unknown): ServiceQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((q) => q && typeof q.id === "string" && typeof q.label === "string" && isQuestionType(q.type));
}

async function readForms(supabase: SupabaseClient, organisationId: string): Promise<ServiceAuditForm[]> {
  const { data } = await supabase
    .from("service_audit_forms")
    .select("key, label, scope, questions, due_every, due_unit, archived")
    .eq("organisation_id", organisationId)
    .neq("key", QA_FORM_KEY)
    .limit(200);
  return resolveServiceForms(
    (data ?? []).map((r) => ({
      key: r.key as string,
      label: (r.label as string | null) ?? null,
      scope: r.scope === "client" ? "client" : "service",
      questions: questions(r.questions),
      due_every: r.due_every as number,
      due_unit: r.due_unit === "weeks" ? "weeks" : "months",
      archived: !!r.archived,
    })),
  );
}

/** Once per request, per organisation. */
export const loadServiceForms = cache(async (organisationId: string): Promise<ServiceAuditForm[]> => readForms(await createClient(), organisationId));

/** The client QA as the company asks it: ours, or its own medication and extra questions and due period. */
export const loadQaForm = cache(async (organisationId: string): Promise<QaForm> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_audit_forms")
    .select("questions, due_every, due_unit")
    .eq("organisation_id", organisationId)
    .eq("key", QA_FORM_KEY)
    .maybeSingle();
  return resolveQaForm(data ? { questions: data.questions, due_every: data.due_every as number, due_unit: data.due_unit === "weeks" ? "weeks" : "months" } : null);
});

export const loadReviewBelow = cache(async (organisationId: string): Promise<number> => {
  const supabase = await createClient();
  const { data } = await supabase.from("service_audit_settings").select("review_below").eq("organisation_id", organisationId).maybeSingle();
  return (data?.review_below as number | undefined) ?? DEFAULT_REVIEW_BELOW;
});

/** The company's current clients, for client-by-client audits. Paged past 1,000. */
export async function loadDueClients(supabase: SupabaseClient, organisationId: string): Promise<DueClient[]> {
  const rows = await fetchAll((f, t) =>
    supabase
      .from("clients")
      .select("id, full_name, region, medication_support")
      .eq("organisation_id", organisationId)
      .eq("status", "active")
      .order("id")
      .range(f, t),
  );
  return rows
    .map((c) => ({
      id: c.id as string,
      name: c.full_name as string,
      region: (c.region as string | null) ?? null,
      medicationSupport: !!c.medication_support,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
