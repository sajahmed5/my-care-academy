import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNING_DOCUMENTS,
  SIGNING_DOC_KEYS,
  addressFromApplication,
  allPartsDone,
  blanksIn,
  documentsInForce,
  mergeBody,
  parseBody,
  sendProblems,
  snapshotFor,
  validSignature,
} from "../lib/signing-documents";
import { RECRUITMENT_STEPS } from "../lib/recruitment";
import { shadowingFlags, shadowingNote, validateShadowing } from "../lib/recruitment-shadowing";
import { DEFAULT_WELCOME_GUIDE, sanitiseContacts, welcomeHtml } from "../lib/welcome-pack";
import { STAFF_FILE_SOURCES } from "../lib/staff-documents";

const values = { candidateName: "Amina Example", companyName: "Demo Care Ltd", position: "Carer", today: "29 October 2026", startDate: "3 November 2026", address: "1 High St, Stockport, SK1 1AA" };
const allText = SIGNING_DOC_KEYS.flatMap((k) => DEFAULT_SIGNING_DOCUMENTS[k].parts.map((p) => p.body)).join("\n");

describe("documents to sign: our template", () => {
  it("uses the same keys as the stage 4 steps", () => {
    for (const k of SIGNING_DOC_KEYS) expect(RECRUITMENT_STEPS.some((s) => s.key === k && s.stage === 4)).toBe(true);
  });

  it("carries no one company's terms, and nothing about MyRoster's app or bank details", () => {
    expect(allText).not.toMatch(/HG Care|Care Assistant|£\d|\bthe app\b|bank details|sort code/i);
  });

  it("leaves the company's own terms as blanks, so it can't be sent as it stands", () => {
    expect(blanksIn(DEFAULT_SIGNING_DOCUMENTS.contract.parts[0].body)).toContain("[basic hourly rate]");
    const problems = sendProblems(SIGNING_DOC_KEYS.map((k) => documentsInForce([])[k]), values);
    expect(problems.some((p) => p.includes("[basic hourly rate]"))).toBe(true);
  });

  it("never treats a merge field as a blank", () => {
    expect(blanksIn("Hello {{candidateName}} [pay]")).toEqual(["[pay]"]);
  });
});

describe("the company's wording", () => {
  const filled = allText.replace(/\[[^[\]\n]{2,240}\]/g, "X");

  it("uses the latest version of each part, and ours for the rest", () => {
    const docs = documentsInForce([
      { docKey: "contract", partId: "contract", version: 1, body: "old" },
      { docKey: "contract", partId: "contract", version: 2, body: "new" },
    ]);
    expect(docs.contract.parts[0].body).toBe("new");
    expect(docs.contract.versions.contract).toBe(2);
    expect(docs.refund_training.versions.refund).toBe(0);
    expect(filled).not.toMatch(/\[[^\]]+\]/);
  });

  it("freezes the merged text onto the candidate's copy", () => {
    const docs = documentsInForce(
      SIGNING_DOC_KEYS.flatMap((k) => DEFAULT_SIGNING_DOCUMENTS[k].parts.map((p) => ({ docKey: k, partId: p.id, version: 1, body: p.body.replace(/\[[^[\]\n]{2,240}\]/g, "X") }))),
    );
    expect(sendProblems(SIGNING_DOC_KEYS.map((k) => docs[k]), values)).toEqual([]);
    const snap = snapshotFor(docs.contract, values);
    expect(snap.parts[0].body).toContain("Amina Example");
    expect(snap.parts[0].body).toContain("3 November 2026");
    expect(snap.parts[0].version).toBe(1);
    expect(sendProblems([docs.contract], { ...values, address: "" })[0]).toContain("address");
  });

  it("is done when every part is signed or, where allowed, declined", () => {
    const snap = snapshotFor(documentsInForce([])[`role_acceptance`], values);
    const optional = snap.parts.filter((p) => p.optional).map((p) => p.id);
    expect(optional).toContain("workingTime");
    const state = Object.fromEntries(snap.parts.map((p) => [p.id, optional.includes(p.id) ? { declined: true } : { signedAt: "x", dataUrl: "y" }]));
    expect(allPartsDone(snap, state)).toBe(true);
    expect(allPartsDone(snap, { ...state, codeOfConduct: {} })).toBe(false);
  });

  it("reads headings, bullets and paragraphs", () => {
    expect(parseBody("## Title\n\nOne\ntwo\n\n- a\n- b").map((b) => b.type)).toEqual(["heading", "paragraph", "list"]);
    expect(mergeBody("{{unknown}} {{companyName}}", values)).toBe("{{unknown}} Demo Care Ltd");
    expect(addressFromApplication({ address1: "1 High St", city: "Stockport", postcode: "SK1 1AA" })).toBe("1 High St, Stockport, SK1 1AA");
  });

  it("only takes a PNG signature of a sane size", () => {
    expect(validSignature(`data:image/png;base64,${"a".repeat(500)}`)).toBe(true);
    expect(validSignature("data:image/svg+xml;base64,aaa")).toBe(false);
  });
});

describe("shadowing record", () => {
  it("needs a reason for a no on the questions that may cost a job", () => {
    const problems = validateShadowing({ recommend: "no", visitsCount: "3" }, "2026-10-29");
    expect(problems.shVerdict.map((e) => e.field)).toContain("recommendComment");
    expect(problems.shDay?.map((e) => e.field) ?? []).not.toContain("visitsCount");
  });

  it("puts the verdict and anything worrying in front of the office", () => {
    expect(shadowingFlags({ recommend: "no", respectful: "no" })).toHaveLength(2);
    expect(shadowingNote({ mentorName: "Sam", recommend: "yes" })).toBe("Mentor Sam: recommended");
  });
});

describe("welcome pack", () => {
  it("fills in the person and company, escapes what was typed, and keeps only usable contacts", () => {
    const contacts = sanitiseContacts([{ label: "Office", phone: "0161 000 0000" }, { label: "No way to reach" }, { label: "<b>On call</b>", email: "x@y.test" }]);
    expect(contacts).toHaveLength(2);
    const html = welcomeHtml({ guide: DEFAULT_WELCOME_GUIDE, contacts, values: { firstName: "Amina", companyName: "Demo Care Ltd", startDate: "Monday, 3 November 2026" }, signInUrl: "https://example.test/login" });
    expect(html).toContain("Hi Amina");
    expect(html).toContain("Monday, 3 November 2026");
    expect(html).not.toContain("<b>On call</b>");
    expect(html).toContain("Sent for Demo Care Ltd by My Care Academy.");
  });
});

describe("hire", () => {
  it("moves right to work, the ID and the DBS, never anything else, onto the staff file as files", () => {
    expect(STAFF_FILE_SOURCES.map((s) => s.staffDoc)).toEqual(["right_to_work", "proof_id", "dbs"]);
  });
});
