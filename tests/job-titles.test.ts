import { describe, expect, it } from "vitest";
import { DEFAULT_JOB_TITLES, jobTitlesOf } from "@/lib/recruitment";
import { applicationSections } from "@/lib/recruitment-application";

const roleOptions = (titles?: string[]) =>
  applicationSections(null, titles).flatMap((s) => s.fields).find((f) => f.id === "roleApplied")?.options;

describe("job titles (issue #83)", () => {
  it("uses ours until a company names its own", () => {
    expect(jobTitlesOf(null)).toEqual(DEFAULT_JOB_TITLES);
    expect(jobTitlesOf(["", "  "])).toEqual(DEFAULT_JOB_TITLES);
  });

  it("tidies a company's list: trimmed, no repeats, main title first", () => {
    expect(jobTitlesOf(["  Support  worker ", "Senior support worker", "support worker", ""])).toEqual(["Support worker", "Senior support worker"]);
  });

  it("puts the company's titles on the application form", () => {
    expect(roleOptions()).toEqual(DEFAULT_JOB_TITLES);
    expect(roleOptions(["Support worker", "Team leader"])).toEqual(["Support worker", "Team leader"]);
  });
});
