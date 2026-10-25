import { describe, expect, it } from "vitest";
import { entryNamer, extOf, safeEntry } from "../lib/evidence-files";

describe("naming the files in an evidence ZIP", () => {
  it("strips characters a ZIP entry cannot carry", () => {
    expect(safeEntry('Right to Work: "share code"/2026')).toBe("Right to Work share code2026");
    expect(safeEntry("   ")).toBe("file");
  });
  it("takes the extension from a name or path, or bin when there is none", () => {
    expect(extOf("org/cand/dbs-123-DBS Gap Form.PDF")).toBe("pdf");
    expect(extOf("photo.jpeg")).toBe("jpeg");
    expect(extOf("no-extension")).toBe("bin");
    expect(extOf(null)).toBe("bin");
  });
  it("never lets a second file overwrite the first", () => {
    const name = entryNamer();
    expect(name("Certificates", "Fire Safety - 1 Mar 2026", "pdf")).toBe("Certificates/Fire Safety - 1 Mar 2026.pdf");
    expect(name("Certificates", "Fire Safety - 1 Mar 2026", "pdf")).toBe("Certificates/Fire Safety - 1 Mar 2026 (2).pdf");
    expect(name("Certificates", "fire safety - 1 mar 2026", "pdf")).toBe("Certificates/fire safety - 1 mar 2026 (3).pdf");
    expect(name("Care Certificate", "Fire Safety - 1 Mar 2026", "pdf")).toBe("Care Certificate/Fire Safety - 1 Mar 2026.pdf");
  });
});
