import { describe, expect, it } from "vitest";
import { blanksIn, fillKnownBlanks, knownBlanks } from "@/lib/signing-documents";

describe("knownBlanks (issue #85)", () => {
  it("fills probation and the holiday year from the company's settings", () => {
    const known = knownBlanks({ probationMonths: 6, yearStart: "04-01" });
    expect(known["[length of probation]"]).toBe("6 months");
    expect(known["[start and end of the holiday year]"]).toBe("1 April to 31 March");
    expect(knownBlanks({ probationMonths: 1, yearStart: "01-01" })["[start and end of the holiday year]"]).toBe("1 January to 31 December");
    expect(knownBlanks({ probationMonths: 1, yearStart: "01-01" })["[length of probation]"]).toBe("1 month");
  });

  it("leaves the blanks it doesn't know, and every merge field", () => {
    const body = "Probation is [length of probation]. Pay is [basic hourly rate]. {{companyName}}";
    const out = fillKnownBlanks(body, knownBlanks({ probationMonths: 3, yearStart: "01-01" }));
    expect(out).toBe("Probation is 3 months. Pay is [basic hourly rate]. {{companyName}}");
    expect(blanksIn(out)).toEqual(["[basic hourly rate]"]);
  });
});
