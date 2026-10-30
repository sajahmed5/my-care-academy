import { describe, expect, it } from "vitest";
import { DEFAULT_QA_FORM, QA_HEADINGS, qaConcernText, qaScore, qaWho, readRatings, resolveQaForm, runHref } from "../lib/client-qa";
import { readServiceQuestions } from "../lib/service-audits";

describe("client QAs", () => {
  it("scores the five ratings as their average times ten", () => {
    expect(qaScore({ safe: 8, effective: 7, caring: 9, responsive: 4, well_led: 6 })).toBe(68);
    expect(qaScore({ safe: 10, effective: 10, caring: 10, responsive: 10, well_led: 10 })).toBe(100);
    expect(qaScore({ safe: 8 })).toBeNull();
  });

  it("needs a whole number from 1 to 10 under every heading", () => {
    const all = Object.fromEntries(QA_HEADINGS.map((h) => [h.key, "7"]));
    expect(readRatings(all)).toMatchObject({ ok: true });
    expect(readRatings({ ...all, caring: "11" })).toEqual({ ok: false, error: 'Rate "Caring" from 1 to 10.' });
    expect(readRatings({ ...all, safe: "" })).toMatchObject({ ok: false });
  });

  it("starts from our medication questions, and splits a company's into medication and its own", () => {
    expect(resolveQaForm(null)).toBe(DEFAULT_QA_FORM);
    const f = resolveQaForm({
      questions: [
        { id: "m", label: "Med", type: "yes_no", section: "medication" },
        { id: "o", label: "Own", type: "text", section: "own" },
        { id: "bad", label: "Bad", type: "dance" },
      ],
      due_every: 6,
      due_unit: "weeks",
    });
    expect(f.medication).toEqual([{ id: "m", label: "Med", type: "yes_no" }]);
    expect(f.own).toEqual([{ id: "o", label: "Own", type: "text" }]);
    expect(f.due).toEqual({ every: 6, unit: "weeks" });
  });

  it("keeps each question's section when the QA is edited, and needs nothing scored", () => {
    const r = readServiceQuestions([{ id: "q_1", label: "Recommend us?", type: "text", section: "own" }], {
      requireScored: false,
      sections: true,
    });
    expect(r).toEqual({ ok: true, questions: [{ id: "q_1", label: "Recommend us?", type: "text", section: "own" }] });
    expect(readServiceQuestions([], { requireScored: false, allowEmpty: true })).toEqual({ ok: true, questions: [] });
  });

  it("says who it was with", () => {
    const base = { client_name: "Ann", family_name: null, family_relationship: null };
    expect(qaWho({ ...base, with_whom: "client" })).toBe("Ann");
    expect(qaWho({ ...base, with_whom: "family", family_name: "Sue", family_relationship: "Daughter" })).toBe("Sue (Daughter)");
    expect(qaWho({ ...base, with_whom: "family", family_relationship: "Son" })).toBe("A family member (Son)");
  });

  it("raises a concern from what the QA found, nothing else", () => {
    const text = qaConcernText({
      held_on: "2026-10-30",
      method: "phone",
      do_better: "Late calls",
      action_plan: null,
      ratings: { safe: 8, effective: 7, caring: 9, responsive: 3, well_led: 6 },
      medication: [
        { label: "On time?", answer: "no", comment: "Twice late" },
        { label: "Recorded?", answer: "yes" },
      ],
    });
    expect(text).toContain("phone call) on 30 October 2026");
    expect(text).toContain("Late calls");
    expect(text).toContain("Rated low: Responsive 3/10.");
    expect(text).toContain("- On time? No — Twice late");
    expect(text).not.toContain("Recorded?");
    expect(text).not.toContain("Action plan");
  });

  it("knows where each audit and the QA are carried out", () => {
    expect(runHref("client_qa", "c1")).toBe("/org/audits/qa/new?client=c1");
    expect(runHref("medication", "c1")).toBe("/org/audits/new?form=medication&client=c1");
    expect(runHref("infection_control")).toBe("/org/audits/new?form=infection_control");
  });
});
