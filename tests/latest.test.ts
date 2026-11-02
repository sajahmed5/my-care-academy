import { describe, expect, it } from "vitest";
import { LATEST, allHref, latest } from "@/lib/latest";

describe("latest()", () => {
  const rows = Array.from({ length: 250 }, (_, i) => i);
  it("shows the first 200 and says so", () => {
    const l = latest(rows, undefined);
    expect(l.rows).toHaveLength(LATEST);
    expect(l.total).toBe(250);
    expect(l.cut).toBe(true);
  });
  it("shows everything with ?all=1", () => {
    for (const all of ["1", "true", true] as const) expect(latest(rows, all)).toMatchObject({ total: 250, cut: false });
    expect(latest(rows, "1").rows).toHaveLength(250);
  });
  it("is not cut when the list fits", () => {
    expect(latest(rows.slice(0, 200), undefined)).toMatchObject({ cut: false, total: 200 });
    expect(latest([], undefined)).toMatchObject({ cut: false, total: 0, rows: [] });
  });
  it("keeps the other filters in the View all link", () => {
    expect(allHref("/org/complaints", { status: "open", q: "sling", all: undefined })).toBe("/org/complaints?status=open&q=sling&all=1");
    expect(allHref("/org/complaints", { kind: ["a", "b"] })).toBe("/org/complaints?kind=a&kind=b&all=1");
    expect(allHref("/org/complaints")).toBe("/org/complaints?all=1");
  });
});
