/**
 * A finding on each thing that was raised.
 *
 * A complaint is rarely one thing. One letter raises short visits, a missed
 * lunch, a visit an hour early, changing carers and a promised call that did
 * not come — and a single "overall findings" box answers all of it with one
 * line. Regulation 16 expects each to be investigated; the Ombudsman expects
 * a response that says what we decided on each and why.
 *
 * So Findings holds a list: each concern in the complainant's own terms, what
 * we found, and the reason. The response is then written from these, not
 * from a fresh reading of the file.
 *
 * Kept on the Findings stage under one key, beside the form's answers.
 * Pure: no I/O.
 */

export type FindingValue = "upheld" | "partly_upheld" | "not_upheld" | "undetermined";

export const FINDING_OPTIONS: { value: FindingValue; label: string; hint: string }[] = [
  { value: "upheld", label: "Upheld", hint: "It happened as described and should not have" },
  { value: "partly_upheld", label: "Partly upheld", hint: "Some of it is right" },
  { value: "not_upheld", label: "Not upheld", hint: "The evidence does not support it" },
  { value: "undetermined", label: "Cannot be determined", hint: "The evidence does not settle it either way" },
];

export interface ConcernFinding {
  id: string;
  /** What was raised, as the person raising it put it. */
  concern: string;
  finding?: FindingValue;
  /** The reason, resting on the evidence. */
  why: string;
}

/** The key the list lives under on the Findings stage. */
export const CONCERN_FINDINGS_KEY = "concern_findings";

const isFinding = (v: unknown): v is FindingValue => FINDING_OPTIONS.some((o) => o.value === v);

/** The saved list, tolerant of anything malformed. */
export function readConcernFindings(answers: Record<string, unknown> | null | undefined): ConcernFinding[] {
  const raw = answers?.[CONCERN_FINDINGS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r, i) => ({
      id: typeof r.id === "string" && r.id ? r.id : `c${i + 1}`,
      concern: typeof r.concern === "string" ? r.concern : "",
      finding: isFinding(r.finding) ? r.finding : undefined,
      why: typeof r.why === "string" ? r.why : "",
    }));
}

/** Tidy a list for saving: trimmed, blank rows dropped, at most 20. */
export function cleanConcernFindings(list: ConcernFinding[]): ConcernFinding[] {
  return list
    .map((r) => ({ ...r, concern: r.concern.trim(), why: r.why.trim() }))
    .filter((r) => r.concern)
    .slice(0, 20);
}

/**
 * What still needs deciding. Findings is not done while this is non-empty:
 * no concerns listed at all, or one without a finding or without its reason.
 */
export function findingsOutstanding(list: ConcernFinding[]): string[] {
  if (list.length === 0) return ["No concerns are listed yet"];
  const out: string[] = [];
  list.forEach((r, i) => {
    if (!r.finding) out.push(`Concern ${i + 1} has no finding`);
    else if (!r.why.trim()) out.push(`Concern ${i + 1} has no reason`);
  });
  return out;
}

export const findingLabel = (v?: FindingValue) => FINDING_OPTIONS.find((o) => o.value === v)?.label ?? "Not decided";

/** For a document: one line per concern. */
export function concernFindingLines(list: ConcernFinding[]): string[] {
  return list.map((r) => `${r.concern} — ${findingLabel(r.finding)}${r.why ? `: ${r.why}` : ""}`);
}

const isFindingsMeeting = (s: { kind: string; name: string }) =>
  s.kind === "meeting_minutes" && /\b2\b|finding/i.test(s.name) && !/\b3\b|follow/i.test(s.name);

/**
 * The stage a record keeps its findings on, from the stages that apply to
 * it. A complaint or a safeguarding concern has a Findings stage; an issue
 * goes straight to its action plan, so its findings sit there, above the
 * actions they lead to.
 */
export function findingsStageOf<S extends { kind: string; name: string }>(stages: S[]): S | undefined {
  return stages.find(isFindingsMeeting) ?? stages.find((s) => s.kind === "action_plan");
}

/**
 * The findings on a record, read from whichever of those stages holds any —
 * for callers that have every stage of the organisation, not just the record's.
 */
export function recordFindings<S extends { id: string; kind: string; name: string }>(
  stages: S[],
  answersOf: (stageId: string) => Record<string, unknown> | null | undefined,
): ConcernFinding[] {
  for (const st of [...stages.filter(isFindingsMeeting), ...stages.filter((s) => s.kind === "action_plan")]) {
    const list = readConcernFindings(answersOf(st.id) ?? null);
    if (list.length) return list;
  }
  return [];
}

/**
 * The outcome letter, once it has gone. A safeguarding concern or an issue
 * has no written response; this letter is where it ends, and a record with
 * one sent is reported on as finished, not as an enquiry still running.
 */
export function sentOutcomeLetter(
  record: { stageEntries: { stageId: string; status?: string | null; formAnswers?: Record<string, unknown> | null }[] },
  stages: { id: string; kind: string; enabled?: boolean }[],
): { subject: string; body: string; sentOn: string } | null {
  const stage = stages.find((s) => s.kind === "outcome_letter" && s.enabled !== false);
  const a = record.stageEntries.find((e) => e.stageId === stage?.id)?.formAnswers as Record<string, unknown> | undefined;
  const sentOn = typeof a?.sentOn === "string" ? a.sentOn : "";
  const body = typeof a?.body === "string" ? a.body : "";
  return sentOn && body.trim() ? { subject: String(a?.subject || ""), body, sentOn } : null;
}
