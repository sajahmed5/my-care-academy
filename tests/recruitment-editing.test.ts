import { describe, expect, it } from "vitest";
import { customSection, sanitiseCustomQuestions } from "../lib/custom-questions";
import { APPLICATION_SECTIONS, applicationSections, sanitiseAnswers, validateApplication } from "../lib/recruitment-application";
import { INTERVIEW_SECTIONS, interviewSections, sanitiseInterview } from "../lib/recruitment-interview";
import { REFERENCE_SECTIONS, referenceSections } from "../lib/recruitment-references";
import {
  DEFAULT_TEST,
  LITERACY_QUESTIONS,
  literacySettingsProblems,
  markLiteracy,
  maxMarks,
  publicQuestions,
  sanitiseLiteracySettings,
  testFor,
  testOf,
} from "../lib/literacy-test";
import { REJECTION_REASONS, buildOffer, buildRejection, reasonsFor, sanitiseLetterSettings, sanitiseOffer, sanitiseRejection } from "../lib/recruitment-letters";

const TODAY = "2026-10-29";
const q = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: `Question ${id}`, type: "longtext", required: true, ...extra });

describe("a company's own questions", () => {
  it("keeps only well-formed questions", () => {
    const c = sanitiseCustomQuestions({
      application: [q("cq_aaaaaa"), q("bad id"), q("cq_bbbbbb", { type: "select", options: ["One"] }), q("cq_cccccc", { type: "select", options: ["A", "B"] }), q("cq_aaaaaa")],
    });
    expect(c.application.map((x) => x.id)).toEqual(["cq_aaaaaa", "cq_cccccc"]);
    expect(c.interview).toEqual([]);
  });

  it("goes before the declaration, and is checked and stored like our questions", () => {
    const company = customSection(sanitiseCustomQuestions({ application: [q("cq_aaaaaa")] }).application, { title: "More" });
    const sections = applicationSections(company);
    expect(sections.map((s) => s.id).slice(-2)).toEqual(["company", "declaration"]);
    expect(validateApplication({}, TODAY, sections).company?.[0].field).toBe("cq_aaaaaa");
    expect(sanitiseAnswers({ cq_aaaaaa: "Yes, I drive" }, sections).cq_aaaaaa).toBe("Yes, I drive");
    expect(sanitiseAnswers({ cq_aaaaaa: "dropped" }).cq_aaaaaa).toBeUndefined();
    expect(applicationSections(null)).toBe(APPLICATION_SECTIONS);
  });

  it("keeps a retired question on records that answer it, and never asks it again", () => {
    const list = sanitiseCustomQuestions({ interview: [q("cq_aaaaaa", { retired: true })] }).interview;
    expect(customSection(list, { title: "x" })).toBeNull();
    expect(customSection(list, { title: "x", forRecord: true })?.fields).toHaveLength(1);
    expect(customSection(list, { title: "x", answered: { cq_aaaaaa: "noted" } })?.fields[0].required).toBe(false);
  });
});

describe("the interview, as a company runs it", () => {
  it("leaves out the general questions it doesn't ask, never the values ones", () => {
    const sections = interviewSections(null, ["q1", "q2", "w1"], null);
    const ids = sections.flatMap((s) => s.fields.map((f) => f.id));
    expect(ids).not.toContain("q1Notes");
    expect(ids).toContain("w1Notes");
    expect(ids).toContain("q3Notes");
  });

  it("keeps a left-out question on a record that already answers it", () => {
    const sections = interviewSections(null, ["q1"], { q1Notes: "Talked about her last job" });
    expect(sanitiseInterview({ q1Notes: "Talked about her last job" }, sections).q1Notes).toBe("Talked about her last job");
  });

  it("puts the company's questions before the employment history", () => {
    const company = customSection(sanitiseCustomQuestions({ interview: [q("cq_aaaaaa")] }).interview, { title: "Ours" });
    const ids = interviewSections(company, [], null).map((s) => s.id);
    expect(ids.indexOf("company")).toBe(ids.indexOf("ivHistory") - 1);
    expect(interviewSections(null, [], null).map((s) => s.id)).toEqual(INTERVIEW_SECTIONS.map((s) => s.id));
  });

  it("asks referees the company's questions before their own details", () => {
    const company = customSection(sanitiseCustomQuestions({ reference: [q("cq_aaaaaa")] }).reference, { title: "More" });
    const ids = referenceSections("employer", company).map((s) => s.id);
    expect(ids.slice(-2)).toEqual(["company", "refDeclaration"]);
    expect(referenceSections("character", null)).toBe(REFERENCE_SECTIONS.character);
  });
});

