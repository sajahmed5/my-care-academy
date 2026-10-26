import { describe, expect, it } from "vitest";
import { convertWordForm, fieldTypeFor, formCategoryFor, type SourceBlock } from "../lib/form-conversion";

describe("converting a Word form", () => {
  it("types a field by its wording", () => {
    expect(fieldTypeFor("Date of DBS certificate")).toBe("date");
    expect(fieldTypeFor("Manager's signature")).toBe("signature");
    expect(fieldTypeFor("Was the client present?")).toBe("radio");
    expect(fieldTypeFor("Details of the concern")).toBe("textarea");
    expect(fieldTypeFor("Full name")).toBe("text");
  });

  it("makes a field per label, a long answer for guidance, and a description from the opening", () => {
    const blocks: SourceBlock[] = [
      { type: "paragraph", text: "{{organisation}}" },
      { type: "paragraph", text: "CRIMINAL CONVICTION RISK ASSESSMENT" },
      { type: "paragraph", text: "To be completed where a DBS check discloses a caution, before a final decision is made" },
      { type: "heading", text: "Applicant Details", level: 1 },
      { type: "paragraph", text: "Full name" },
      { type: "paragraph", text: "Date of DBS certificate" },
      { type: "heading", text: "Information Disclosed", level: 1 },
      { type: "guidance", text: "[Record factually what was disclosed.]" },
      { type: "heading", text: "Assessment Factors", level: 1 },
      { type: "bullet", text: "[Nature of the offence]" },
      { type: "bullet", text: "[How long ago]" },
      { type: "heading", text: "Sign-off", level: 1 },
      { type: "paragraph", text: "Assessor signature" },
    ];
    const out = convertWordForm("Criminal Conviction Risk Assessment", blocks);
    expect(out.description).toContain("DBS check discloses");
    expect(out.fields.map((f) => [f.label, f.type])).toEqual([
      ["Full name", "text"],
      ["Date of DBS certificate", "date"],
      ["Information Disclosed", "textarea"],
      ["Assessment Factors", "textarea"],
      ["Assessor signature", "signature"],
    ]);
    expect(out.fields.map((f) => f.id)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
  });

  it("reads a flattened checklist table as Yes / No / N/A questions, dropping headings and boxes", () => {
    const out = convertWordForm("Home check", [
      { type: "heading", text: "Home Environment" },
      { type: "paragraph", text: "Check" },
      { type: "paragraph", text: "Yes" },
      { type: "paragraph", text: "No" },
      { type: "paragraph", text: "N/A" },
      { type: "paragraph", text: "Safe access to the property" },
      { type: "paragraph", text: "☐" },
      { type: "paragraph", text: "☐" },
      { type: "paragraph", text: "☐" },
      { type: "paragraph", text: "Working smoke alarm present" },
      { type: "paragraph", text: "☐" },
      { type: "paragraph", text: "☐" },
    ]);
    expect(out.fields.map((f) => [f.label, f.type, f.options])).toEqual([
      ["Safe access to the property", "radio", ["Yes", "No", "N/A"]],
      ["Working smoke alarm present", "radio", ["Yes", "No"]],
    ]);
  });

  it("never repeats a label, and falls back to one box when nothing converts", () => {
    const dup = convertWordForm("X", [
      { type: "heading", text: "A" },
      { type: "paragraph", text: "Name" },
      { type: "heading", text: "B" },
      { type: "paragraph", text: "Name" },
    ]);
    expect(dup.fields.map((f) => f.label)).toEqual(["Name", "Name (2)"]);
    expect(convertWordForm("Y", [{ type: "paragraph", text: "Just a sentence of instructions." }]).fields).toHaveLength(1);
  });

  it("files a form by the category it came from", () => {
    expect(formCategoryFor("Add-on — Recruitment Pack")).toBe("recruitment");
    expect(formCategoryFor("Domiciliary Care — Policies and Assessments")).toBe("care");
    expect(formCategoryFor("Add-on — Complaints and Safeguarding Pack")).toBe("quality");
  });
});
