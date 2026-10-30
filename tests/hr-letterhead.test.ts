import { describe, expect, it } from "vitest";
import { letterheadLines, sanitiseLetterhead, templateDoc } from "@/lib/hr/letterhead";
import { templateFor } from "@/lib/hr/letters";

describe("HR letterhead (issue #89)", () => {
  it("keeps a tidy address, phone and a real email", () => {
    expect(sanitiseLetterhead({ address: "  12 High St,\n Leeds ", phone: "0113 000", email: "nope" })).toEqual({ address: "12 High St, Leeds", phone: "0113 000", email: "" });
    expect(sanitiseLetterhead(null)).toEqual({ address: "", phone: "", email: "" });
  });

  it("prints the address, then phone and email on one line, leaving out what's empty", () => {
    expect(letterheadLines({ address: "12 High St", phone: "0113", email: "a@b.co" })).toEqual(["12 High St", "0113 · a@b.co"]);
    expect(letterheadLines({ address: "", phone: "", email: "a@b.co" })).toEqual(["a@b.co"]);
  });

  it("makes a template to fill in: company filled, every other field a [gap], ACAS wording kept", () => {
    const t = templateFor("case_hearing_invite")!;
    const doc = templateDoc(t, null, { company: "Norwood Drive", letterhead: { address: "1 Road", phone: "", email: "" }, signer: { name: "Jane", title: "Manager" } });
    const all = [doc.subject, doc.greeting, ...doc.paragraphs].join("\n");
    expect(all).not.toMatch(/\{\{/);
    expect(doc.greeting).toBe("Dear [their first name],");
    expect(all).toContain("[time]");
    expect(doc.paragraphs.some((p) => p.includes("right to be accompanied"))).toBe(true);
    expect(doc.letterhead).toEqual(["1 Road"]);
  });
});
