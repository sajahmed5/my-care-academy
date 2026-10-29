import { describe, expect, it } from "vitest";
import type { Answers } from "../lib/recruitment-application";
import { INTERVIEW_SECTIONS, overallScore, sanitiseInterview, validateInterview } from "../lib/recruitment-interview";
import {
  isFreeWebmail,
  referenceFlags,
  refereeRowsFromApplication,
  reminderDue,
  validateReference,
} from "../lib/recruitment-references";

const TODAY = "2026-10-29";

/** Every field filled: notes everywhere, the details, a score and an outcome. */
function fullInterview(): Answers {
  const a: Answers = {};
  for (const s of INTERVIEW_SECTIONS)
    for (const f of s.fields) {
      if (f.type === "longtext") a[f.id] = "Said what they did.";
      else if (f.type === "select") a[f.id] = f.options![0];
      else if (f.type === "date") a[f.id] = TODAY;
      else if (f.type === "text") a[f.id] = "A Manager";
    }
  return { ...a, overallScore: "4 · Good", outcome: "Successful" };
}

describe("the interview record", () => {
  it("is finished with notes, one overall score and an outcome", () => {
    const a = sanitiseInterview(fullInterview());
    expect(validateInterview(a, TODAY)).toEqual({});
    expect(overallScore(a)).toBe(4);
  });
  it("can't be finished without the overall score", () => {
    const { overallScore: _, ...rest } = fullInterview();
    expect(validateInterview(rest, TODAY).ivOutcome?.[0].field).toBe("overallScore");
  });
  it("has no per-question scores", () => {
    expect(INTERVIEW_SECTIONS.flatMap((s) => s.fields).filter((f) => f.id.endsWith("Score")).map((f) => f.id)).toEqual(["overallScore"]);
  });
});

describe("references", () => {
  it("puts the employer first, as reference 1", () => {
    const rows = refereeRowsFromApplication([
      { type: "Character reference", name: "Friend", email: "F@Example.test" },
      { type: "Previous employer", name: "Boss", email: "boss@example.test" },
    ]);
    expect(rows.map((r) => [r.position, r.referee_name, r.email])).toEqual([
      [1, "Boss", "boss@example.test"],
      [2, "Friend", "f@example.test"],
    ]);
  });
  it("chases after 3 days, twice at most", () => {
    const day = 86_400_000;
    const now = Date.parse("2026-10-29T09:00:00Z");
    const r = { status: "requested", requested_at: new Date(now - 2 * day).toISOString(), last_reminded_at: null, reminder_count: 0, token_expires_at: null };
    expect(reminderDue(r, now)).toBe(false);
    expect(reminderDue({ ...r, requested_at: new Date(now - 3 * day).toISOString() }, now)).toBe(true);
    expect(reminderDue({ ...r, requested_at: new Date(now - 9 * day).toISOString(), reminder_count: 2 }, now)).toBe(false);
  });
  it("flags a referee who wouldn't recommend them, and a personal email for an employer", () => {
    expect(referenceFlags("character", { recommend: "no" })[0]).toMatch(/NOT recommend/);
    expect(isFreeWebmail("someone@gmail.com")).toBe(true);
    expect(isFreeWebmail("hr@carecompany.co.uk")).toBe(false);
  });
  it("needs the two safeguarding answers", () => {
    const problems = validateReference("character", {}, TODAY);
    expect(problems.refSuitability?.map((p) => p.field)).toEqual(expect.arrayContaining(["recommend", "safeguardingConcern"]));
  });
});
