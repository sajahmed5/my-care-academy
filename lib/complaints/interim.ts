/**
 * What an interim update says is done and still to come, worked out from the
 * file. Brought across from MyRoster (src/lib/complaintInterimLetter.ts) on
 * 29 Oct 2026.
 *
 * Councils chase, and the honest position is usually "we are part way
 * through, here is what we have, here is what is still coming and when".
 * The list is COMPUTED, not written by anyone: a letter promising "meeting
 * minutes to follow" when the meeting is already on file, or silently
 * leaving out the duty of candour letter nobody has done, is exactly the sort
 * of thing that gets noticed.
 *
 * AI drafting (COMPLAINTS-SAFEGUARDING.md) is not built yet: when it arrives
 * with recruitment's AI release, it drafts the "what we have found so far"
 * paragraph (complaints.interim_findings) and the acknowledgement and
 * outcome letters from what is on file only, and a person checks and sends.
 *
 * Pure: no I/O.
 */

export interface OutstandingItem {
  /** What it is, in the council's language. */
  label: string;
  /** Why it is not here yet. */
  because: string;
}

interface Stage {
  id: string;
  name: string;
  kind: string;
}

interface Record_ {
  stageEntries: { stageId: string; status: string }[];
  documents: { stageId: string | null }[];
  pips: { carerName: string; status: string; kind: string }[];
}

/**
 * Our acknowledgement is a letter they already have — not a piece of the
 * file to list as held or outstanding in an update to the same person.
 * "Other" is a place to put things, not a thing we owe them.
 */
const skip = (s: Stage) => s.kind === "acknowledgement" || /^other$/i.test(s.name.trim());

/** The stage's own status decides: a half-typed Triage is not something we hold. */
const held = (r: Record_, s: Stage) =>
  r.stageEntries.find((e) => e.stageId === s.id)?.status === "done" || r.documents.some((d) => d.stageId === s.id);
const notNeeded = (r: Record_, s: Stage) => r.stageEntries.find((e) => e.stageId === s.id)?.status === "na";

/** What we still owe them, in the stage's own words. */
export function outstandingItems(record: Record_, stages: Stage[]): OutstandingItem[] {
  const out: OutstandingItem[] = [];
  for (const s of stages) {
    if (skip(s) || notNeeded(record, s) || held(record, s)) continue;
    switch (s.kind) {
      case "meeting_minutes":
        out.push({ label: s.name, because: "This meeting has not taken place yet. The minutes will follow once it has." });
        break;
      case "duty_of_candour":
        out.push({ label: s.name, because: "To be issued once we have finished establishing the facts, so that what we tell the family is accurate." });
        break;
      case "outcome_letter":
        out.push({ label: "Our letter on what we found", because: "It will set out what we found on each concern and what we are doing about it, and follows once the enquiry is complete." });
        break;
      case "document":
        out.push({
          label: s.name,
          because: /statement/i.test(s.name)
            ? "We are waiting on the carer's own account. We will not reach a finding about them without it."
            : "Being gathered and checked before we rely on it.",
        });
        break;
      default:
        out.push({ label: s.name, because: "Still outstanding." });
    }
  }
  // Performance plans run to their own clock and are usually the longest pole.
  for (const p of record.pips.filter((x) => x.status === "open")) {
    out.push({
      label: `${p.kind === "disciplinary" ? "Disciplinary process" : "Performance improvement plan"} for ${p.carerName}: outcome`,
      because: "The plan is under way. Its outcome will follow once its reviews are complete.",
    });
  }
  return out;
}

/** What is already done, so the letter shows progress, not just apologies. */
export function completedItems(record: Record_, stages: Stage[]): string[] {
  return stages.filter((s) => !skip(s) && held(record, s)).map((s) => s.name);
}
