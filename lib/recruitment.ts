export interface RequiredDoc {
  key: string;
  label: string;
  tracksExpiry?: boolean;
}

/** The document checklist shown as columns in the recruitment tracker. */
export const REQUIRED_DOCS: RequiredDoc[] = [
  { key: "application", label: "Application Form" },
  { key: "proof_id", label: "Proof of ID" },
  { key: "right_to_work", label: "Right to Work", tracksExpiry: true },
  { key: "proof_ni", label: "Proof of NI" },
  { key: "proof_address", label: "Proof of Address" },
  { key: "references", label: "References" },
  { key: "literacy", label: "Literacy Test" },
  { key: "interview", label: "Interview" },
  { key: "dbs", label: "DBS", tracksExpiry: true },
  { key: "role_acceptance", label: "Role Acceptance" },
  { key: "contract", label: "Contract" },
  { key: "training", label: "Training" },
];

export function docLabel(key: string): string {
  return REQUIRED_DOCS.find((d) => d.key === key)?.label ?? key;
}

export const CANDIDATE_STAGES = [
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Onboarding",
] as const;

export const CANDIDATE_STATUSES = ["candidate", "hired", "rejected"] as const;

/** What the database holds for one checklist item: a file, or a reasoned N/A. */
export interface CandidateDocRecord {
  doc_type: string;
  file_path: string | null;
  expires_at: string | null;
  not_required: boolean;
}

/**
 * Where a checklist item stands. "held" and "not_required" are done; the other
 * two are outstanding. Expired is its own state because an expired DBS is a
 * file we hold that is no use — it shows in red, and it blocks a hire the same
 * as a missing one (issue #51).
 */
export type DocState = "held" | "expired" | "not_required" | "missing";

export interface ChecklistItem extends RequiredDoc {
  state: DocState;
}

/** Today as YYYY-MM-DD in local time, for comparing with a date column. */
export function isoToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function docState(
  doc: CandidateDocRecord | undefined,
  today = isoToday(),
): DocState {
  if (!doc) return "missing";
  if (doc.not_required) return "not_required";
  if (doc.expires_at && doc.expires_at < today) return "expired";
  return "held";
}

/** Every checklist item with its state, in checklist order. */
export function checklist(
  docs: CandidateDocRecord[],
  today = isoToday(),
): ChecklistItem[] {
  const byType = new Map(docs.map((d) => [d.doc_type, d]));
  return REQUIRED_DOCS.map((d) => ({ ...d, state: docState(byType.get(d.key), today) }));
}

/** The items still standing between a candidate and "hired" (issue #51). */
export function outstandingDocs(
  docs: CandidateDocRecord[],
  today = isoToday(),
): ChecklistItem[] {
  return checklist(docs, today).filter(
    (i) => i.state === "missing" || i.state === "expired",
  );
}

/** The refusal a manager reads when Mark hired is pressed too soon. */
export function notReadyMessage(outstanding: ChecklistItem[]): string {
  const labels = outstanding.map((i) =>
    i.state === "expired" ? `${i.label} (expired)` : i.label,
  );
  return `Not ready to hire — still outstanding: ${labels.join(", ")}. Upload each one, or mark it not needed.`;
}
