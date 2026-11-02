import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-path";

describe("safeInternalPath", () => {
  it("keeps a path on this site", () => {
    expect(safeInternalPath("/org/learners", "/dashboard")).toBe("/org/learners");
    expect(safeInternalPath("/learn?tab=done#top", "/dashboard")).toBe("/learn?tab=done#top");
  });

  it("turns away every way of naming another host", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\\\\evil.com", "https://evil.com", "evil.com", "/%2F%2Fevil.com", "/%5cevil.com", "/org\\evil", " //evil.com", "/\tevil", "", null, undefined]) {
      expect(safeInternalPath(bad, "/dashboard"), String(bad)).toBe("/dashboard");
    }
  });
});
