/**
 * Compliance documents for current staff (ROADMAP §3; the documents page in
 * HR-PACK.md): right to work, DBS, references, insurance and the rest, held
 * on the carer's file with their expiries.
 *
 * Pure, so the page, the task list and the tests share one reading of what
 * "expired", "expiring" and "missing" mean.
 */

import { daysUntil } from "./engine-logic";
import { DUE_SOON_DAYS } from "./records";

export interface StaffDocDef {
  key: "right_to_work" | "proof_id" | "dbs" | "dbs_risk_assessment" | "references" | "driving_licence" | "insurance";
  label: string;
  /** Asks for an expiry, or a review-by date, alongside the file. */
  tracksExpiry: boolean;
  /**
   * Only some people need it (the DBS risk assessment, where the DBS shows a
   * conviction; a driving licence) or it backs up another document (proof of
   * identity, behind right to work): never "missing", so it never becomes a
   * task on everyone. Once held, its expiry is reminded like any other.
   */
  onlyIfNeeded?: boolean;
  /** One line under the name, saying what is wanted. */
  hint: string;
}

export const STAFF_DOCS: StaffDocDef[] = [
  { key: "right_to_work", label: "Right to work", tracksExpiry: true, hint: "Passport, share-code check or visa. Set the expiry for a time-limited right." },
  { key: "proof_id", label: "Proof of identity", tracksExpiry: true, onlyIfNeeded: true, hint: "Passport or photo driving licence, with its expiry. Moved here on hire." },
  { key: "dbs", label: "DBS", tracksExpiry: true, hint: "The certificate or Update Service check. Set when it is to be rechecked." },
  { key: "dbs_risk_assessment", label: "DBS risk assessment", tracksExpiry: false, onlyIfNeeded: true, hint: "Only where the DBS shows a conviction: why it was safe to employ them." },
  { key: "references", label: "References", tracksExpiry: false, hint: "The references taken when they started." },
  { key: "driving_licence", label: "Driving licence", tracksExpiry: true, onlyIfNeeded: true, hint: "For anyone who drives between visits, with its expiry." },
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

export function staffDocState(doc: StaffDoc | undefined, now: Date, def?: StaffDocDef): StaffDocState {
  if (!doc) return def?.onlyIfNeeded ? "not_required" : "missing";
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
    const state = staffDocState(doc, now, def);
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

/**
 * On hire (RECRUITMENT.md, release 6; HR-PACK.md, the documents page), which
 * recruitment step fills which staff document, with its expiry so reminders
 * carry on. Right to work: the share code check where there is one, otherwise
 * the ID (a UK or Irish passport is the right-to-work proof). Steps held as a
 * file move as they are; references taken online and the DBS risk assessment
 * filled in online move as a PDF of what was written (lib/hire.ts).
 */
export const STAFF_FILE_SOURCES: Array<{ staffDoc: StaffDocKey; from: string[] }> = [
  { staffDoc: "right_to_work", from: ["share_code", "proof_id"] },
  { staffDoc: "proof_id", from: ["proof_id"] },
  { staffDoc: "dbs", from: ["dbs"] },
];

/** Summary counts for one person's documents, for lists across the company. */
export function staffDocSummary(docs: StaffDoc[], now: Date): { expired: string[]; expiring: string[]; missing: string[] } {
  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  const out = { expired: [] as string[], expiring: [] as string[], missing: [] as string[] };
  for (const def of STAFF_DOCS) {
    const state = staffDocState(byType.get(def.key), now, def);
    if (state === "expired") out.expired.push(def.label);
    else if (state === "expiring") out.expiring.push(def.label);
    else if (state === "missing") out.missing.push(def.label);
  }
  return out;
}
