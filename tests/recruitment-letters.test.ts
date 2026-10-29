import { describe, expect, it } from "vitest";
import {
  REJECTION_REASONS,
  buildOffer,
  buildRejection,
  evidenceIsThin,
  letterHtml,
  offerEvidence,
  offerProblems,
  rejectionProblems,
  sanitiseOffer,
  sanitiseRejection,
} from "../lib/recruitment-letters";
import { STARTER_SECTIONS, healthFlags, validateStarter } from "../lib/recruitment-starter";

const TODAY = "2026-10-29";

describe("offer letter", () => {
  const fields = sanitiseOffer({ position: "Carer", whyHired: "You told us about your nan.\n\nThat's the compassion we look for.", signatoryName: "Jane Smith", signatoryTitle: "Registered Manager" });

  it("is ready to send only with a reason, a signer and no placeholders", () => {
    expect(offerProblems(fields)).toEqual([]);
    expect(offerProblems({ ...fields, whyHired: "" })).toHaveLength(1);
    expect(offerProblems({ ...fields, payLine: "£[rate] an hour" })).toHaveLength(1);
    expect(offerProblems({ ...fields, signatoryName: "" })).toHaveLength(1);
  });

  it("carries the company's name and My Care Academy only in the footer", () => {
    const letter = buildOffer({ fields, candidateName: "Amina Example", companyName: "Demo Care Ltd", referees: 2, todayIso: TODAY });
    expect(letter.greeting).toBe("Dear Amina,");
    expect(letter.blocks[1].paragraphs).toHaveLength(2);
    const html = letterHtml(letter);
    expect(html).toContain("Demo Care Ltd");
    expect(html).toContain("Sent for Demo Care Ltd by My Care Academy.");
    expect(html).not.toContain("<img");
  });

  it("escapes what the office typed", () => {
    const letter = buildOffer({ fields: { ...fields, whyHired: "<script>x</script>" }, candidateName: "A B", companyName: "Co", referees: 2, todayIso: TODAY });
    expect(letterHtml(letter)).not.toContain("<script>");
  });

  it("writes only from the values notes and the application, never the decision notes", () => {
    const evidence = offerEvidence(
      { w1Notes: "Cared for her grandmother every evening for two years.", w2Notes: "Short", outcomeNotes: "Strong candidate, some health questions" },
      { whyCarer: "I like making people's day better." },
    );
    expect(evidence.map((e) => e.source)).toEqual(["interview", "application"]);
    expect(JSON.stringify(evidence)).not.toContain("health questions");
    expect(evidenceIsThin(evidence)).toBe(true);
  });
});

describe("rejection letter", () => {
  it("never offers a reason about a personal characteristic, a DBS result or a referee's words", () => {
    const all = REJECTION_REASONS.map((r) => `${r.label} ${r.sentence}`).join(" ").toLowerCase();
    for (const word of ["health", "age", "religion", "nationality", "disab", "conviction", "referee said"]) {
      expect(all).not.toMatch(new RegExp(`\\b${word}`));
    }
  });

  it("needs a reason and a signer, and keeps the reasons in the list's order", () => {
    const f = sanitiseRejection({ reasons: ["documents", "availability", "made-up"], signatoryName: "Jane" });
    expect(f.reasons).toEqual(["availability", "documents"]);
    expect(rejectionProblems(f)).toEqual([]);
    expect(rejectionProblems({ ...f, reasons: [] })).toHaveLength(1);
  });

  it("invites them back only when the office says so", () => {
    const f = sanitiseRejection({ reasons: ["noVacancy"], reapplyMonths: 6, signatoryName: "Jane" });
    const text = JSON.stringify(buildRejection({ fields: f, candidateName: "Amina Example", companyName: "Co", todayIso: TODAY }));
    expect(text).toContain("six months");
    const none = JSON.stringify(buildRejection({ fields: { ...f, reapplyMonths: 0 }, candidateName: "Amina", companyName: "Co", todayIso: TODAY }));
    expect(none).not.toContain("apply to us again");
  });
});

describe("health, equality and DBS form", () => {
  it("lets every equality question be answered 'Prefer not to say'", () => {
    const eq = STARTER_SECTIONS.find((s) => s.id === "stEquality")!;
    for (const f of eq.fields) expect(f.options).toContain("Prefer not to say");
  });

  it("asks for details of a yes, and checks a DBS number is 12 digits", () => {
    const problems = validateStarter({ affectsRole: "yes", hasDbs: "yes", dbsNumber: "123" }, TODAY);
    expect(problems.stHealth.map((e) => e.field)).toContain("affectsRoleDetail");
    expect(problems.stDbs.map((e) => e.field)).toContain("dbsNumber");
  });

  it("lists the yes answers for the office to talk through", () => {
    expect(healthFlags({ backProblems: "yes", skin: "no", mentalHealth: "Yes" })).toHaveLength(2);
  });
});
