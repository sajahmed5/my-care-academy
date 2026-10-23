import { describe, expect, it } from "vitest";
import { withoutGated } from "../lib/features";

const NAV = [
  { href: "/org", label: "Overview" },
  { href: "/org/forms", label: "Forms", feature: "forms.builder" as const },
  {
    href: "/org/recruitment",
    label: "Recruitment",
    children: [
      { href: "/org/recruitment", label: "Candidates", feature: "recruitment.tracker" as const },
      { href: "/org/recruitment/policies", label: "Policies", feature: "documents.library" as const },
    ],
  },
];

describe("withoutGated", () => {
  it("keeps ungated items whatever is enabled", () => {
    expect(withoutGated(NAV, {}).map((i) => i.href)).toEqual(["/org"]);
  });

  it("shows a gated item only when its feature is on", () => {
    const shown = withoutGated(NAV, { "forms.builder": true });
    expect(shown.map((i) => i.href)).toEqual(["/org", "/org/forms"]);
  });

  // The mobile strip reads item.children straight off the item, so this is the
  // property that stops a gated page appearing on phones only.
  it("filters children on the item itself", () => {
    const shown = withoutGated(NAV, { "recruitment.tracker": true });
    const recruitment = shown.find((i) => i.href === "/org/recruitment");
    expect(recruitment?.children?.map((c) => c.label)).toEqual(["Candidates"]);
  });

  it("drops a section whose pages are all gated off", () => {
    const shown = withoutGated(NAV, { "forms.builder": true });
    expect(shown.find((i) => i.href === "/org/recruitment")).toBeUndefined();
  });

  it("treats a missing key as off, not on", () => {
    const shown = withoutGated(NAV, { "forms.builder": false });
    expect(shown.find((i) => i.href === "/org/forms")).toBeUndefined();
  });
});
