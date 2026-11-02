import { describe, expect, it } from "vitest";
import { PACK_MAX_FILES, describeCertificate, packReadme } from "@/lib/certificate-pack";

describe("packReadme", () => {
  it("writes nothing when every certificate is in the ZIP", () => {
    expect(packReadme({ packed: 12, total: 12, leftOut: [], unreadable: [], byCourse: true })).toBe("");
  });

  it("names what was left out past the file cap and says how to get it", () => {
    const leftOut = ["Jane Doe - Fire Safety (issued 2024-03-01)", "Sam Patel - Moving and Handling (issued 2023-11-20)"];
    const text = packReadme({ packed: PACK_MAX_FILES, total: PACK_MAX_FILES + 2, leftOut, unreadable: [], byCourse: true });
    expect(text).toContain(`${PACK_MAX_FILES} of ${PACK_MAX_FILES + 2} certificate(s) are in this ZIP.`);
    expect(text).toContain("2 were left out");
    expect(text).toContain(`at most ${PACK_MAX_FILES} files`);
    expect(text).toContain("under Staff");
    for (const line of leftOut) expect(text).toContain(line);
  });

  it("tells one carer to fetch the rest from the Certificates page", () => {
    const text = packReadme({ packed: 1, total: 2, leftOut: ["Jane Doe - Fire Safety (issued 2024-03-01)"], unreadable: [], byCourse: false });
    expect(text).toContain("Certificates page");
    expect(text).not.toContain("under Staff");
  });

  it("lists certificates that could not be read from storage", () => {
    const text = packReadme({ packed: 1, total: 2, leftOut: [], unreadable: ["Jane Doe - Fire Safety (issued 2024-03-01)"], byCourse: true });
    expect(text).toContain("1 are recorded but could not be read from storage");
    expect(text).not.toContain("left out");
  });
});

describe("describeCertificate", () => {
  it("names the person, the course and the issue date, falling back when a join is empty", () => {
    expect(describeCertificate({ issued_at: "2024-03-01T10:00:00Z", courses: { title: "Fire Safety" }, users: { full_name: "Jane Doe" } })).toBe(
      "Jane Doe - Fire Safety (issued 2024-03-01)",
    );
    expect(describeCertificate({ issued_at: "2024-03-01", courses: null, users: { email: "j@x.test" } })).toBe("j@x.test - Course (issued 2024-03-01)");
  });
});
