import { describe, expect, it } from "vitest";
import { companyList, templateVisible, type FormChoice, type FormTemplateSummary } from "@/lib/form-library";
import { cleanFields } from "@/lib/forms";

const t = (over: Partial<FormTemplateSummary>): FormTemplateSummary => ({
  id: "t",
  code: "T",
  title: "T",
  description: null,
  category: "care",
  pack: "full",
  audience: "client",
  collection: null,
  service_types: null,
  version: 1,
  status: "published",
  review_months: 12,
  is_log: false,
  log_person_label: null,
  organisation_id: null,
  based_on_id: null,
  based_on_version: null,
  fieldCount: null,
  ...over,
});

describe("companyList", () => {
  const library = [t({ id: "ra", title: "Risk assessment" }), t({ id: "cp", title: "Care plan" }), t({ id: "bcp", title: "BCP" })];

  it("puts a published copy in the original's place, and drops what is switched off", () => {
    const own = [
      t({ id: "mine", title: "Our risk assessment", organisation_id: "o1", based_on_id: "ra" }),
      t({ id: "draft", title: "Draft copy", organisation_id: "o1", based_on_id: "cp", status: "draft" }),
    ];
    const choices = new Map<string, FormChoice>([["bcp", { hidden: true, review_months: null }]]);
    expect(companyList(library, own, choices).map((x) => x.id)).toEqual(["cp", "mine"]);
  });

  it("uses the company's review period over ours", () => {
    const choices = new Map<string, FormChoice>([["ra", { hidden: false, review_months: 6 }]]);
    expect(companyList(library, [], choices).find((x) => x.id === "ra")?.review_months).toBe(6);
    expect(companyList(library, [], choices).find((x) => x.id === "cp")?.review_months).toBe(12);
  });
});

describe("templateVisible", () => {
  const on = { "forms.builder": true };
  it("shows a company its own forms and nobody else's", () => {
    expect(templateVisible(t({ organisation_id: "o1" }), on, "o1")).toBe(true);
    expect(templateVisible(t({ organisation_id: "o2" }), on, "o1")).toBe(false);
  });
  it("shows ours by pack", () => {
    expect(templateVisible(t({ pack: "full" }), on, "o1")).toBe(true);
    expect(templateVisible(t({ pack: "addon", collection: "Recruitment Pack" }), on, "o1")).toBe(false);
    expect(templateVisible(t({ pack: "full" }), {}, "o1")).toBe(false);
  });
});

describe("cleanFields", () => {
  it("keeps labelled fields of known types, in order, with ranges only on numbers", () => {
    const out = cleanFields([
      { id: "a", label: " Temp ", type: "number", min: 1, max: 5, options: ["x"] },
      { label: "", type: "text" },
      { id: "b", label: "Pick", type: "radio", options: ["Yes", " ", "No"], min: 3 },
      { id: "c", label: "Odd", type: "nonsense", conditional: { whenFieldId: "b", equals: "Yes" } },
    ]);
    expect(out).toEqual([
      { id: "a", label: "Temp", type: "number", options: [], required: false, conditional: null, sort_order: 0, min: 1, max: 5 },
      { id: "b", label: "Pick", type: "radio", options: ["Yes", "No"], required: false, conditional: null, sort_order: 1 },
      { id: "c", label: "Odd", type: "text", options: [], required: false, conditional: { whenFieldId: "b", equals: "Yes" }, sort_order: 2 },
    ]);
  });

  it("gives a field without an id one, and reads nothing from a non-list", () => {
    expect(cleanFields([{ label: "New" }])[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cleanFields("x")).toEqual([]);
  });
});
