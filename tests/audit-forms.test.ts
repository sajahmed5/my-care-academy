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

import {
  COMPETENCY_FORMS,
  SPOT_CHECK_FORM,
  readCheckAnswers,
  suggestedOutcome,
  suggestedSlugs,
} from "../lib/audit-forms";
import { suggestionsFromSlugs } from "../lib/competency";

describe("spot check and competency forms", () => {
  it("are due every 12 weeks and every 12 months per skill", () => {
    expect(SPOT_CHECK_FORM.due).toEqual({ every: 12, unit: "weeks" });
    for (const f of COMPETENCY_FORMS) expect(f.due).toEqual({ every: 12, unit: "months" });
  });

  it("cover the eight agreed skills, each with its own criteria", () => {
    expect(COMPETENCY_FORMS.map((f) => f.key)).toEqual([
      "medication",
      "hoist",
      "moving_people",
      "moving_objects",
      "food_hydration",
      "de_escalation",
      "infection_control",
      "personal_care",
    ]);
    for (const f of [...COMPETENCY_FORMS, SPOT_CHECK_FORM]) {
      const ids = f.items.map((i) => i.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("readCheckAnswers", () => {
  const items = [
    { id: "a", label: "Badge" },
    { id: "b", label: "PPE" },
  ];

  it("needs every item answered", () => {
    expect(readCheckAnswers(items, [{ id: "a", result: "yes" }])).toEqual({ ok: false, error: 'Answer "PPE".' });
  });

  it("needs a comment on a No", () => {
    const r = readCheckAnswers(items, [
      { id: "a", result: "yes" },
      { id: "b", result: "no", comment: " " },
    ]);
    expect(r).toEqual({ ok: false, error: 'Say what was wrong with "PPE".' });
  });

  it("snapshots the wording and drops anything else", () => {
    const r = readCheckAnswers(items, [
      { id: "a", result: "na" },
      { id: "b", result: "no", comment: "No apron" },
      { id: "z", result: "yes" },
    ]);
    expect(r).toEqual({
      ok: true,
      answers: [
        { id: "a", label: "Badge", result: "na", comment: "" },
        { id: "b", label: "PPE", result: "no", comment: "No apron" },
      ],
    });
  });

  it("refuses a made-up result", () => {
    expect(readCheckAnswers(items, [{ id: "a", result: "maybe" }, { id: "b", result: "yes" }]).ok).toBe(false);
  });
});

describe("suggestedOutcome", () => {
  it("is met with no Nos, needs support with one or two, not met with three", () => {
    expect(suggestedOutcome([{ result: "yes" }, { result: "na" }])).toBe("met");
    expect(suggestedOutcome([{ result: "no" }, { result: "yes" }])).toBe("developing");
    expect(suggestedOutcome([{ result: "no" }, { result: "no" }, { result: "no" }])).toBe("not_met");
  });
});

describe("suggested training", () => {
  it("comes from a spot check's Nos, de-duplicated, only when it fell short", () => {
    const answers = [
      { id: "ppe", result: "no" },
      { id: "hand_hygiene", result: "no" },
      { id: "uniform", result: "no" },
      { id: "records", result: "yes" },
    ];
    expect(suggestedSlugs(SPOT_CHECK_FORM, "developing", answers)).toEqual(["infection-prevention-and-control"]);
    expect(suggestedSlugs(SPOT_CHECK_FORM, "met", answers)).toEqual([]);
  });

  it("comes from the skill itself for competency", () => {
    const hoist = COMPETENCY_FORMS.find((f) => f.key === "hoist")!;
    expect(suggestedSlugs(hoist, "not_met", [])).toEqual(["moving-and-handling"]);
  });

  it("marks what has already been assigned off the record", () => {
    const courses = [
      { id: "c1", slug: "moving-and-handling", title: "Moving and Handling" },
      { id: "c2", slug: "other", title: "Other" },
    ];
    expect(suggestionsFromSlugs(["moving-and-handling", "missing"], courses, new Map([["c1", "after the hoist check"]]))).toEqual([
      { course: courses[0], assigned: true, reason: "after the hoist check" },
    ]);
  });
});
