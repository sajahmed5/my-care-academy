import { describe, expect, it } from "vitest";
import { CONSOLE_ROLES, dashboardPathForRole, isConsoleRole, roleLabel } from "../lib/auth";

describe("the office worker is a console role", () => {
  it("both console roles land on the console; a learner does not", () => {
    expect(dashboardPathForRole("org_admin")).toBe("/org");
    expect(dashboardPathForRole("org_office")).toBe("/org");
    expect(dashboardPathForRole("learner")).toBe("/learn");
  });

  it("isConsoleRole admits exactly the two console roles", () => {
    expect(CONSOLE_ROLES).toEqual(["org_admin", "org_office"]);
    expect(isConsoleRole("org_admin")).toBe(true);
    expect(isConsoleRole("org_office")).toBe(true);
    expect(isConsoleRole("learner")).toBe(false);
    expect(isConsoleRole("platform_admin")).toBe(false);
    expect(isConsoleRole(null)).toBe(false);
  });

  it("reads as a manager would say it", () => {
    expect(roleLabel("platform_admin")).toBe("Platform admin");
    expect(roleLabel("org_admin")).toBe("Manager");
    expect(roleLabel("org_office")).toBe("Office");
    expect(roleLabel("learner")).toBe("Learner");
    expect(roleLabel(null)).toBe("No role");
  });
});
