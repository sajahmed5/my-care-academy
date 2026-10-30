/**
 * One client over time (SERVICE-AUDITS.md, The client page): their QAs,
 * audits, spot checks, concerns and compliments as one list, newest first,
 * so a manager — or an inspector — sees how their care has gone.
 *
 * Pure: the page reads each kind of record, this puts them in one order.
 */

import { QA_HEADINGS, type QaHeading } from "./client-qa";

export type HistoryKind = "qa" | "audit" | "spot_check" | "concern" | "compliment";

export const HISTORY_LABEL: Record<HistoryKind, string> = {
  qa: "Client QA",
  audit: "Audit",
  spot_check: "Spot check",
  concern: "Concern",
  compliment: "Compliment",
};

export interface HistoryEntry {
  kind: HistoryKind;
  date: string;
  title: string;
  detail: string | null;
  href: string | null;
  /** Something to look at: a low score, an open concern, a check not met. */
  flag: boolean;
}

export interface QaRow {
  id: string;
  held_on: string;
  completed: boolean;
  method: string;
  score: number | null;
  review_status: string;
  ratings: Partial<Record<QaHeading, number | null>>;
}

export interface HistoryInput {
  qas: QaRow[];
  audits: { id: string; title: string; held_on: string; score: number | null; review_status: string }[];
  spotChecks: { id: string; checked_on: string; outcome: string; outcomeLabel: string; carer: string | null; userId: string }[];
  concerns: { id: string; reference: string; kindLabel: string; statusLabel: string; status: string; reported_on: string; description: string }[];
  compliments: { id: string; receivedOn: string; whatWasSaid: string; people: string[] }[];
  reviewBelow: number;
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildClientHistory(input: HistoryInput): HistoryEntry[] {
  const entries: HistoryEntry[] = [
    ...input.qas.map((q) => ({
      kind: "qa" as const,
      date: q.held_on,
      title: q.completed ? `Client QA by ${q.method === "phone" ? "phone" : "visit"}` : "Client QA — couldn't be done",
      detail: q.completed
        ? `${QA_HEADINGS.map((h) => `${h.label} ${q.ratings[h.key] ?? "–"}`).join(" · ")}${q.score !== null ? ` · ${q.score}%` : ""}`
        : null,
      href: `/org/audits/qa/${q.id}`,
      flag: q.review_status === "waiting" || (q.score !== null && q.score < input.reviewBelow),
    })),
    ...input.audits.map((a) => ({
      kind: "audit" as const,
      date: a.held_on,
      title: a.title,
      detail: a.score !== null ? `${a.score}% met${a.review_status === "waiting" ? " · waiting for review" : ""}` : null,
      href: `/org/audits/${a.id}`,
      flag: a.review_status === "waiting" || (a.score !== null && a.score < input.reviewBelow),
    })),
    ...input.spotChecks.map((s) => ({
      kind: "spot_check" as const,
      date: s.checked_on,
      title: `Spot check${s.carer ? ` of ${s.carer}` : ""}`,
      detail: s.outcomeLabel,
      href: `/org/staff/${s.userId}?section=competency`,
      flag: s.outcome !== "met",
    })),
    ...input.concerns.map((c) => ({
      kind: "concern" as const,
      date: c.reported_on,
      title: `${c.kindLabel} ${c.reference}`,
      detail: `${c.statusLabel} · ${clip(c.description)}`,
      href: `/org/complaints/${c.id}`,
      flag: c.status === "open",
    })),
    ...input.compliments.map((c) => ({
      kind: "compliment" as const,
      date: c.receivedOn,
      title: c.people.length ? `Compliment for ${c.people.join(", ")}` : "Compliment",
      detail: clip(c.whatWasSaid),
      href: "/org/complaints/compliments",
      flag: false,
    })),
  ];
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** Each heading's average across a client's QAs that were done, for the trend at the top. */
export function qaAverages(qas: QaRow[]): Record<QaHeading, number | null> {
  const done = qas.filter((q) => q.completed);
  return Object.fromEntries(
    QA_HEADINGS.map((h) => {
      const v = done.map((q) => q.ratings[h.key]).filter((x): x is number => typeof x === "number");
      return [h.key, v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null];
    }),
  ) as Record<QaHeading, number | null>;
}
