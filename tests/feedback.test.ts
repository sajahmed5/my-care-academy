import { describe, expect, it } from "vitest";
import { SURVEY_KINDS, averages, cleanSurveyAnswers, monthlyTrend, type SurveyResponseRow } from "../lib/feedback";

const client = SURVEY_KINDS.find((k) => k.key === "client")!;

describe("feedback surveys", () => {
  it("keeps only in-range ratings and real comments, and needs at least one rating", () => {
    expect(cleanSurveyAnswers(client, { overall: "5", respect: 9, good: "  Kind carers  ", other: "x" })).toEqual({
      overall: 5,
      good: "Kind carers",
    });
    expect(cleanSurveyAnswers(client, { good: "Only a comment" })).toBeNull();
  });
  it("averages each rating question to one decimal", () => {
    const rows: SurveyResponseRow[] = [
      { submitted_at: "2026-09-02", answers: { overall: 5, respect: 4 } },
      { submitted_at: "2026-10-03", answers: { overall: 4 } },
    ];
    const a = averages(client, rows);
    expect(a.find((x) => x.id === "overall")).toMatchObject({ average: 4.5, count: 2 });
    expect(a.find((x) => x.id === "respect")).toMatchObject({ average: 4, count: 1 });
    expect(a.find((x) => x.id === "safe")).toMatchObject({ average: null, count: 0 });
  });
  it("trends the overall rating month by month", () => {
    expect(
      monthlyTrend([
        { submitted_at: "2026-10-03T10:00:00Z", answers: { overall: 4 } },
        { submitted_at: "2026-09-02T10:00:00Z", answers: { overall: 5 } },
        { submitted_at: "2026-10-20T10:00:00Z", answers: { overall: 3 } },
      ]),
    ).toEqual([
      { month: "2026-09", average: 5, count: 1 },
      { month: "2026-10", average: 3.5, count: 2 },
    ]);
  });
});
