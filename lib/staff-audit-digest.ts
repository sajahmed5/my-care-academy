/**
 * Staff Audits in the weekly email (STAFF-AUDITS.md, Who's due): per audit,
 * and per competency skill, how many are overdue and how many fall due in the
 * next 30 days — the same buildDueRows() the Who's due lists use, so the
 * email and the pages never disagree.
 *
 * Pure: the weekly job reads the rows, this decides what the email says.
 */

import { buildDueRows, type DuePerson, type DueRecord } from "./due-view";
import { esc } from "./email-layout";

export interface DigestLine {
  label: string;
  overdue: number;
  dueSoon: number;
  never: number;
  /** Where the manager goes to see who. */
  href: string;
}

export interface StaffAuditDigestInput {
  /** Current carers, and office staff (supervisions and appraisals only). */
  carers: DuePerson[];
  staff: DuePerson[];
  supervisions: (DueRecord & { kind: string })[];
  spotChecks: DueRecord[];
  /** Each carries its skill in `area`. */
  competency: DueRecord[];
  /** The skills the company assesses, in order. */
  areas: { key: string; label: string }[];
  meetings: boolean;
  checks: boolean;
  now: Date;
}

function count(label: string, href: string, people: DuePerson[], records: DueRecord[], now: Date, perArea = false): DigestLine {
  const rows = buildDueRows(people, perArea ? records : records.map((r) => ({ ...r, area: undefined })), now);
  return {
    label,
    href,
    overdue: rows.filter((r) => r.status === "overdue").length,
    dueSoon: rows.filter((r) => r.status === "due_soon").length,
    // Per skill, "never assessed" is every carer in every skill until the
    // company starts, eight lines of it; the skill's own list says who.
    never: perArea ? 0 : rows.filter((r) => r.status === "never").length,
  };
}

/** The lines worth sending: anything overdue, due soon or never done. */
export function staffAuditDigest(input: StaffAuditDigestInput): DigestLine[] {
  const lines: DigestLine[] = [];
  const { now } = input;
  if (input.meetings) {
    lines.push(count("Supervisions", "/org/due/supervisions", input.staff, input.supervisions.filter((s) => s.kind === "supervision"), now));
    lines.push(count("Appraisals", "/org/due/appraisals", input.staff, input.supervisions.filter((s) => s.kind === "appraisal"), now));
  }
  if (input.checks) {
    lines.push(count("Spot checks", "/org/due/spot-checks", input.carers, input.spotChecks, now));
    for (const a of input.areas) {
      lines.push(
        count(`Competency: ${a.label}`, `/org/due/competency?area=${a.key}`, input.carers, input.competency.filter((c) => c.area === a.key), now, true),
      );
    }
  }
  return lines.filter((l) => l.overdue + l.dueSoon + l.never > 0);
}

/** The section of the weekly email, or "" when there is nothing to say. */
export function staffAuditDigestHtml(lines: DigestLine[], origin: string): string {
  if (lines.length === 0) return "";
  const part = (n: number, what: string) => (n ? `${n} ${what}` : null);
  const items = lines
    .map((l) => {
      const said = [part(l.overdue, "overdue"), part(l.dueSoon, "due in the next 30 days"), part(l.never, "never had one")]
        .filter(Boolean)
        .join(", ");
      return `<li><a href="${esc(origin + l.href)}">${esc(l.label)}</a>: ${said}</li>`;
    })
    .join("");
  return `<p style="margin-top:20px"><strong>Staff audits</strong></p><ul>${items}</ul>`;
}
