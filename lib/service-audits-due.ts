/**
 * Where every service audit stands: for an audit of the whole service, its
 * last and next date; for one done client by client, each client's line.
 * Read under RLS, paged past 1,000.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { dueStatus } from "./records";
import type { DueRowStatus } from "./due-view";
import { clientDueRows, clientsFor, type ClientDueRow, type ServiceAuditForm } from "./service-audits";
import { loadDueClients, loadQaForm, loadServiceForms } from "./service-audits-data";
import { qaAsServiceForm } from "./client-qa";

export interface ServiceDue {
  form: ServiceAuditForm;
  /** The whole service: the latest audit. */
  last: string | null;
  lastId: string | null;
  next: string | null;
  status: DueRowStatus;
  /** Client by client: each current client's line. Empty for a service-wide audit. */
  clients: ClientDueRow[];
}

export interface AuditRecordRow {
  id: string;
  kind: string;
  client_id: string | null;
  held_on: string;
  next_due: string | null;
}

export async function loadAuditRecords(supabase: SupabaseClient, organisationId: string): Promise<AuditRecordRow[]> {
  return fetchAll<AuditRecordRow>((f, t) =>
    supabase
      .from("audits")
      .select("id, kind, client_id, held_on, next_due")
      .eq("organisation_id", organisationId)
      .order("id")
      .range(f, t),
  );
}

/** Every QA, attempted or done: either moves the next one on. */
export async function loadQaRecords(supabase: SupabaseClient, organisationId: string): Promise<Omit<AuditRecordRow, "kind">[]> {
  return fetchAll<Omit<AuditRecordRow, "kind">>((f, t) =>
    supabase
      .from("client_qas")
      .select("id, client_id, held_on, next_due")
      .eq("organisation_id", organisationId)
      .order("id")
      .range(f, t),
  );
}

export async function loadServiceDue(supabase: SupabaseClient, organisationId: string, now = new Date()): Promise<ServiceDue[]> {
  const [forms, qaForm, clients, records, qas] = await Promise.all([
    loadServiceForms(organisationId),
    loadQaForm(organisationId),
    loadDueClients(supabase, organisationId),
    loadAuditRecords(supabase, organisationId),
    loadQaRecords(supabase, organisationId),
  ]);
  // The client QA sits first among the client-by-client lines; its records are QAs.
  const qa = qaAsServiceForm(qaForm);
  const all = [...records, ...qas.map((q) => ({ ...q, kind: qa.key }))];
  return [qa, ...forms].map((form): ServiceDue => {
    const mine = all.filter((r) => r.kind === form.key).sort((a, b) => b.held_on.localeCompare(a.held_on));
    if (form.scope === "client") {
      const rows = clientDueRows(
        clientsFor(form, clients),
        mine.filter((r) => r.client_id).map((r) => ({ id: r.id, clientId: r.client_id!, heldOn: r.held_on, nextDue: r.next_due })),
        now,
      );
      return { form, last: mine[0]?.held_on ?? null, lastId: mine[0]?.id ?? null, next: null, status: "none", clients: rows };
    }
    const last = mine[0];
    return {
      form,
      last: last?.held_on ?? null,
      lastId: last?.id ?? null,
      next: last?.next_due ?? null,
      status: last ? dueStatus(last.next_due, now) : "never",
      clients: [],
    };
  });
}
