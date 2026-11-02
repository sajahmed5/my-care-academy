// Full-page screenshots of the redesigned pages at 1440px and 390px, signed
// in with the saved QA sessions, for comparing against docs/redesign/.
//
//   node scripts/qa/screenshots.mjs <out-dir> [role=testManager]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { loadTestEnv } from "./env.mjs";

loadTestEnv();
const out = process.argv[2] ?? "test-results/screens";
const role = process.argv[3] ?? "testManager";
const base = process.env.QA_BASE_URL ?? "http://localhost:3100";
mkdirSync(out, { recursive: true });

const PAGES = [
  ["today", "/org"],
  ["due", "/org/due/supervisions"],
  ["staff-list", "/org/learners"],
  ["staff-needs-attention", "/org/learners?view=attention"],
  ["clients", "/org/clients"],
  ["courses", "/org/courses"],
  ["matrix", "/org/learners/statistics"],
  ["audits", "/org/audits"],
  ["complaints", "/org/complaints"],
  ["policies", "/org/policies"],
  ["forms", "/org/forms"],
  ["reports", "/org/reports"],
  ["billing", "/org/billing"],
  ["settings", "/org/settings/hr"],
  ["holidays", "/org/hr/holidays"],
  ["recruitment", "/org/recruitment"],
];

const browser = await chromium.launch();
for (const [width, tag] of [[1440, "desktop"], [390, "mobile"]]) {
  const context = await browser.newContext({
    storageState: path.resolve("tests/e2e/.auth", `${role}.json`),
    viewport: { width, height: width === 390 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width === 390,
    hasTouch: width === 390,
    baseURL: base,
  });
  const page = await context.newPage();
  for (const [name, url] of PAGES) {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(out, `${name}-${tag}.png`), fullPage: true });
  }
  // A staff profile: the first carer in the list.
  await page.goto("/org/learners", { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/org/staff/"]').first().getAttribute("href");
  if (href) {
    await page.goto(href, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(out, `staff-profile-${tag}.png`), fullPage: true });
    await page.goto(`${href}?tab=training`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(out, `staff-profile-training-${tag}.png`), fullPage: true });
  }
  // The Compliance drop-down open (desktop) / the hamburger menu (mobile).
  await page.goto("/org", { waitUntil: "networkidle" });
  if (width === 1440) {
    await page.getByRole("button", { name: /^Compliance/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `menu-compliance-${tag}.png`) });
  } else {
    await page.getByRole("button", { name: /menu/i }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `menu-mobile-${tag}.png`), fullPage: true });
  }
  await context.close();
}
await browser.close();
console.log(`screenshots in ${out}`);
