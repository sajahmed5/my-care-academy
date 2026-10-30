import { nextReview, schedule, type Employment, type ProbationSettings, type ReviewRecord, type ScheduleLine } from "./probation";

/**
 * Who's due a probation review across the company: the list, the weekly
 * email and the Overview all count from here. Pure.
 */

export interface ProbationDueRow {
  person: { id: string; name: string };
  next: ScheduleLine | null;
  group: "overdue" | "due_soon" | "booked" | "later" | "no_start";
}

export function probationDue(
  people: Array<{ id: string; name: string }>,
  emps: Array<Employment & { user_id: string }>,
  reviews: Array<ReviewRecord & { user_id: string }>,
  s: ProbationSettings,
  todayIso: string,
): ProbationDueRow[] {
  const empBy = new Map(emps.map((e) => [e.user_id, e]));
  const out: ProbationDueRow[] = [];
  for (const person of people) {
    const emp = empBy.get(person.id) ?? null;
    if (emp?.probation_status === "none" || emp?.probation_status === "passed" || emp?.probation_status === "not_passed") continue;
    if (!emp?.start_date) {
      out.push({ person, next: null, group: "no_start" });
      continue;
    }
    const lines = schedule(emp, s, reviews.filter((r) => r.user_id === person.id), todayIso);
    const next = nextReview(emp, lines);
    if (!next) continue;
    out.push({ person, next, group: next.state === "held" || next.state === "skipped" ? "later" : next.state });
  }
  return out.sort((a, b) => (a.next?.dueOn ?? "9999").localeCompare(b.next?.dueOn ?? "9999") || a.person.name.localeCompare(b.person.name));
}
