/**
 * Supervisions and appraisals — the employer's record of a conversation.
 *
 * Deliberately plain, because this is the template for the record types after
 * it: a dated record, held by somebody, about somebody, with a summary and a
 * next-due date. What was agreed does not live in the summary text — it goes
 * to record_actions, where it joins everything else outstanding for that carer
 * and can actually be chased.
 *
 * The dated-record half it shares with spot checks — next due, and what was
 * agreed — lives in lib/records.ts. Pure except for the loader.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

export interface Supervision {
  id: string;
  kind: string;
  held_on: string;
  summary: string | null;
  next_due: string | null;
  supervisor_name: string | null;
}

/** The next-due date that matters: the latest record's, since it supersedes. */
export function nextDueOf(supervisions: Supervision[]): string | null {
  return supervisions[0]?.next_due ?? null;
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
