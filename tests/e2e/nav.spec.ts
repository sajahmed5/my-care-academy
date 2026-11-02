import { test, expect } from "@playwright/test";
import { session } from "./roles";

/**
 * The redesigned top bar: drop-downs open and close by mouse and keyboard,
 * the phone menu works, every old URL still lands somewhere sensible, and
 * each role sees only the menus it may use.
 */
test.describe("top navigation", () => {
  test.use({ storageState: session("testManager") });

  test("drop-downs open by mouse and close with Escape", async ({ page }) => {
    await page.goto("/org");
    const people = page.getByRole("button", { name: /^People/ });
    await people.click();
    await expect(page.getByRole("link", { name: /Clients/ }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: /^Clients/ }).first()).toBeHidden();
  });

  test("drop-downs work from the keyboard: Tab to the menu, Enter opens, Tab reaches its links", async ({ page }) => {
    await page.goto("/org");
    const compliance = page.getByRole("button", { name: /^Compliance/ });
    const panel = page.locator('[data-tour="panel-Compliance"]');
    await compliance.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await panel.evaluate((el) => el.contains(document.activeElement)), "focus moved into the open panel").toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    // The keyboard goes back to the button that opened the panel.
    await expect(compliance).toBeFocused();
  });

  test("the account menu opens and offers sign out", async ({ page }) => {
    await page.goto("/org");
    await page.getByRole("button", { name: /your account/i }).click();
    await expect(page.locator('[data-tour="panel-person"]').getByText(/Sign out/i)).toBeVisible();
  });

  test("the phone menu opens, lists every section and closes @mobile", async ({ page }) => {
    await page.goto("/org");
    const menu = page.getByRole("button", { name: /open menu/i });
    await menu.click();
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: /^Today/ })).toBeVisible();
    // The other sections are headings over their links on a phone.
    for (const label of ["People", "Training", "Compliance", "Documents"]) {
      await expect(nav.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: /close menu/i }).or(menu).first().click();
    await expect(page.getByRole("link", { name: /^Compliance/ }).first()).toBeHidden();
  });

  test("every section's pages are reachable from the menus", async ({ page }) => {
    await page.goto("/org");
    const wanted = ["/org/learners", "/org/clients", "/org/recruitment", "/org/hr/absence", "/org/hr/probation", "/org/hr/cases", "/org/hr/leavers", "/org/courses", "/org/courses/admin", "/org/certificates", "/org/observations", "/org/face-to-face", "/org/due/supervisions", "/org/due/spot-checks", "/org/pips", "/org/audits", "/org/audits/governance", "/org/feedback", "/org/complaints", "/org/policies", "/org/forms", "/org/reports"];
    const missing: string[] = [];
    const hrefs = new Set<string>();
    for (const menu of ["People", "Training", "Compliance", "Documents"]) {
      await page.getByRole("button", { name: new RegExp(`^${menu}`) }).click();
      const panel = page.locator(`[data-tour="panel-${menu}"]`);
      await expect(panel).toBeVisible();
      for (const h of await panel.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""))) hrefs.add(h);
      await page.keyboard.press("Escape");
    }
    for (const w of wanted) if (!hrefs.has(w)) missing.push(w);
    expect(missing).toEqual([]);
  });
});

test("old URLs still work or redirect", async ({ request }) => {
  const api = request;
  const cases: [string, RegExp][] = [
    ["/org/recruitment/settings", /\/org\/settings\/recruitment/],
    ["/org/recruitment/forms", /\/org\/settings\/recruitment\/forms/],
    ["/org/staff-audits/forms", /\/org\/settings\/staff-audits/],
    ["/org/complaints/stages", /\/org\/settings\/complaints\/process/],
    ["/org/complaints/link", /\/org\/settings\/complaints\/link/],
    ["/services", /\/training/],
    ["/rostering", /myroster\.care/],
  ];
  for (const [from, to] of cases) {
    const res = await api.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBeGreaterThanOrEqual(300);
    expect(res.headers()["location"] ?? "", from).toMatch(to);
  }
});

test("a carer sees the carer menu, not the console", async ({ browser }) => {
  const context = await browser.newContext({ storageState: session("testStaff") });
  const page = await context.newPage();
  await page.goto("/learn");
  const text = await page.locator("nav, header").first().innerText();
  expect(text).not.toMatch(/Compliance|Documents|Due/);
  await context.close();
});
