import { describe, expect, it } from "vitest";
import { SETTINGS_GROUPS, visibleSettingsGroups } from "../app/org/settings/settings-groups";

type Enabled = Parameters<typeof visibleSettingsGroups>[1];

const titles = (enabled: Enabled) => visibleSettingsGroups(SETTINGS_GROUPS, enabled).map((g) => g.title);
const formsPages = (enabled: Enabled) =>
  visibleSettingsGroups(SETTINGS_GROUPS, enabled)
    .find((g) => g.title === "Forms")
    ?.pages.map((p) => p.href);

describe("visibleSettingsGroups", () => {
  it("always shows a group with no features", () => {
    expect(titles({})).toEqual(["Your company"]);
  });

  it("shows a group when the package has any one of its features", () => {
    expect(titles({ "people.competency": true })).toContain("Staff audits");
  });

  it("shows only the forms page with the forms builder alone", () => {
    expect(formsPages({ "forms.builder": true })).toEqual(["/org/settings/forms"]);
  });

  it("shows only the surveys page with feedback alone", () => {
    expect(formsPages({ "quality.feedback": true })).toEqual(["/org/settings/forms/surveys"]);
  });

  it("shows both forms pages with both", () => {
    expect(formsPages({ "forms.builder": true, "quality.feedback": true })).toEqual([
      "/org/settings/forms",
      "/org/settings/forms/surveys",
    ]);
  });

  it("drops a group left with no pages", () => {
    const groups = visibleSettingsGroups(
      [{ title: "Gated", pages: [{ href: "/x", label: "X", hint: "", feature: "forms.builder" }] }],
      {},
    );
    expect(groups).toEqual([]);
  });
});
