import { test, expect } from "@playwright/test";
import { ROUTES } from "./routes";
import { session, type RoleKey } from "./roles";

/**
 * Open every page a role may use in a real browser and collect what a user
 * would never see: console errors, failed requests, crashed renders, and the
 * Next.js error overlay. One test per role, so the report lists every page.
 */
const CRAWL: { role: RoleKey; who: string[] }[] = [
  { role: "testManager", who: ["public", "any", "manager", "console", "staff"] },
  { role: "testTrainer", who: ["public", "any", "console", "staff"] },
  { role: "testStaff", who: ["public", "any", "staff"] },
  { role: "platformAdmin", who: ["public", "any", "platform"] },
  { role: "emptyManager", who: ["any", "manager", "console", "staff"] },
];
const SKIP = new Set(["/apply/form", "/apply/test", "/exit", "/statement", "/reference", "/suspended", "/trial-ended", "/login", "/mfa", "/auth/set-password", "/dashboard"]);
/** Console noise that is not a defect. */
const IGNORE = [/Download the React DevTools/, /favicon/, /third-party cookie/i, /hydrat/i];

for (const { role, who } of CRAWL) {
  test(`${role}: every page opens cleanly`, async ({ browser }) => {
    test.setTimeout(10 * 60_000);
    const context = await browser.newContext({ storageState: session(role) });
    const page = await context.newPage();
    const problems: string[] = [];
    let current = "";
    page.on("console", (m) => {
      if (m.type() === "error" && !IGNORE.some((re) => re.test(m.text()))) problems.push(`${current}: console error: ${m.text().slice(0, 200)}`);
    });
    page.on("pageerror", (e) => problems.push(`${current}: page error: ${e.message.slice(0, 200)}`));
    page.on("response", (r) => {
      const url = r.url();
      if (r.status() >= 400 && !/_next\/|favicon/.test(url)) problems.push(`${current}: ${r.status()} ${url.replace(/^https?:\/\/[^/]+/, "")}`);
    });
    const pages = ROUTES.filter((r) => who.includes(r.who) && !SKIP.has(r.path));
    for (const { path } of pages) {
      current = path;
      const res = await page.goto(path, { waitUntil: "networkidle" }).catch((e) => {
        problems.push(`${path}: navigation failed: ${String(e).slice(0, 120)}`);
        return null;
      });
      if (!res) continue;
      const text = await page.locator("body").innerText().catch(() => "");
      if (/Application error|Something went wrong|Internal Server Error|This page could not be found/i.test(text)) {
        problems.push(`${path}: error page shown (${res.status()})`);
      }
    }
    await context.close();
    expect(problems, `${pages.length} pages visited`).toEqual([]);
  });
}
