import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  pruneAnswers,
  responseRows,
  validateAnswers,
  visibleFormPacks,
} from "../lib/form-library";
import type { FormField } from "../lib/forms";

function field(over: Partial<FormField>): FormField {
  return {
    id: "f",
    label: "Field",
    type: "text",
    options: [],
    required: false,
    conditional: null,
    sort_order: 0,
    ...over,
  };
}

const NAME = field({ id: "name", label: "Full name", required: true });
const DRIVES = field({ id: "drives", label: "Do you drive?", type: "radio", options: ["Yes", "No"] });
const LICENCE = field({
  id: "licence",
  label: "Licence number",
  required: true,
  conditional: { whenFieldId: "drives", equals: "Yes" },
});
const SIGN = field({ id: "sig", label: "Signature", type: "signature", required: true });

describe("validateAnswers", () => {
  it("names every required field left empty", () => {
    const problems = validateAnswers([NAME, SIGN], { name: "  " });
    expect(problems.map((p) => p.label)).toEqual(["Full name", "Signature"]);
  });

  it("passes a complete form", () => {
    expect(validateAnswers([NAME, SIGN], { name: "Jane", sig: "Jane Carer" })).toEqual([]);
  });

  it("does not demand an answer to a question that was never shown", () => {
    // Licence is required, but only asked of drivers.
    expect(validateAnswers([DRIVES, LICENCE], { drives: "No" })).toEqual([]);
    expect(validateAnswers([DRIVES, LICENCE], { drives: "Yes" }).map((p) => p.fieldId)).toEqual([
      "licence",
    ]);
  });

  it("treats an empty multiple choice as unanswered", () => {
    const multi = field({ id: "m", label: "Days", type: "checkbox", options: ["Mon"], required: true });
    expect(validateAnswers([multi], { m: [] })).toHaveLength(1);
    expect(validateAnswers([multi], { m: ["Mon"] })).toHaveLength(0);
  });
});

describe("pruneAnswers", () => {
  it("drops answers to fields the form does not have", () => {
    expect(pruneAnswers([NAME], { name: "Jane", smuggled: "x" })).toEqual({ name: "Jane" });
  });

  it("drops an answer to a hidden conditional field", () => {
    expect(pruneAnswers([DRIVES, LICENCE], { drives: "No", licence: "ABC" })).toEqual({
      drives: "No",
    });
  });
});

describe("visibleFormPacks", () => {
  it("shows nothing without the library feature", () => {
    expect(visibleFormPacks({ "complaints.register": true })).toEqual({ packs: [], collections: [] });
  });

  it("opens the basic and full packs with the feature", () => {
    expect(visibleFormPacks({ "forms.builder": true }).packs).toEqual(["basic", "full"]);
  });

  it("brings an add-on pack with the feature it belongs to", () => {
    const { packs, collections } = visibleFormPacks({
      "forms.builder": true,
      "recruitment.tracker": true,
    });
    expect(packs).toContain("addon");
    expect(collections).toEqual(["Recruitment Pack"]);
  });
});

describe("categoryLabel", () => {
  it("reads as a manager would say it, and falls back to the raw value", () => {
    expect(categoryLabel("hr")).toBe("HR");
    expect(categoryLabel("review")).toBe("Reviews");
    expect(categoryLabel("made-up")).toBe("made-up");
  });
});

describe("responseRows", () => {
  const fields = [
    { ...NAME, sort_order: 0 },
    { ...DRIVES, sort_order: 1 },
    { ...LICENCE, sort_order: 2 },
    field({ id: "days", label: "Days free", type: "checkbox", options: ["Mon", "Tue"], sort_order: 3 }),
  ];
  it("reads each answer against its question, in the form's order", () => {
    const rows = responseRows(fields, { name: "Sam", drives: "Yes", licence: "AB123", days: ["Mon", "Tue"] });
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Full name", "Sam"],
      ["Do you drive?", "Yes"],
      ["Licence number", "AB123"],
      ["Days free", "Mon, Tue"],
    ]);
  });
  it("leaves out a conditional question they were never shown, but keeps a blank one they were", () => {
    const rows = responseRows(fields, { name: "Sam", drives: "No" });
    expect(rows.map((r) => r.label)).toEqual(["Full name", "Do you drive?", "Days free"]);
    expect(rows.find((r) => r.label === "Days free")?.value).toBe("");
  });
  it("reads a file answer as its name, with where it is stored", () => {
    const upload = field({ id: "doc", label: "Upload ID", type: "file", sort_order: 9 });
    const [row] = responseRows([upload], { doc: { file: "org/library/a1/doc-x.pdf", name: "passport.pdf" } });
    expect(row).toMatchObject({ value: "passport.pdf", filePath: "org/library/a1/doc-x.pdf" });
  });
  it("keeps an answer whose question has since been removed from the form", () => {
    const rows = responseRows(fields, { name: "Sam", old_q: "Still here" });
    expect(rows.at(-1)).toMatchObject({ value: "Still here", removed: true });
  });
});
