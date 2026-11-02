import { describe, expect, it } from "vitest";
import { AREAS, areaForPath, isHiddenPath, sanitiseHiddenAreas } from "@/lib/office-access";

describe("areaForPath()", () => {
  it("finds the area of a page and everything under it", () => {
    expect(areaForPath("/org/clients")?.key).toBe("people.clients");
    expect(areaForPath("/org/clients/123/edit")?.key).toBe("people.clients");
    expect(areaForPath("/org/hr/cases/abc?tab=notes")?.key).toBe("people.cases");
    expect(areaForPath("/org/due/audits")?.key).toBe("compliance.audits");
  });
  it("prefers the more specific pattern on a person's file", () => {
    expect(areaForPath("/org/staff/u1")?.key).toBe("people.staff");
    expect(areaForPath("/org/staff/u1/evidence/files")?.key).toBe("people.documents");
    expect(areaForPath("/org/staff/u1/supervisions/new")?.key).toBe("compliance.checks");
  });
  it("leaves Today, settings and the rest alone", () => {
    for (const p of ["/org", "/org/settings", "/org/billing", "/org/managers-only", "/learn", "/org/clientsx"]) expect(areaForPath(p)).toBeNull();
  });
  it("every area key is unique and every path starts under /org", () => {
    expect(new Set(AREAS.map((a) => a.key)).size).toBe(AREAS.length);
    for (const a of AREAS) for (const p of a.paths) expect(p.startsWith("/org/")).toBe(true);
  });
});

describe("isHiddenPath() and sanitiseHiddenAreas()", () => {
  it("hides only the switched-off areas", () => {
    const hidden = new Set(["people.clients"]);
    expect(isHiddenPath("/org/clients/1", hidden)).toBe(true);
    expect(isHiddenPath("/org/learners", hidden)).toBe(false);
    expect(isHiddenPath("/org", hidden)).toBe(false);
    expect(isHiddenPath("/org/clients", [])).toBe(false);
  });
  it("keeps known keys once and drops the rest", () => {
    expect(sanitiseHiddenAreas(["people.clients", "people.clients", "nope", 3, null])).toEqual(["people.clients"]);
    expect(sanitiseHiddenAreas("people.clients")).toEqual([]);
    expect(sanitiseHiddenAreas(undefined)).toEqual([]);
  });
});
