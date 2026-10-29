import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMS,
  addWeeks,
  intervalLabel,
  nextDueFrom,
  readActionsReview,
  readTextAnswers,
} from "../lib/audit-forms";
import { managerSignature } from "../lib/supervisions";
import { bookingEmail } from "../lib/staff-audit-email";
import { deriveNotifications } from "../lib/notifications";
import { buildDueRows } from "../lib/due-view";

describe("default forms", () => {
  it("are due on the agreed periods", () => {
    expect(DEFAULT_FORMS.supervision.due).toEqual({ every: 3, unit: "months" });
    expect(DEFAULT_FORMS.appraisal.due).toEqual({ every: 12, unit: "months" });
  });

  it("give only an appraisal a self-assessment", () => {
    expect(DEFAULT_FORMS.supervision.selfAssessment).toEqual([]);
    expect(DEFAULT_FORMS.appraisal.selfAssessment.length).toBeGreaterThan(0);
  });

  it("have unique question ids, since answers are keyed by them", () => {
    for (const f of Object.values(DEFAULT_FORMS)) {
      const ids = f.questions.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("due dates", () => {
  it("adds weeks across a month end", () => {
    expect(addWeeks("2026-10-29", 12)).toBe("2027-01-21");
  });

  it("adds months or weeks by the form's unit", () => {
    expect(nextDueFrom("2026-01-31", { every: 1, unit: "months" })).toBe("2026-02-28");
    expect(nextDueFrom("2026-01-01", { every: 2, unit: "weeks" })).toBe("2026-01-15");
  });

  it("reads as a manager would say it", () => {
    expect(intervalLabel({ every: 3, unit: "months" })).toBe("Every 3 months");
    expect(intervalLabel({ every: 1, unit: "months" })).toBe("Every month");
  });
});

describe("readTextAnswers", () => {
  const qs = [
    { id: "a", label: "First" },
    { id: "b", label: "Second" },
  ];

  it("snapshots each question's wording with its answer", () => {
    const r = readTextAnswers(qs, { a: " fine ", b: "" });
    expect(r).toEqual({
      ok: true,
      answers: [
        { id: "a", label: "First", answer: "fine" },
        { id: "b", label: "Second", answer: "" },
      ],
    });
  });

  it("refuses a form with nothing said", () => {
    expect(readTextAnswers(qs, { a: "  " }).ok).toBe(false);
  });

  it("ignores answers to questions the form does not have", () => {
    const r = readTextAnswers(qs, { a: "yes", z: "smuggled" });
    expect(r.ok && r.answers.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("readActionsReview", () => {
  const offered = [
    { id: "x", title: "Book moving and handling" },
    { id: "y", title: "Shadow a double-up" },
  ];

  it("keeps the reviewer's status and comment, defaulting to not done", () => {
    expect(readActionsReview(offered, [{ id: "x", status: "done", comment: " booked " }])).toEqual([
      { id: "x", title: "Book moving and handling", status: "done", comment: "booked" },
      { id: "y", title: "Shadow a double-up", status: "not_done", comment: "" },
    ]);
  });

  it("drops actions that were never on the table", () => {
    const r = readActionsReview(offered, [{ id: "other", status: "done" }]);
    expect(r.map((a) => a.id)).toEqual(["x", "y"]);
    expect(r.every((a) => a.status === "not_done")).toBe(true);
  });

  it("survives a payload that is not a list", () => {
    expect(readActionsReview(offered, "nonsense")).toHaveLength(2);
  });
});

describe("managerSignature", () => {
  const png = "data:image/png;base64,AAAA";
  it("needs a drawn signature and a name", () => {
    expect(managerSignature({ signature: "", name: "A", now: new Date() }).ok).toBe(false);
    expect(managerSignature({ signature: png, name: " ", now: new Date() }).ok).toBe(false);
    expect(managerSignature({ signature: "javascript:x", name: "A", now: new Date() }).ok).toBe(false);
  });
  it("records who signed and when", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    const r = managerSignature({ signature: png, name: " Jane ", now });
    expect(r).toEqual({
      ok: true,
      fields: { manager_signature: png, manager_signed_name: "Jane", manager_signed_at: now.toISOString() },
    });
  });
});

describe("bookingEmail", () => {
  const ctx = { name: "Sam", orgName: "Demo <Care>", origin: "https://x.test" };

  it("says when, who with and where, escaped", () => {
    const { subject, html } = bookingEmail(
      { kind: "supervision", bookedOn: "2026-11-12", bookedTime: "10:00", withName: "Jo", location: "The office", note: null, selfAssessment: false },
      ctx,
    );
    expect(subject).toBe("Your supervision is booked: 12 Nov");
    expect(html).toContain("Thursday, 12 November 2026 at 10:00");
    expect(html).toContain("With Jo, The office.");
    expect(html).toContain("Demo &lt;Care&gt;");
    expect(html).not.toContain("/learn/reviews");
  });

  it("asks for the self-assessment before an appraisal", () => {
    const { html } = bookingEmail(
      { kind: "appraisal", bookedOn: "2026-11-12", bookedTime: null, withName: "Jo", location: null, note: null, selfAssessment: true },
      ctx,
    );
    expect(html).toContain("https://x.test/learn/reviews");
  });
});

describe("booked notifications", () => {
  it("tells the person, from when it was booked", () => {
    const n = deriveNotifications([], [], new Date("2026-10-29"), [
      { id: "b1", kind: "appraisal", booked_on: "2026-11-12", booked_time: "10:00", created_at: "2026-10-29T09:00:00Z" },
    ]);
    expect(n).toEqual([
      expect.objectContaining({ id: "booked-b1", type: "booked", title: "Appraisal booked", at: "2026-10-29T09:00:00Z", href: "/learn/reviews" }),
    ]);
    expect(n[0].body).toContain("at 10:00");
  });
});

describe("due rows with bookings", () => {
  it("shows the soonest booked date beside the due date", () => {
    const rows = buildDueRows(
      [{ id: "u1", name: "Sam" }],
      [{ userId: "u1", heldOn: "2026-07-01", nextDue: "2026-10-01" }],
      new Date("2026-10-29"),
      [
        { userId: "u1", on: "2026-12-01" },
        { userId: "u1", on: "2026-11-05" },
      ],
    );
    expect(rows[0]).toMatchObject({ status: "overdue", booked: "2026-11-05" });
  });
});
