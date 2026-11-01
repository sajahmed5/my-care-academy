import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "./fetch-all";
import { buildDueRows, type DueBooking, type DuePerson, type DueRecord, type DueRow, type DueRowStatus } from "./due-view";
import { formatDate } from "./dates";

/**
 * Where each person stands on their supervision and their appraisal: the
 * pills on the staff list, the checklist on a person's Overview, and the
 * "Supervisions up to date" card on Today (redesign, 1 Nov 2026). One read
 * of the company's supervisions and bookings, then buildDueRows() — the same
 * arithmetic as Who's due, so the three never disagree.
 */
export interface PersonChecks {
  supervision: DueRow;
  appraisal: DueRow;
}

export type StaffChecks = Map<string, PersonChecks>;

export async function loadStaffChecks(
  supabase: SupabaseClient,
  organisationId: string,
  people: DuePerson[],
  now: Date = new Date(),
): Promise<StaffChecks> {
  const [supervisions, bookings] = await Promise.all([
    fetchAll((f, t) =>
      supabase
        .from("supervisions")
        .select("user_id, kind, held_on, next_due")
        .eq("organisation_id", organisationId)
        .in("kind", ["supervision", "appraisal"])
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) =>
      supabase
        .from("staff_audit_bookings")
        .select("user_id, kind, booked_on")
        .eq("organisation_id", organisationId)
        .eq("status", "booked")
        .order("id")
        .range(f, t),
    ),
  ]);
  const records = (kind: string): DueRecord[] =>
    supervisions
      .filter((s) => s.kind === kind)
      .map((s) => ({ userId: s.user_id as string, heldOn: s.held_on as string, nextDue: (s.next_due as string | null) ?? null }));
  const booked = (kind: string): DueBooking[] =>
    bookings.filter((b) => b.kind === kind).map((b) => ({ userId: b.user_id as string, on: b.booked_on as string }));
  const out: StaffChecks = new Map();
  const sup = new Map(buildDueRows(people, records("supervision"), now, booked("supervision")).map((r) => [r.person.id, r]));
  const app = new Map(buildDueRows(people, records("appraisal"), now, booked("appraisal")).map((r) => [r.person.id, r]));
  for (const p of people) {
    const s = sup.get(p.id);
    const a = app.get(p.id);
    if (s && a) out.set(p.id, { supervision: s, appraisal: a });
  }
  return out;
}

/** Late: overdue, or never had one. */
export const isLate = (row: DueRow | undefined): boolean => !!row && (row.status === "overdue" || row.status === "never");

/**
 * What the pill says for one person's supervision or appraisal, and its
 * colour. "Never had one" and "Overdue" are red; due inside the month is
 * amber; a booked date, or one further off, is calm.
 */
export function checkPill(
  row: DueRow | undefined,
  now: Date = new Date(),
): { label: string; tone: "danger" | "warn" | "ok" | "muted" } {
  if (!row) return { label: "—", tone: "muted" };
  const day = (d: string) => formatDate(d, { day: "numeric", month: "short" });
  if (row.booked && row.status !== "overdue") return { label: `Booked ${day(row.booked)}`, tone: "ok" };
  switch (row.status) {
    case "never":
      return { label: "Never had one", tone: "danger" };
    case "overdue": {
      const days = Math.floor((now.getTime() - new Date(row.next!).getTime()) / 86_400_000);
      return { label: days >= 14 ? `Overdue ${Math.floor(days / 7)} weeks` : days >= 1 ? `Overdue ${days} day${days === 1 ? "" : "s"}` : "Overdue", tone: "danger" };
    }
    case "due_soon": {
      const days = Math.ceil((new Date(row.next!).getTime() - now.getTime()) / 86_400_000);
      return { label: days <= 14 ? `Due in ${days} day${days === 1 ? "" : "s"}` : `Due ${day(row.next!)}`, tone: "warn" };
    }
    case "scheduled":
      return { label: `Due ${formatDate(row.next!, { month: "short", year: "numeric" })}`, tone: "ok" };
    default:
      return { label: "No date set", tone: "muted" };
  }
}

/** The order of urgency, for sorting a list by a check. */
export const CHECK_ORDER: DueRowStatus[] = ["overdue", "never", "due_soon", "none", "scheduled"];
