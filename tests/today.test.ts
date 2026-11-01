import { describe, expect, it } from "vitest";
import { checkOf, codeOf, complianceChecks, readiness, rowFromLine, sortRows, splitLine, type AttentionRow } from "../lib/today";

const row = (check: string, tone: "alert" | "warn"): AttentionRow => ({
  key: `${check}:${tone}`,
  code: "XX",
  title: check,
  meta: "",
  pill: { label: "", tone: "warn" },
  href: "/",
  action: "",
  check,
  tone,
});

describe("complianceChecks", () => {
  it("is training alone for Starter", () => {
    expect(complianceChecks({})).toEqual(["training"]);
  });

  it("adds a check per add-on the company has", () => {
    expect(complianceChecks({ "people.supervisions": true, "quality.audits": true })).toEqual(["training", "supervisions", "appraisals", "audits"]);
  });
});

describe("readiness", () => {
  it("reads 100% with nothing late", () => {
    expect(readiness(["training", "audits"], [row("audits", "warn")])).toEqual({ pct: 100, met: 2, total: 2, toFix: 0 });
  });

  it("costs one check however many late things sit behind it", () => {
    const r = readiness(["training", "supervisions", "appraisals", "audits"], [row("supervisions", "alert"), row("supervisions", "alert"), row("training", "warn")]);
    expect(r.pct).toBe(75);
    expect(r.toFix).toBe(2);
  });
});

describe("checkOf", () => {
  it("maps where a line leads to the check it counts against", () => {
    expect(checkOf("/org/due/appraisals")).toBe("appraisals");
    expect(checkOf("/org/due/audits")).toBe("audits");
    expect(checkOf("/org/audits/new?form=infection_control")).toBe("audits");
    expect(checkOf("/org/complaints?status=open")).toBe("complaints");
    expect(checkOf("/org/hr/documents")).toBe("documents");
    expect(checkOf("/org/staff/abc/supervisions/new?kind=appraisal")).toBe("appraisals");
    expect(checkOf("/org/learners?filter=overdue")).toBe("training");
  });
});

describe("codeOf", () => {
  it("takes two letters from an audit's name", () => {
    expect(codeOf("audits", "Infection prevention and control audit")).toBe("IP");
    expect(codeOf("audits", "Staff file audit")).toBe("SF");
    expect(codeOf("audits", "Client QA")).toBe("CL");
  });

  it("has a fixed code per check otherwise", () => {
    expect(codeOf("supervisions")).toBe("SV");
    expect(codeOf("policies")).toBe("PO");
  });
});

describe("rowFromLine", () => {
  it("splits a to-do line into its title and what is behind it", () => {
    expect(splitLine({ key: "k", tone: "alert", text: "Spot checks: 1 person has never had one", href: "/org/due/spot-checks", action: "See who" })).toEqual({
      title: "Spot checks",
      meta: "1 person has never had one",
    });
    const r = rowFromLine({ key: "k", tone: "warn", text: "Policy reviews: 2 due soon", href: "/org/due/policies", action: "See which" });
    expect(r.code).toBe("PO");
    expect(r.pill).toEqual({ label: "Due soon", tone: "warn" });
    expect(r.check).toBe("policies");
  });

  it("keeps a sentence whole when it has no label", () => {
    expect(splitLine({ key: "k", tone: "alert", text: "2 new concerns waiting to be looked at", href: "/org/complaints", action: "Open them" })).toEqual({
      title: "2 new concerns waiting to be looked at",
      meta: "",
    });
  });
});

describe("sortRows", () => {
  it("puts late things first and keeps the rest in order", () => {
    const sorted = sortRows([row("a", "warn"), row("b", "alert"), row("c", "warn"), row("d", "alert")]);
    expect(sorted.map((r) => r.check)).toEqual(["b", "d", "a", "c"]);
  });
});
