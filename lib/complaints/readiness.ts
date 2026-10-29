/**
 * What is still missing before a response goes out. Brought across from
 * MyRoster (src/lib/complaintReadiness.ts) on 29 Oct 2026 and fitted to this
 * site's stages.
 *
 * The gaps belong in front of the manager BEFORE anything is sent, not inside
 * the document: a note in the letter saying "resolve before issuing" travels
 * with it, and the half-finished version is the one that gets sent.
 *
 * Nothing here blocks. A manager may have a good reason to send early — the
 * council set a deadline, the carer is on leave. The job is to make sure
 * nobody sends an incomplete response by accident.
 *
 * Pure: no I/O.
 */

import { meetingNumber } from "./forms";
import { findingsOutstanding, recordFindings } from "./findings";

export interface ReadinessGap {
  id: string;
  /** One line, in the manager's language. */
  label: string;
  /** Why it matters for a document going to a council. */
  detail: string;
  /** "missing": a piece of the file is not there yet. "stale": it changed after the letter was drafted. */
  kind: "missing" | "stale";
}

interface Stage {
  id: string;
  name: string;
  kind: string;
}

interface Record_ {
  kind: string;
  people: unknown[];
  stageEntries: { stageId: string; status: string; formAnswers: Record<string, unknown>; updatedAt: string }[];
  documents: { stageId: string | null; fileName: string; uploadedAt: string }[];
}

const OPTIONAL = /^other$/i;
// The document stages a council expects to see something under. Matched on
// the default names; a company that renamed them still gets the rest.
const EVIDENCE = /statement|qa|spot.?check|training record|client visit/i;

/** Gaps worth raising before the outcome letter goes, and things that have moved since it was drafted. */
export function findReadinessGaps(record: Record_, stages: Stage[]): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  const entryFor = (id: string) => record.stageEntries.find((e) => e.stageId === id);
  const hasAnswers = (id: string) => Object.keys(entryFor(id)?.formAnswers ?? {}).length > 0;

  if (record.people.length === 0 && record.kind === "complaint") {
    gaps.push({
      id: "people",
      kind: "missing",
      label: "No staff named on this complaint",
      detail: "Without them the response cannot say who was involved, and nothing about them reaches their file.",
    });
  }

  const form = stages.find((s) => s.kind === "complaint_form");
  if (form && entryFor(form.id)?.status !== "done") {
    gaps.push({
      id: "complaint_form",
      kind: "missing",
      label: `"${form.name}" is not finished`,
      detail: "This is where the complaint as received is recorded. The council's own account should be on file.",
    });
  }

  // Follow-up is held after the response has gone: it is not a gap in it.
  for (const s of stages.filter((x) => x.kind === "meeting_minutes" && meetingNumber(x.name) !== 3)) {
    const e = entryFor(s.id);
    if (e?.status === "na" || e?.status === "done") continue;
    gaps.push({
      id: `meeting_${s.id}`,
      kind: "missing",
      label: hasAnswers(s.id) ? `"${s.name}" is not finished` : `"${s.name}" has no minutes`,
      detail: "The response draws on what was discussed and agreed. An unfinished meeting leaves a hole in the account.",
    });
  }

  for (const s of stages.filter((x) => x.kind === "document" && !OPTIONAL.test(x.name.trim()) && EVIDENCE.test(x.name))) {
    const e = entryFor(s.id);
    // Looked for and none held, or reviewed with nothing to upload, is an
    // answer — not something still to do.
    if (e?.status === "na" || e?.status === "done") continue;
    if (record.documents.some((d) => d.stageId === s.id)) continue;
    gaps.push({
      id: `evidence_${s.id}`,
      kind: "missing",
      label: `Nothing under "${s.name}"`,
      detail: /statement/i.test(s.name)
        ? "A response that reaches findings about a carer who was never asked for their account is hard to defend."
        : "The council will ask what your own monitoring showed. With nothing here the response can only say none was looked at.",
    });
  }

  const findings = recordFindings(stages, (id) => entryFor(id)?.formAnswers);
  const open = findingsOutstanding(findings);
  if (findings.length === 0 && stages.some((s) => (s.kind === "meeting_minutes" && meetingNumber(s.name) === 2) || s.kind === "action_plan")) {
    gaps.push({
      id: "findings",
      kind: "missing",
      label: "No finding recorded on any concern",
      detail: "Each thing that was raised wants its own answer — upheld, partly upheld or not — with the reason.",
    });
  } else if (open.length) {
    gaps.push({ id: "findings", kind: "missing", label: "Some concerns have no finding yet", detail: open.join("; ") + "." });
  }

  // Findings decided the duty of candour applies, and the letter has not gone.
  const candour = stages.find((s) => s.kind === "duty_of_candour");
  const saidCandour = stages.some((s) => entryFor(s.id)?.formAnswers?.tri_candour === true);
  if (candour && saidCandour && entryFor(candour.id)?.status !== "done") {
    gaps.push({
      id: "candour",
      kind: "missing",
      label: "The duty of candour letter has not gone",
      detail: "Findings says the duty of candour applies (Regulation 20). The person, or their family, should have it before the response.",
    });
  }
  if (record.kind === "complaint" && stages.some((s) => entryFor(s.id)?.formAnswers?.tri_safeguarding === true)) {
    gaps.push({
      id: "safeguarding",
      kind: "missing",
      label: "Findings says this needs a safeguarding referral",
      detail: "Change its type to safeguarding, or raise a safeguarding concern beside it, so the referral and CQC notification are recorded.",
    });
  }

  // ── Moved since the letter was drafted ──
  const letter = stages.find((s) => s.kind === "outcome_letter");
  const draft = letter ? entryFor(letter.id) : undefined;
  if (draft && typeof draft.formAnswers.body === "string" && draft.formAnswers.body.trim() && draft.status !== "done") {
    const drafted = new Date(draft.updatedAt).getTime();
    const newer = (iso: string) => new Date(iso).getTime() > drafted;
    const newDocs = record.documents.filter((d) => newer(d.uploadedAt));
    if (newDocs.length) {
      gaps.push({
        id: "new_documents",
        kind: "stale",
        label: `${newDocs.length} document${newDocs.length === 1 ? "" : "s"} added since the letter was last saved`,
        detail: newDocs.map((d) => d.fileName).join(", "),
      });
    }
    const moved = record.stageEntries.filter((e) => e.stageId !== letter!.id && newer(e.updatedAt));
    if (moved.length) {
      gaps.push({
        id: "stages_moved",
        kind: "stale",
        label: "Parts of the file have changed since the letter was last saved",
        detail: moved.map((e) => stages.find((s) => s.id === e.stageId)?.name).filter(Boolean).join(", ") || "One or more stages changed.",
      });
    }
  }

  return gaps;
}
