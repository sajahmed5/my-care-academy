import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { session } from "./roles";

/**
 * WCAG 2.1 AA checks with axe on the main pages of every area, signed in as
 * the role that uses them. Only serious and critical violations fail the
 * test; the rest are listed in the report for the owner.
 */
const PAGES: { role: "testManager" | "testStaff" | "platformAdmin" | null; paths: string[] }[] = [
  { role: null, paths: ["/", "/training", "/training/pricing", "/contact", "/login", "/forgot-password", "/verify"] },
  { role: "testManager", paths: ["/org", "/org/learners", "/org/clients", "/org/courses", "/org/courses/admin", "/org/due/supervisions", "/org/audits", "/org/complaints", "/org/policies", "/org/forms", "/org/reports", "/org/billing", "/org/hr/holidays", "/org/learners/admin"] },
  { role: "testStaff", paths: ["/learn", "/learn/modules", "/learn/certificates", "/learn/policies", "/learn/profile"] },
  { role: "platformAdmin", paths: ["/platform", "/platform/organisations", "/platform/courses", "/platform/tiers"] },
];

for (const { role, paths } of PAGES) {
  test(`axe: ${role ?? "public"} pages have no serious accessibility violations`, async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext(role ? { storageState: session(role) } : {});
    const page = await context.newPage();
    const serious: string[] = [];
    const minor: string[] = [];
    for (const path of paths) {
      await page.goto(path, { waitUntil: "networkidle" });
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of results.violations) {
        const line = `${path}: ${v.id} (${v.impact}) ×${v.nodes.length} — ${v.help} — e.g. ${v.nodes[0]?.target.join(" ")}`;
        (v.impact === "serious" || v.impact === "critical" ? serious : minor).push(line);
      }
    }
    await context.close();
    if (minor.length) console.log(`\nMinor/moderate axe findings (${role ?? "public"}):\n  ${minor.join("\n  ")}`);
    expect(serious).toEqual([]);
  });
}
