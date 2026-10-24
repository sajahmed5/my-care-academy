import { describe, expect, it } from "vitest";
import {
  REQUIRED_DOCS,
  checklist,
  docState,
  notReadyMessage,
  outstandingDocs,
  type CandidateDocRecord,
} from "../lib/recruitment";

const TODAY = "2026-10-24";
const file = (doc_type: string, expires_at: string | null = null): CandidateDocRecord => ({
  doc_type,
  file_path: `org/cand/${doc_type}.pdf`,
  expires_at,
  not_required: false,
});
const waived = (doc_type: string): CandidateDocRecord => ({
  doc_type,
  file_path: null,
  expires_at: null,
  not_required: true,
});
/** Every item either held or waived, so nothing is outstanding. */
const complete = (): CandidateDocRecord[] =>
  REQUIRED_DOCS.map((d) => (d.key === "right_to_work" ? waived(d.key) : file(d.key)));

describe("a checklist item's state", () => {
  it("is missing when there is no row", () => {
    expect(docState(undefined, TODAY)).toBe("missing");
  });

  it("is not required when marked N/A (issue #52)", () => {
    expect(docState(waived("right_to_work"), TODAY)).toBe("not_required");
  });

  it("is held while a dated file is in date, and expired the day after", () => {
    expect(docState(file("dbs", "2026-10-24"), TODAY)).toBe("held");
    expect(docState(file("dbs", "2026-10-23"), TODAY)).toBe("expired");
    expect(docState(file("dbs"), TODAY)).toBe("held");
  });
});

describe("Mark hired waits for the whole checklist (issue #51)", () => {
  it("nothing is outstanding once every item is held or not needed", () => {
    expect(outstandingDocs(complete(), TODAY)).toEqual([]);
  });

  it("an empty checklist leaves all twelve outstanding, in checklist order", () => {
    const out = outstandingDocs([], TODAY);
    expect(out.map((i) => i.key)).toEqual(REQUIRED_DOCS.map((d) => d.key));
  });

  it("an expired document is outstanding even though a file is held", () => {
    const docs = complete().map((d) => (d.doc_type === "dbs" ? file("dbs", "2026-01-01") : d));
    expect(outstandingDocs(docs, TODAY).map((i) => i.key)).toEqual(["dbs"]);
  });

  it("the refusal names each item and says which are expired", () => {
    const docs = complete().filter((d) => d.doc_type !== "contract").map((d) =>
      d.doc_type === "dbs" ? file("dbs", "2026-01-01") : d,
    );
    expect(notReadyMessage(outstandingDocs(docs, TODAY))).toBe(
      "Not ready to hire — still outstanding: DBS (expired), Contract. Upload each one, or mark it not needed.",
    );
  });

  it("checklist keeps every item, done or not", () => {
    const items = checklist([waived("literacy")], TODAY);
    expect(items).toHaveLength(REQUIRED_DOCS.length);
    expect(items.find((i) => i.key === "literacy")?.state).toBe("not_required");
    expect(items.find((i) => i.key === "dbs")?.state).toBe("missing");
  });
});
