import { describe, expect, it } from "vitest";
import {
  COMPETENCY_FORMS,
  DEFAULT_FORMS,
  SPOT_CHECK_FORM,
  areaKeyFor,
  readQuestions,
  resolveForms,
  type FormOverride,
} from "../lib/audit-forms";
import { staffAuditDigest, staffAuditDigestHtml } from "../lib/staff-audit-digest";

const override = (over: Partial<FormOverride>): FormOverride => ({
  kind: "supervision",
  area_key: "",
  label: null,
  questions: [],
  self_assessment: [],
  due_every: 3,
  due_unit: "months",
  archived: false,
  ...over,
});

describe("resolveForms", () => {
  it("is our defaults when a company has changed nothing", () => {
    const f = resolveForms([]);
    expect(f.supervision).toBe(DEFAULT_FORMS.supervision);
    expect(f.spotCheck).toBe(SPOT_CHECK_FORM);
    expect(f.competency.map((c) => c.key)).toEqual(COMPETENCY_FORMS.map((c) => c.key));
  });

  it("takes a company's questions and due period", () => {
    const f = resolveForms([
      override({ kind: "supervision", questions: [{ id: "q", label: "How are you?" }], due_every: 2, due_unit: "months" }),
      override({ kind: "spot_check", questions: [{ id: "x", label: "Badge" }], due_every: 8, due_unit: "weeks" }),
    ]);
    expect(f.supervision.questions).toEqual([{ id: "q", label: "How are you?" }]);
    expect(f.supervision.due).toEqual({ every: 2, unit: "months" });
    expect(f.spotCheck.items).toEqual([{ id: "x", label: "Badge" }]);
    expect(f.spotCheck.due).toEqual({ every: 8, unit: "weeks" });
  });

  it("keeps a changed skill's suggested courses, and gives its own skills none", () => {
    const f = resolveForms([
      override({ kind: "competency", area_key: "hoist", label: "Hoisting", questions: [{ id: "a", label: "A" }], due_every: 6 }),
      override({ kind: "competency", area_key: "own_catheter_care", label: "Catheter care", questions: [{ id: "b", label: "B" }], due_every: 12 }),
    ]);
    const hoist = f.competency.find((c) => c.key === "hoist")!;
    expect(hoist.label).toBe("Hoisting");
    expect(hoist.courses).toEqual(COMPETENCY_FORMS.find((c) => c.key === "hoist")!.courses);
    const own = f.competency.at(-1)!;
    expect(own).toMatchObject({ key: "own_catheter_care", label: "Catheter care", courses: {} });
  });

  it("drops a skill the company has stopped", () => {
    const f = resolveForms([override({ kind: "competency", area_key: "hoist", archived: true, questions: [{ id: "a", label: "A" }] })]);
    expect(f.competency.some((c) => c.key === "hoist")).toBe(false);
  });

  it("lets an appraisal have no self-assessment, but a supervision never has one", () => {
    const f = resolveForms([
      override({ kind: "appraisal", questions: [{ id: "q", label: "Q" }], self_assessment: [] }),
      override({ kind: "supervision", questions: [{ id: "q", label: "Q" }], self_assessment: [{ id: "s", label: "S" }] }),
    ]);
    expect(f.appraisal.selfAssessment).toEqual([]);
    expect(f.supervision.selfAssessment).toEqual([]);
  });
});

describe("readQuestions", () => {
  it("drops blank rows and trims, keeping ids", () => {
    expect(readQuestions([{ id: "a", label: " Badge ", help: "" }, { id: "q_new1", label: "" }])).toEqual({
      ok: true,
      questions: [{ id: "a", label: "Badge" }],
    });
  });

  it("refuses duplicate or odd ids, which answers are keyed by", () => {
    expect(readQuestions([{ id: "a", label: "A" }, { id: "a", label: "B" }]).ok).toBe(false);
    expect(readQuestions([{ id: "A B", label: "A" }]).ok).toBe(false);
  });

  it("needs at least one, unless it may be empty", () => {
    expect(readQuestions([]).ok).toBe(false);
    expect(readQuestions([], { allowEmpty: true })).toEqual({ ok: true, questions: [] });
  });
});

describe("areaKeyFor", () => {
  it("makes a plain key that doesn't clash", () => {
    expect(areaKeyFor("Catheter care", [])).toBe("own_catheter_care");
    expect(areaKeyFor("Catheter care", ["own_catheter_care"])).toBe("own_catheter_care_2");
    expect(areaKeyFor("!!!", [])).toBe("own_area");
  });
});

describe("staffAuditDigest", () => {
  const now = new Date("2026-10-29");
  const carers = [
    { id: "c1", name: "Carer One" },
    { id: "c2", name: "Carer Two" },
  ];
  const staff = [...carers, { id: "o1", name: "Office" }];

  it("counts overdue, due soon and never, per audit", () => {
    const lines = staffAuditDigest({
      carers,
      staff,
      supervisions: [
        { userId: "c1", kind: "supervision", heldOn: "2026-06-01", nextDue: "2026-09-01" },
        { userId: "c2", kind: "supervision", heldOn: "2026-08-01", nextDue: "2026-11-10" },
      ],
      spotChecks: [],
      competency: [{ userId: "c1", heldOn: "2025-10-01", nextDue: "2026-10-01", area: "hoist" }],
      areas: [{ key: "hoist", label: "Hoist" }, { key: "medication", label: "Medication" }],
      meetings: true,
      checks: true,
      now,
    });
    expect(lines).toEqual([
      { label: "Supervisions", href: "/org/due/supervisions", overdue: 1, dueSoon: 1, never: 1 },
      { label: "Appraisals", href: "/org/due/appraisals", overdue: 0, dueSoon: 0, never: 3 },
      { label: "Spot checks", href: "/org/due/spot-checks", overdue: 0, dueSoon: 0, never: 2 },
      { label: "Competency: Hoist", href: "/org/due/competency?area=hoist", overdue: 1, dueSoon: 0, never: 0 },
    ]);
  });

  it("says nothing about what the package leaves out", () => {
    const lines = staffAuditDigest({ carers, staff, supervisions: [], spotChecks: [], competency: [], areas: [], meetings: false, checks: true, now });
    expect(lines.map((l) => l.label)).toEqual(["Spot checks"]);
  });

  it("renders a section with links, or nothing", () => {
    expect(staffAuditDigestHtml([], "https://x.test")).toBe("");
    const html = staffAuditDigestHtml([{ label: "Spot checks", href: "/org/due/spot-checks", overdue: 2, dueSoon: 0, never: 1 }], "https://x.test");
    expect(html).toContain('href="https://x.test/org/due/spot-checks"');
    expect(html).toContain("2 overdue, 1 never had one");
  });
});
