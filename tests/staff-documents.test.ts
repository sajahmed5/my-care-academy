import { describe, expect, it } from "vitest";
import { STAFF_DOCS, staffDocState, staffDocSummary, staffDocTasks, type StaffDoc } from "../lib/staff-documents";

const now = new Date("2026-10-25T12:00:00Z");
const doc = (doc_type: string, over: Partial<StaffDoc> = {}): StaffDoc => ({
  id: doc_type,
  doc_type,
  file_name: `${doc_type}.pdf`,
  file_path: `org/u/${doc_type}.pdf`,
  expires_at: null,
  not_required: false,
  not_required_reason: null,
  ...over,
});

describe("a staff document's state", () => {
  it("is expired, expiring within 30 days, held, not needed or missing", () => {
    expect(staffDocState(doc("dbs", { expires_at: "2026-10-01" }), now)).toBe("expired");
    expect(staffDocState(doc("dbs", { expires_at: "2026-11-10" }), now)).toBe("expiring");
    expect(staffDocState(doc("dbs", { expires_at: "2027-06-01" }), now)).toBe("held");
    expect(staffDocState(doc("references"), now)).toBe("held");
    expect(staffDocState(doc("insurance", { not_required: true, file_path: null }), now)).toBe("not_required");
    expect(staffDocState(undefined, now)).toBe("missing");
  });
  it("never counts a document only some people need as missing", () => {
    const def = STAFF_DOCS.find((d) => d.key === "dbs_risk_assessment")!;
    expect(staffDocState(undefined, now, def)).toBe("not_required");
    const licence = STAFF_DOCS.find((d) => d.key === "driving_licence")!;
    expect(staffDocState(doc("driving_licence", { expires_at: "2026-10-20" }), now, licence)).toBe("expired");
  });
});

describe("what goes on the task list", () => {
  it("asks to renew what has expired or is about to, and to add what is missing", () => {
    const tasks = staffDocTasks(
      [
        doc("right_to_work", { expires_at: "2026-09-30" }),
        doc("dbs", { expires_at: "2026-11-15" }),
        doc("insurance", { not_required: true, file_path: null }),
      ],
      now,
    );
    expect(tasks.map((t) => [t.title, t.urgency])).toEqual([
      ["Renew Right to work", "overdue"],
      ["Renew DBS", "due_soon"],
      ["Add References to their file", "open"],
    ]);
  });
  it("asks nothing when everything is held in date or not needed", () => {
    expect(
      staffDocTasks(
        [doc("right_to_work"), doc("dbs", { expires_at: "2027-10-01" }), doc("references"), doc("insurance", { not_required: true, file_path: null })],
        now,
      ),
    ).toEqual([]);
  });
});

describe("the summary across the company", () => {
  it("names what is expired, expiring and missing, leaving out what only some need", () => {
    expect(staffDocSummary([doc("dbs", { expires_at: "2026-10-01" }), doc("driving_licence", { expires_at: "2026-11-01" })], now)).toEqual({
      expired: ["DBS"],
      expiring: ["Driving licence"],
      missing: ["Right to work", "References", "Business car insurance"],
    });
  });
});
