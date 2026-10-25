/**
 * Compliance documents for current staff (ROADMAP §3): right to work, DBS,
 * references and insurance, held on the carer's file with their expiries.
 *
 * Pure, so the page, the task list and the tests share one reading of what
 * "expired", "expiring" and "missing" mean.
 */

import { daysUntil } from "./engine-logic";
import { DUE_SOON_DAYS } from "./records";

export interface StaffDocDef {
  key: "right_to_work" | "dbs" | "references" | "insurance";
  label: string;
  /** Asks for an expiry, or a review-by date, alongside the file. */
  tracksExpiry: boolean;
  /** One line under the name, saying what is wanted. */
  hint: string;
}

export const STAFF_DOCS: StaffDocDef[] = [
  { key: "right_to_work", label: "Right to work", tracksExpiry: true, hint: "Passport, share-code check or visa. Set the expiry for a time-limited right." },
  { key: "dbs", label: "DBS", tracksExpiry: true, hint: "The certificate or Update Service check. Set when it is to be rechecked." },
  { key: "references", label: "References", tracksExpiry: false, hint: "The references taken when they started." },
  { key: "insurance", label: "Business car insurance", tracksExpiry: true, hint: "For anyone who drives between visits. Not needed for non-drivers." },
];

export type StaffDocKey = StaffDocDef["key"];

export function staffDocLabel(key: string): string {
  return STAFF_DOCS.find((d) => d.key === key)?.label ?? key;
}

/** One row as stored. */
export interface StaffDoc {
  id: string;
  doc_type: string;
  file_name: string | null;
  file_path: string | null;
  expires_at: string | null;
  not_required: boolean;
  not_required_reason: string | null;
}

export type StaffDocState = "held" | "expiring" | "expired" | "not_required" | "missing";

export function staffDocState(doc: StaffDoc | undefined, now: Date): StaffDocState {
  if (!doc) return "missing";
  if (doc.not_required) return "not_required";
  if (doc.expires_at) {
    const exp = new Date(doc.expires_at);
    if (exp.getTime() < now.getTime()) return "expired";
    if (daysUntil(exp, now) <= DUE_SOON_DAYS) return "expiring";
  }
  return "held";
}

/** What the task list should carry for one person's documents. */
export interface StaffDocTask {
  key: string;
  title: string;
  detail: string;
  dueDate: string | null;
  urgency: "overdue" | "due_soon" | "open";
}

export function staffDocTasks(docs: StaffDoc[], now: Date): StaffDocTask[] {
  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  const tasks: StaffDocTask[] = [];
  for (const def of STAFF_DOCS) {
    const doc = byType.get(def.key);
    const state = staffDocState(doc, now);
    if (state === "expired") {
      tasks.push({ key: `staffdoc:${def.key}`, title: `Renew ${def.label}`, detail: "It has expired.", dueDate: doc!.expires_at, urgency: "overdue" });
    } else if (state === "expiring") {
      tasks.push({ key: `staffdoc:${def.key}`, title: `Renew ${def.label}`, detail: "It expires soon.", dueDate: doc!.expires_at, urgency: "due_soon" });
    } else if (state === "missing") {
      tasks.push({ key: `staffdoc:${def.key}`, title: `Add ${def.label} to their file`, detail: "Upload it, or mark it not needed.", dueDate: null, urgency: "open" });
    }
  }
  return tasks;
}
