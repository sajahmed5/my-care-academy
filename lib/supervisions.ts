/**
 * Supervisions and appraisals — the employer's record of a conversation.
 *
 * Deliberately plain, because this is the template for the record types after
 * it: a dated record, held by somebody, about somebody, with a summary and a
 * next-due date. What was agreed does not live in the summary text — it goes
 * to record_actions, where it joins everything else outstanding for that carer
 * and can actually be chased.
 *
 * Pure except for the loader, so the rules can be tested without a database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { daysUntil } from "./engine-logic";

/** How soon a next-due date counts as imminent rather than merely planned. */
export const DUE_SOON_DAYS = 30;

export const SUPERVISION_KINDS = [
  { value: "supervision", label: "Supervision" },
  { value: "appraisal", label: "Appraisal" },
  { value: "probation", label: "Probation review" },
  { value: "return_to_work", label: "Return to work" },
] as const;

export type SupervisionKind = (typeof SUPERVISION_KINDS)[number]["value"];

export function kindLabel(value: string): string {
  return SUPERVISION_KINDS.find((k) => k.value === value)?.label ?? value;
}

export type DueStatus = "overdue" | "due_soon" | "scheduled" | "none";

export interface Supervision {
  id: string;
  kind: string;
  held_on: string;
  summary: string | null;
  next_due: string | null;
  supervisor_name: string | null;
}

/**
 * Where a next-due date stands. "none" is not a failure state — a supervision
 * with nothing scheduled after it is ordinary, and saying "not scheduled" is
 * more use to a manager than inventing a date would be.
 */
export function dueStatus(nextDue: string | null, now: Date): DueStatus {
  if (!nextDue) return "none";
  const due = new Date(nextDue);
  if (due.getTime() < now.getTime()) return "overdue";
  return daysUntil(due, now) <= DUE_SOON_DAYS ? "due_soon" : "scheduled";
}

/** The next-due date that matters: the latest record's, since it supersedes. */
export function nextDueOf(supervisions: Supervision[]): string | null {
  return supervisions[0]?.next_due ?? null;
}

export const MAX_AGREED_ACTIONS = 20;
const MAX_ACTION_TITLE = 200;

/**
 * Turn the "what was agreed" box into actions, one per line.
 *
 * A textarea rather than a row of inputs because this is typed up straight
 * after the conversation, often on a phone. Blank lines and stray bullets are
 * what people actually paste in, so they are tidied rather than rejected —
 * refusing the save would lose the note as well as the actions.
 */
export function parseAgreedActions(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.replace(/^[-*•\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_AGREED_ACTIONS)
    .map((line) => line.slice(0, MAX_ACTION_TITLE));
}

export async function loadSupervisions(
  supabase: SupabaseClient,
  userId: string,
): Promise<Supervision[]> {
  const { data } = await supabase
    .from("supervisions")
    .select("id, kind, held_on, summary, next_due, supervisor:users!supervisions_supervisor_id_fkey (full_name, email)")
    .eq("user_id", userId)
    .order("held_on", { ascending: false })
    .limit(100);

  return (data ?? []).map((row) => {
    // PostgREST gives an embedded row as an object, or an array when it cannot
    // prove the relationship is to-one.
    const raw = (row as { supervisor?: unknown }).supervisor;
    const supervisor = (Array.isArray(raw) ? raw[0] : raw) as
      | { full_name?: string | null; email?: string | null }
      | undefined;
    return {
      id: row.id as string,
      kind: row.kind as string,
      held_on: row.held_on as string,
      summary: (row.summary as string | null) ?? null,
      next_due: (row.next_due as string | null) ?? null,
      supervisor_name: supervisor?.full_name ?? supervisor?.email ?? null,
    };
  });
}