describe("a company's literacy test", () => {
  const own = { id: "own_abcdef", prompt: "What day comes after Monday?", options: ["Sunday", "Tuesday"], answer: "Tuesday" };

  it("takes its time, pass mark, our questions it keeps, and its own", () => {
    const s = sanitiseLiteracySettings({ minutes: 30, passPercent: 70, off: ["q1", "nope"], own: [own, { ...own, id: "own_zzzzzz", answer: "Friday" }] });
    expect(s.off).toEqual(["q1"]);
    expect(s.own).toHaveLength(1);
    const test = testFor(s);
    expect(test.minutes).toBe(30);
    expect(test.questions.some((x) => x.id === "q1")).toBe(false);
    expect(maxMarks(test)).toBe(maxMarks(DEFAULT_TEST) - 1 + 1);
  });

  it("marks against the attempt's own test and pass mark, and never sends the answer", () => {
    const test = testFor(sanitiseLiteracySettings({ passPercent: 50, off: LITERACY_QUESTIONS.slice(1).map((x) => x.id), own: [own] }));
    expect(literacySettingsProblems(sanitiseLiteracySettings({ off: LITERACY_QUESTIONS.slice(1).map((x) => x.id), own: [own] }))[0]).toContain("at least");
    const r = markLiteracy({ own_abcdef: "Tuesday" }, test);
    expect(r.max).toBe(2);
    expect(r.passed).toBe(true);
    expect(JSON.stringify(publicQuestions(test))).not.toContain('"answer"');
  });

  it("marks an attempt made before companies had their own test on ours", () => {
    expect(testOf(null)).toBe(DEFAULT_TEST);
    expect(testOf({ questions: [], minutes: 20, passPercent: 80 })).toBe(DEFAULT_TEST);
  });
});

describe("a company's letter wording", () => {
  it("offers our reasons it uses, then its own", () => {
    const s = sanitiseLetterSettings({ reasonsOff: ["transport"], ownReasons: [{ id: "own_abcdef", label: "Too far", sentence: "You live too far from our area." }] });
    const reasons = reasonsFor(s);
    expect(reasons.some((r) => r.id === "transport")).toBe(false);
    expect(reasons.at(-1)?.id).toBe("own_abcdef");
    const f = sanitiseRejection({ reasons: ["own_abcdef", "transport"], signatoryName: "Jane" }, reasons);
    expect(f.reasons).toEqual(["own_abcdef"]);
    expect(JSON.stringify(buildRejection({ fields: f, candidateName: "A B", companyName: "Co", todayIso: TODAY, reasons }))).toContain("You live too far");
    expect(reasonsFor(sanitiseLetterSettings(null))).toEqual(REJECTION_REASONS);
  });

  it("uses the company's offer conditions when it has written them", () => {
    const fields = sanitiseOffer({ whyHired: "x", signatoryName: "Jane" });
    const own = buildOffer({ fields, candidateName: "A B", companyName: "Co", referees: 2, todayIso: TODAY, conditions: ["a driving licence check"] });
    expect(own.blocks[2].list).toEqual(["a driving licence check"]);
    expect(buildOffer({ fields, candidateName: "A B", companyName: "Co", referees: 2, todayIso: TODAY }).blocks[2].list).toHaveLength(5);
  });
});
