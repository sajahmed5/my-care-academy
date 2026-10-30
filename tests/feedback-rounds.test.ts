import { describe, expect, it } from "vitest";
import {
  SURVEY_KINDS,
  answerLines,
  cleanQuestions,
  headlineQuestion,
  isLowScore,
  isPraise,
  questionsForRound,
  responseRate,
  type SurveyQuestion,
} from "@/lib/feedback";
import { invitationEmail } from "@/lib/feedback-email";

const qs: SurveyQuestion[] = [
  { id: "overall", text: "Overall?", type: "rating" },
  { id: "safe", text: "Safe?", type: "rating" },
  { id: "good", text: "What is good?", type: "text" },
];

describe("cleanQuestions", () => {
  it("keeps worded questions of known types, with unique ids, and needs a rating", () => {
    expect(
      cleanQuestions([
        { id: "overall", text: " Overall? ", type: "rating" },
        { text: "", type: "rating" },
        { id: "overall", text: "Again", type: "weird" },
        { id: "bad id!", text: "Words", type: "text" },
      ]),
    ).toEqual([
      { id: "overall", text: "Overall?", type: "rating" },
      { id: "overall_2", text: "Again", type: "rating" },
      { id: "q3", text: "Words", type: "text" },
    ]);
    expect(cleanQuestions([{ text: "Only words", type: "text" }])).toBeNull();
    expect(cleanQuestions("x")).toBeNull();
  });
});

describe("rounds", () => {
  it("use their own questions, or the original wording for an older round", () => {
    expect(questionsForRound({ kind: "client", questions: qs })).toEqual(qs);
    expect(questionsForRound({ kind: "staff", questions: null })).toEqual(SURVEY_KINDS.find((k) => k.key === "staff")!.questions);
  });

  it("trend the overall question, or the first rating", () => {
    expect(headlineQuestion(qs)?.id).toBe("overall");
    expect(headlineQuestion([{ id: "x", text: "X", type: "text" }, { id: "y", text: "Y", type: "rating" }])?.id).toBe("y");
  });
});

describe("acting on a named answer", () => {
  it("sees a 1 or 2 as a low score", () => {
    expect(isLowScore(qs, { overall: 4, safe: 2 })).toBe(true);
    expect(isLowScore(qs, { overall: 3 })).toBe(false);
  });

  it("sees praise in all-high ratings with words", () => {
    expect(isPraise(qs, { overall: 5, safe: 4, good: "Lovely carers" })).toBe(true);
    expect(isPraise(qs, { overall: 5, safe: 3, good: "Lovely" })).toBe(false);
    expect(isPraise(qs, { overall: 5 })).toBe(false);
  });

  it("writes an answer out as lines", () => {
    expect(answerLines(qs, { overall: 2, good: "Kind" })).toEqual(["Overall? 2/5 (poor)", "What is good? “Kind”"]);
    expect(answerLines(qs, { overall: 2, good: "Kind" }, { textOnly: true })).toEqual(["What is good? “Kind”"]);
  });
});

describe("responseRate", () => {
  it("counts everyone emailed and everyone handed the link", () => {
    expect(responseRate({ invited: 10, sentTo: 30, responses: 10 })).toEqual({ asked: 40, answered: 10, percent: 25 });
    expect(responseRate({ invited: 0, sentTo: null, responses: 4 })).toBeNull();
    expect(responseRate({ invited: 2, sentTo: null, responses: 5 })?.percent).toBe(100);
  });
});

describe("invitationEmail", () => {
  const base = { orgName: "Acme <Care>", roundTitle: "Annual survey", url: "https://x.test/survey/abc", closesOn: "2026-12-01", name: "Pat", clientName: "Jane" };
  it("tells a family on a named round that the provider will see their answers", () => {
    const m = invitationEmail({ ...base, kind: "client", named: true });
    expect(m.subject).toBe("Acme <Care> would like your feedback");
    expect(m.html).toContain("Acme &lt;Care&gt;");
    expect(m.html).toContain("Jane receives");
    expect(m.html).toContain("follow up");
    expect(m.html).toContain("1 December 2026");
  });
  it("tells staff it is anonymous", () => {
    const m = invitationEmail({ ...base, kind: "staff", named: false, clientName: null });
    expect(m.html).toContain("anonymous");
    expect(m.html).toContain("https://x.test/survey/abc");
  });
});
