/**
 * Who can see what (Saj, 2 Nov 2026, QA review Q2): a manager can switch
 * whole areas of the console off for the company's office workers. Managers
 * always see everything; Settings and billing are managers only regardless.
 *
 * An area is a set of paths. The switches live on the organisation row
 * (`office_hidden_areas`, the keys below), read once per request. "Off"
 * means the area leaves the office worker's menu, search, Today's list and
 * the Due badge, its pages send them to /org/managers-only, and the HR case
 * emails for it go to managers only.
 */

export type AreaGroup = "People" | "Training" | "Compliance" | "Documents";

export interface Area {
  key: string;
  group: AreaGroup;
  label: string;
  /** One line on the settings page: what the area covers. */
  what: string;
  /**
   * Paths that belong to it: a prefix matches itself and everything under
   * it; `*` stands for one path segment (a person's id).
   */
  paths: string[];
}

export const AREAS: Area[] = [
  { key: "people.staff", group: "People", label: "Staff files and training", what: "The staff list, each person's file, the training matrix and stars.", paths: ["/org/learners", "/org/staff"] },
  { key: "people.documents", group: "People", label: "Staff documents", what: "Right to work, DBS and other documents on a person's file, and their evidence pack.", paths: ["/org/hr/documents", "/org/staff/*/documents", "/org/staff/*/evidence"] },
  { key: "people.clients", group: "People", label: "Clients", what: "The client list and each client's record.", paths: ["/org/clients"] },
  { key: "people.recruitment", group: "People", label: "Recruitment", what: "Candidates, interviews, references, offers and starter forms.", paths: ["/org/recruitment"] },
  { key: "people.absence", group: "People", label: "Absence, holidays and leavers", what: "Sickness, leave requests, allowances, probation reviews and leavers.", paths: ["/org/hr/absence", "/org/hr/holidays", "/org/hr/probation", "/org/hr/leavers", "/org/staff/*/absence", "/org/staff/*/leave", "/org/staff/*/probation"] },
  { key: "people.cases", group: "People", label: "Disciplinary and grievance", what: "Cases, meetings, letters and statements.", paths: ["/org/hr/cases"] },
  { key: "training.courses", group: "Training", label: "Courses, certificates and the Care Certificate", what: "Assigning training, certificates, observations and sign-off.", paths: ["/org/courses", "/org/certificates", "/org/observations"] },
  { key: "training.sessions", group: "Training", label: "Face-to-face and classroom", what: "Sessions, bookings and attendance.", paths: ["/org/face-to-face", "/org/classroom"] },
  { key: "compliance.checks", group: "Compliance", label: "Supervisions, appraisals, spot checks and competency", what: "Booking, holding and recording them; who's due.", paths: ["/org/due/supervisions", "/org/due/appraisals", "/org/due/spot-checks", "/org/due/competency", "/org/staff/*/supervisions", "/org/staff/*/spot-checks", "/org/staff/*/competency", "/org/staff/*/appraisals"] },
  { key: "compliance.pips", group: "Compliance", label: "Performance plans", what: "Improvement goals and reviews.", paths: ["/org/pips", "/org/staff/*/pips"] },
  { key: "compliance.audits", group: "Compliance", label: "Service audits and the governance report", what: "Infection control, files, medication and the monthly overview.", paths: ["/org/audits", "/org/due/audits"] },
  { key: "compliance.complaints", group: "Compliance", label: "Incidents, complaints and safeguarding", what: "Concerns, complaints, compliments and their papers.", paths: ["/org/complaints", "/org/incidents"] },
  { key: "compliance.feedback", group: "Compliance", label: "Feedback", what: "Surveys to clients, families and staff, and their answers.", paths: ["/org/feedback"] },
  { key: "documents.policies", group: "Documents", label: "Policies and forms", what: "The policy library, form records and logs.", paths: ["/org/policies", "/org/forms", "/org/due/policies", "/org/due/forms"] },
  { key: "documents.reports", group: "Documents", label: "Reports and exports", what: "Bespoke reports, CSV exports and the certificate pack.", paths: ["/org/reports"] },
];

export const AREA_KEYS = new Set(AREAS.map((a) => a.key));

/** The stored list, cleaned: known keys only, each once. */
export function sanitiseHiddenAreas(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((k): k is string => typeof k === "string" && AREA_KEYS.has(k)))];
}

function matches(path: string, pattern: string): boolean {
  const p = path.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/");
  const q = pattern.split("/");
  if (p.length < q.length) return false;
  return q.every((seg, i) => seg === "*" ? p[i] !== "" : seg === p[i]);
}

/** The area a path belongs to, or null (Today, search, settings, the rest). */
export function areaForPath(path: string): Area | null {
  // The more specific patterns (a person's documents) win over the staff file.
  let best: { area: Area; depth: number } | null = null;
  for (const area of AREAS) {
    for (const pattern of area.paths) {
      if (!matches(path, pattern)) continue;
      const depth = pattern.split("/").length;
      if (!best || depth > best.depth) best = { area, depth };
    }
  }
  return best?.area ?? null;
}

/** True when this path is in an area the office worker can't open. */
export function isHiddenPath(path: string, hidden: ReadonlySet<string> | readonly string[]): boolean {
  const set = hidden instanceof Set ? hidden : new Set(hidden);
  if (set.size === 0) return false;
  const area = areaForPath(path);
  return !!area && set.has(area.key);
}

/** The sections of a person's file (app/org/staff/[userId]/sections.ts) that belong to an area. */
export const SECTION_AREAS: Record<string, string> = {
  "care-certificate": "training.courses",
  supervisions: "compliance.checks",
  competency: "compliance.checks",
  documents: "people.documents",
  employment: "people.absence",
  complaints: "compliance.complaints",
  forms: "documents.policies",
  policies: "documents.policies",
};

/** The section keys an office worker can't open, given the areas that are off. */
export function sectionsHidden(hidden: ReadonlySet<string>): string[] {
  return Object.entries(SECTION_AREAS).filter(([, area]) => hidden.has(area)).map(([key]) => key);
}

/** Where an office worker lands when they open a page in an area that is off. */
export const MANAGERS_ONLY_PATH = "/org/managers-only";
