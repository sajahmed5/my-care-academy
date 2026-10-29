/**
 * The legal reminders a concern carries, shown the moment it is triaged
 * (COMPLAINTS-SAFEGUARDING.md, agreed 29 Oct 2026).
 *
 * Safeguarding: the council's safeguarding team, CQC, the police where a
 * crime may have happened, and — only once someone has been removed from
 * working with people — a DBS barring referral. An accident: RIDDOR.
 *
 * The site never files any of these. A manager confirms each one, and the
 * confirmation (who, when) is kept on the record in complaints.reminders.
 * What a stage's answers already show — a referral date, a "No" with its
 * reason — counts as dealt with, so nobody is asked to confirm twice.
 *
 * Pure: no I/O.
 */

export interface Reminder {
  key: string;
  title: string;
  body: string;
  /** Said more firmly: the answers so far suggest it does apply. */
  likely?: boolean;
  /** Dealt with, by a confirmation or by what the stage records. */
  done: { how: string } | null;
}

export interface ReminderConfirmation {
  at: string;
  byName: string | null;
}

/** Answers keyed by stage kind: the reminders read them, not the stage ids. */
export type AnswersByKind = Record<string, Record<string, unknown> | undefined>;

const ukDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** confirmations is complaints.reminders, read loosely: anything malformed is ignored. */
export function readConfirmations(raw: unknown): Record<string, ReminderConfirmation> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ReminderConfirmation> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === "object" && typeof (v as { at?: unknown }).at === "string") {
      out[k] = { at: (v as { at: string }).at, byName: ((v as { byName?: string | null }).byName ?? null) || null };
    }
  }
  return out;
}

/** What a stage's own answers say about a reminder: done, and how — or nothing. */
function fromAnswers(a: Record<string, unknown> | undefined, needed: string, date: string, ref?: string): { how: string } | null {
  if (!a) return null;
  if (a[needed] === false && typeof a[`${needed.split("_")[0]}_why_not`] === "string") return { how: "Recorded as not needed, with the reason" };
  if (a[needed] === true && typeof a[date] === "string" && a[date]) {
    const r = ref && typeof a[ref] === "string" && a[ref] ? `, reference ${a[ref] as string}` : "";
    return { how: `Done ${ukDate(a[date] as string)}${r}` };
  }
  return null;
}

export function remindersFor(
  kind: string,
  answers: AnswersByKind,
  confirmations: Record<string, ReminderConfirmation>,
  opts: { council?: string | null } = {},
): Reminder[] {
  const confirmed = (key: string) => {
    const c = confirmations[key];
    return c ? { how: `Confirmed${c.byName ? ` by ${c.byName}` : ""} on ${ukDate(c.at)}` } : null;
  };
  const list: Reminder[] = [];

  if (kind === "safeguarding") {
    const council = opts.council ? `${opts.council}'s` : "the council's";
    list.push(
      {
        key: "council",
        title: `Refer to ${council} safeguarding team`,
        body: "Where an adult with care and support needs may be experiencing, or at risk of, abuse or neglect, the council must be told — the same day, under most councils' procedures. Note the date and their reference.",
        done: fromAnswers(answers.sg_referral, "sgr_needed", "sgr_date", "sgr_reference"),
      },
      {
        key: "cqc",
        title: "Notify CQC",
        body: "Abuse, or an allegation of abuse, involving someone you care for is notified to CQC without delay (Regulation 18, CQC (Registration) Regulations 2009), through the CQC provider portal.",
        done: fromAnswers(answers.sg_cqc, "sgc_needed", "sgc_date", "sgc_reference"),
      },
      {
        key: "police",
        title: "Tell the police if a crime may have happened",
        body: "Theft, assault, sexual abuse and wilful neglect are crimes. If anyone is in immediate danger, call 999. Keep any evidence as it is.",
        done: fromAnswers(answers.sg_police, "sgp_needed", "sgp_date", "sgp_reference"),
      },
    );
    // Only once someone has been removed: before that it is a worry, not a duty.
    const lessons = answers.sg_lessons;
    if (lessons?.sgl_removed === true) {
      list.push({
        key: "dbs",
        title: "Refer to the DBS for barring",
        body: "Someone was dismissed or removed from working with people because they harmed, or put at risk, someone in your care. The Safeguarding Vulnerable Groups Act 2006 says you must refer them to the DBS — even if they resigned first.",
        likely: true,
        done:
          typeof lessons.sgl_dbs_date === "string" && lessons.sgl_dbs_date
            ? { how: `Done ${ukDate(lessons.sgl_dbs_date)}` }
            : null,
      });
    }
  }

  if (kind === "accident") {
    const a = answers.accident_report ?? {};
    const staff = a.ar_who === "staff";
    const likely =
      a.ar_specified === true ||
      (staff && a.ar_off_work === "over_7") ||
      (!staff && !!a.ar_who && a.ar_treatment === "hospital" && a.ar_work_related === true);
    const why = a.ar_specified === true
      ? "It was a specified injury."
      : staff && a.ar_off_work === "over_7"
        ? "A member of staff is off, or on light duties, for more than seven days."
        : likely
          ? "Someone who is not staff was taken to hospital, and the accident arose from the work."
          : "";
    list.push({
      key: "riddor",
      title: likely ? "This looks reportable to the HSE under RIDDOR" : "Check whether RIDDOR applies",
      body: `${why ? `${why} ` : ""}Report to the HSE: a death or specified injury without delay and within 10 days; a member of staff off for more than seven days within 15 days; someone who is not staff taken straight to hospital because of the work within 10 days. Report online at hse.gov.uk/riddor.`,
      likely,
      done:
        a.ar_riddor === true && typeof a.ar_riddor_date === "string" && a.ar_riddor_date
          ? { how: `Reported ${ukDate(a.ar_riddor_date)}${typeof a.ar_riddor_ref === "string" && a.ar_riddor_ref ? `, reference ${a.ar_riddor_ref}` : ""}` }
          : a.ar_riddor === false && typeof a.ar_riddor_why === "string" && a.ar_riddor_why
            ? { how: "Recorded as not reportable, with the reason" }
            : null,
    });
  }

  return list.map((r) => ({ ...r, done: r.done ?? confirmed(r.key) }));
}

/** The keys a manager can confirm. A form field is not a permission check. */
export const REMINDER_KEYS = ["council", "cqc", "police", "dbs", "riddor"] as const;
