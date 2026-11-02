import { test, expect } from "@playwright/test";
import { session } from "./roles";

/**
 * Nothing on a 390px phone may be wider than the screen (@mobile, run under
 * the mobile project). A page that is wider gets zoomed out by the phone and
 * every tap target shrinks with it. Two things did this after the redesign:
 * the Today page's attention list (a long list of names), and the staff
 * table's hidden "Open" label, which sat outside its scroll wrapper.
 */
const PAGES = ["/org", "/org/learners", "/org/learners/statistics", "/org/learners/stars", "/org/clients", "/org/courses", "/org/courses/admin", "/org/certificates", "/org/due/supervisions", "/org/audits", "/org/complaints", "/org/policies", "/org/forms", "/org/reports", "/org/hr/holidays", "/org/hr/absence", "/org/recruitment", "/org/billing", "/org/settings/hr"];

test("console pages fit a 390px phone @mobile", async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ storageState: session("testManager") });
  const page = await context.newPage();
  const tooWide: string[] = [];
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    const { inner, scroll } = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth }));
    if (scroll > 390 || inner > 390) tooWide.push(`${path}: page ${scroll}px wide, viewport ${inner}px`);
  }
  // A carer's file, and its Training tab.
  await page.goto("/org/learners", { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/org/staff/"]').first().getAttribute("href");
  for (const path of href ? [href, `${href}?tab=training`] : []) {
    await page.goto(path, { waitUntil: "networkidle" });
    const { inner, scroll } = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth }));
    if (scroll > 390 || inner > 390) tooWide.push(`${path}: page ${scroll}px wide, viewport ${inner}px`);
  }
  await context.close();
  expect(tooWide).toEqual([]);
});

test("carer pages fit a 390px phone @mobile", async ({ browser }) => {
  const context = await browser.newContext({ storageState: session("testStaff") });
  const page = await context.newPage();
  const tooWide: string[] = [];
  for (const path of ["/learn", "/learn/modules", "/learn/certificates", "/learn/policies", "/learn/forms", "/learn/reviews", "/learn/profile", "/learn/notifications", "/learn/hr"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const { inner, scroll } = await page.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth }));
    if (scroll > 390 || inner > 390) tooWide.push(`${path}: page ${scroll}px wide, viewport ${inner}px`);
  }
  await context.close();
  expect(tooWide).toEqual([]);
});

test("the staff list header count matches the All chip", async ({ browser }) => {
  const context = await browser.newContext({ storageState: session("testManager") });
  const page = await context.newPage();
  await page.goto("/org/learners");
  const header = await page.locator("h1 + p").first().innerText();
  const all = await page.getByRole("button", { name: /^All/ }).innerText();
  const n = Number(header.match(/(\d+) (?:people|person)/)?.[1]);
  const m = Number(all.match(/(\d+)/)?.[1]);
  expect(n, `${header} vs ${all}`).toBe(m);
  await context.close();
});
