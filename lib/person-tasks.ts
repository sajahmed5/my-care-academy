/**
 * Everything outstanding for one person, as one list.
 *
 * The platform already knew most of this and said it on a different screen
 * each time: overdue training on the staff page, an expiring certificate in
 * the certificates area, an action agreed in a supervision nowhere at all.
 * A manager does not think in screens — they think "what does Jane still owe
 * me?".
 *
 * Derived first, stored second. Training due dates and certificate expiries
 * are computed from the rows that already exist; only an action somebody wrote
 * down needs a table of its own (record_actions, 20261023200000). They are
 * unioned here, at read time, rather than synced — two copies of "this course
 * is due on the 14th" would disagree within a week, and the stale one would be
 * the one a manager acted on.
 *
 * Pure except for `loadPersonActions`, so the ordering rules can be tested
 * without a database.
 */

import type { StaffDocTask } from "./staff-documents";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Certificate, Enrolment } from "./learner-data";
import { daysUntil, expiryFlag, isExpired, isOverdue } from "./engine-logic";

/** Inside this many days, a dated thing is "soon" rather than merely pending. */
export const DUE_SOON_DAYS = 30;

export type TaskKind = "training" | "certificate" | "action" | "form" | "document";

export type TaskUrgency = "overdue" | "due_soon" | "open";

export interface PersonTask {
  /** Stable within one render; derived tasks have no database row of their own. */
  key: string;
  kind: TaskKind;
  title: string;
  detail: string | null;
  /** ISO date, or null for "when you can". */
  dueDate: string | null;
  urgency: TaskUrgency;
  /**
   * Set only for stored actions. A derived task is completed by doing the
   * work — ticking off "Complete Moving & Handling" without taking the course
   * would be a lie the training record immediately contradicts.
   */
  actionId: string | null;
  source: string;
}

/** A row of record_actions, as the file reads it. */
export interface ActionRow {
  id: string;
  title: string;
  detail: string | null;
  due_date: string | null;
  source_type: string;
  completed_at: string | null;
}

/** An open ask to complete a form, as the task list needs it. */
export interface FormAsk {
  id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Added by a manager",
  supervision: "From a supervision",
  competency: "From a spot check",
  complaint: "From a complaint",
  audit: "From an audit",
  client_qa: "From a client QA",
};

const URGENCY_ORDER: Record<TaskUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  open: 2,
};

function urgencyOf(dueDate: string | null, now: Date): TaskUrgency {
  if (!dueDate) return "open";
  const due = new Date(dueDate);
  if (due.getTime() < now.getTime()) return "overdue";
  return daysUntil(due, now) <= DUE_SOON_DAYS ? "due_soon" : "open";
}

/**
 * Sort: what is late, then what is close, then the rest. Within a group,
 * soonest first, and undated last — an undated action is a note to self and
 * must never sit above a course that was due on Friday.
 */
function compare(a: PersonTask, b: PersonTask): number {
  const byUrgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
  if (byUrgency !== 0) return byUrgency;
  if (a.dueDate && b.dueDate) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  } else if (a.dueDate !== b.dueDate) {
    return a.dueDate ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

export function buildPersonTasks({
  enrolments,
  certificates,
  actions,
  forms = [],
  documents = [],
  now,
}: {
  enrolments: Enrolment[];
  certificates: Certificate[];
  actions: ActionRow[];
  forms?: FormAsk[];
  /** Compliance documents expired, expiring or missing (lib/staff-documents). */
  documents?: StaffDocTask[];
  now: Date;
}): PersonTask[] {
  const tasks: PersonTask[] = [];

  // Training still to do. Completed and expired enrolments are a record, not
  // an obligation: an expired one comes back as a renewal below if it had a
  // certificate, and as a fresh assignment if the manager reassigns it.
  const outstandingCourses = new Set<string>();
  for (const e of enrolments) {
    if (e.status === "completed" || e.status === "expired") continue;
    outstandingCourses.add(e.course_id);
    tasks.push({
      key: `enrolment:${e.id}`,
      kind: "training",
      title: `Complete ${e.title}`,
      detail: null,
      dueDate: e.due_date,
      urgency: isOverdue(e.due_date, e.status, now)
        ? "overdue"
        : urgencyOf(e.due_date, now),
      actionId: null,
      source: "Training",
    });
  }

  // Certificates at or near expiry. Skipped where the course is already on the
  // list: "renew Moving & Handling" under "complete Moving & Handling" is the
  // same job written twice, and a list that repeats itself stops being read.
  for (const c of certificates) {
    if (outstandingCourses.has(c.course_id)) continue;
    const expires = c.expires_at ? new Date(c.expires_at) : null;
    const flag = expiryFlag(expires, now);
    if (flag !== "red" && flag !== "amber") continue;
    const expired = isExpired(expires, now);
    tasks.push({
      key: `certificate:${c.id}`,
      kind: "certificate",
      title: `${expired ? "Renew" : "Renew soon"}: ${c.title}`,
      detail: expired
        ? "The certificate has expired."
        : "The certificate is close to expiry.",
      dueDate: c.expires_at,
      urgency: expired ? "overdue" : "due_soon",
      actionId: null,
      source: "Certificate",
    });
  }

  // What somebody wrote down. Completed actions stay in the table as evidence
  // but are not outstanding, so they are not tasks.
  for (const a of actions) {
    if (a.completed_at) continue;
    tasks.push({
      key: `action:${a.id}`,
      kind: "action",
      title: a.title,
      detail: a.detail,
      dueDate: a.due_date,
      urgency: urgencyOf(a.due_date, now),
      actionId: a.id,
      source: SOURCE_LABEL[a.source_type] ?? "Action",
    });
  }

  // Forms a manager has asked for. Completed by submitting the form, so no
  // tick here — the same rule as training.
  for (const f of forms) {
    if (f.completed_at) continue;
    tasks.push({
      key: `form:${f.id}`,
      kind: "form",
      title: `Complete ${f.title}`,
      detail: null,
      dueDate: f.due_date,
      urgency: urgencyOf(f.due_date, now),
      actionId: null,
      source: "Form",
    });
  }

  // Right to work, DBS, references, insurance: renewed or added by uploading
  // on their file, so no tick here either.
  for (const d of documents) {
    tasks.push({
      key: d.key,
      kind: "document",
      title: d.title,
      detail: d.detail,
      dueDate: d.dueDate,
      urgency: d.urgency,
      actionId: null,
      source: "Staff documents",
    });
  }

  return tasks.sort(compare);
}

/**
 * Actions for one person, outstanding and completed alike — the file shows
 * what is done as well as what is not, because "this was dealt with on the
 * 3rd" is the half an inspector asks about.
 *
 * RLS scopes it: an org_admin sees their organisation, a carer sees their own.
 */
export async function loadPersonActions(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActionRow[]> {
  const { data } = await supabase
    .from("record_actions")
    .select("id, title, detail, due_date, source_type, completed_at")
    .eq("user_id", userId)
    .order("completed_at", { nullsFirst: true })
    .order("due_date", { nullsFirst: false })
    .limit(200);
  return (data ?? []) as ActionRow[];
}
