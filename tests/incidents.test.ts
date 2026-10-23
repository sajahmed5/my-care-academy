import { describe, expect, it } from "vitest";
import {
  INCIDENT_CATEGORIES,
  categoryLabel,
  kindLabel,
  statusLabel,
  suggestionsFor,
  type CourseRef,
} from "../lib/incidents";

const CATALOGUE: CourseRef[] = [
  { id: "c-med", slug: "medication-awareness", title: "Medication Awareness" },
  { id: "c-rec", slug: "record-keeping-and-documentation", title: "Record Keeping & Documentation" },
  { id: "c-dig", slug: "privacy-and-dignity", title: "Privacy & Dignity" },
  { id: "c-pcc", slug: "person-centred-care", title: "Person-Centred Care" },
];

const suggest = (category: string, assigned = new Map<string, string | null>()) =>
  suggestionsFor({ category, courses: CATALOGUE, assigned });

describe("suggestionsFor", () => {
  it("suggests the courses mapped to the category", () => {
    expect(suggest("medication").map((s) => s.course.slug)).toEqual([
      "medication-awareness",
      "record-keeping-and-documentation",
    ]);
  });

  it("suggests nothing for a category that maps to nothing", () => {
    expect(suggest("other")).toEqual([]);
  });

  it("suggests nothing for a category it has never heard of", () => {
    expect(suggest("invented")).toEqual([]);
  });

  it("drops a course the catalogue no longer has, rather than breaking", () => {
    // 'dignity' maps to two courses; hand it a catalogue with only one.
    const thin = suggestionsFor({
      category: "dignity",
      courses: [CATALOGUE[2]],
      assigned: new Map(),
    });
    expect(thin.map((s) => s.course.slug)).toEqual(["privacy-and-dignity"]);
  });

  it("keeps an assigned course in the list, marked, with its reason", () => {
    const assigned = new Map<string, string | null>([["c-med", "Refresher after the MAR error"]]);
    const [first, second] = suggest("medication", assigned);
    expect(first.assigned).toBe(true);
    expect(first.reason).toBe("Refresher after the MAR error");
    expect(second.assigned).toBe(false);
    expect(second.reason).toBeNull();
  });

  it("marks an assignment made without a reason", () => {
    const assigned = new Map<string, string | null>([["c-med", null]]);
    expect(suggest("medication", assigned)[0]).toMatchObject({
      assigned: true,
      reason: null,
    });
  });
});

describe("the category map", () => {
  it("never suggests a course twice for one category", () => {
    for (const category of INCIDENT_CATEGORIES) {
      const slugs = [...category.courses];
      expect(new Set(slugs).size, `duplicates in ${category.value}`).toBe(slugs.length);
    }
  });

  it("has a label for every category", () => {
    for (const category of INCIDENT_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
    }
  });
});

describe("labels", () => {
  it("read as a manager would say them", () => {
    expect(kindLabel("near_miss")).toBe("Near miss");
    expect(categoryLabel("missed_visit")).toBe("Missed or late visit");
    expect(statusLabel("investigating")).toBe("Investigating");
  });

  it("fall back to the raw value for anything unknown", () => {
    expect(kindLabel("mystery")).toBe("mystery");
    expect(categoryLabel("mystery")).toBe("mystery");
    expect(statusLabel("mystery")).toBe("mystery");
  });
});
