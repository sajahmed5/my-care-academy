import { describe, expect, it } from "vitest";
import { staffDocState, staffDocTasks, type StaffDoc } from "../lib/staff-documents";

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
