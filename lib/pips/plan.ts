/**
 * The vocabulary of a performance plan, and the shape of one as the pages
 * read it. Pure: safe in client components.
 */

export const PIP_KINDS: { value: string; label: string }[] = [
  { value: "pip", label: "Performance improvement plan" },
  { value: "disciplinary", label: "Disciplinary" },
];

export const PIP_FREQUENCIES: { value: string; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
  { value: "adhoc", label: "Ad hoc" },
];

export const PIP_SUPPORT_TYPES: { value: string; label: string }[] = [
  { value: "training", label: "Retraining or refresher" },
  { value: "shadowing", label: "Shadow an experienced carer" },
  { value: "supervision", label: "Extra supervision" },
  { value: "equipment", label: "Equipment or resources" },
  { value: "schedule", label: "Adjusted round or hours" },
  { value: "other", label: "Other" },
];

export const PIP_OUTCOMES: { value: string; label: string }[] = [
  { value: "met", label: "Standards met" },
  { value: "partially_met", label: "Partially met" },
  { value: "not_met", label: "Not met" },
];

export const PIP_WEEK_RATINGS: { value: string; label: string }[] = [
  { value: "on_track", label: "On track" },
  { value: "some_concern", label: "Some concern" },
  { value: "not_met", label: "Not met" },
];

export const label = (list: { value: string; label: string }[], v?: string | null) =>
  list.find((o) => o.value === v)?.label ?? (v || "—");

/** What is wrong, what good looks like, and how it will be judged. */
export interface PipConcern {
  id: string;
  concern: string;
  standard: string;
  measure: string;
}

/** Training, shadowing, supervision, equipment. */
export interface PipSupport {
  id: string;
  type: string;
  detail: string;
  arranged: boolean;
}

export interface PipReview {
  id: string;
  weekNumber: number;
  periodStart: string;
  periodEnd: string;
  managerNotes: string | null;
  carerResponse: string | null;
  rating: string | null;
  actionsNext: string | null;
  completedAt: string | null;
}

export interface PipTrainingSession {
  id: string;
  reviewId: string | null;
  sessionDate: string;
  topic: string;
  trainerName: string | null;
  attended: boolean | null;
  assessmentResult: string | null;
  notes: string | null;
}

export interface Pip {
  id: string;
  userId: string;
  carerName: string;
  kind: string;
  status: string;
  complaintId: string | null;
  /** The Staff Audits record it was raised from, if any. */
  raisedFromType: string | null;
  raisedFromId: string | null;
  complaintReference: string | null;
  reason: string | null;
  concerns: PipConcern[];
  expectations: string[];
  support: PipSupport[];
  consequences: string | null;
  durationWeeks: number | null;
  startDate: string | null;
  reviewUntil: string | null;
  reviewFrequency: string | null;
  ownerName: string | null;
  outcome: string | null;
  outcomeNotes: string | null;
  outcomeNextStep: string | null;
  completionSummary: string | null;
  carerSignature: string | null;
  carerSignedAt: string | null;
  carerSignedWitnessedBy: string | null;
  managerSignature: string | null;
  managerSignedAt: string | null;
  managerSignedByName: string | null;
  closedAt: string | null;
  createdAt: string;
  reviews: PipReview[];
  training: PipTrainingSession[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The saved concerns, tolerant of anything malformed. */
export function readConcerns(raw: unknown): PipConcern[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r, i) => ({
      id: str(r.id) || `k${i + 1}`,
      concern: str(r.concern),
      standard: str(r.standard),
      measure: str(r.measure),
    }))
    .filter((c) => c.concern);
}

export function readSupport(raw: unknown): PipSupport[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r, i) => ({
      id: str(r.id) || `s${i + 1}`,
      type: str(r.type) || "other",
      detail: str(r.detail),
      arranged: r.arranged === true,
    }))
    .filter((s) => s.detail || s.type !== "other");
}

export function readExpectations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => str(x).trim()).filter(Boolean);
}

/**
 * The weeks of a plan, from its start and length. Week 1 begins on the start
 * date; each runs seven days. Built once when the plan is created, so a
 * review is always against a period that was fixed before the week began.
 */
export function weeksFor(startDate: string, durationWeeks: number): { weekNumber: number; periodStart: string; periodEnd: string }[] {
  const out = [];
  const d = new Date(`${startDate.slice(0, 10)}T12:00:00Z`);
  for (let i = 0; i < durationWeeks; i++) {
    const start = new Date(d);
    start.setUTCDate(d.getUTCDate() + i * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    out.push({
      weekNumber: i + 1,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
    });
  }
  return out;
}
