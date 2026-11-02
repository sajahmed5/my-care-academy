// Which elements stick out past a 390px phone screen on the given pages.
//   node scripts/qa/overflow.mjs <role> <url> [url...]
import { chromium } from "@playwright/test";
import path from "node:path";
const [,, role="testManager", ...urls] = process.argv;
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: path.resolve("tests/e2e/.auth", `${role}.json`), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, baseURL: "http://localhost:3100" });
const page = await ctx.newPage();
for (const url of urls) {
  await page.goto(url, { waitUntil: "networkidle" });
  const r = await page.evaluate(() => {
    const out = [];
    const sw = document.documentElement.scrollWidth;
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.right > 392 && b.width > 0) {
        const tag = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 3).join(".") : "");
        out.push(`${Math.round(b.left)}-${Math.round(b.right)} ${tag} :: ${(el.textContent || "").trim().slice(0, 40)}`);
      }
    }
    return { sw, out: out.slice(0, 12) };
  });
  console.log(`\n== ${url} scrollWidth=${r.sw}`);
  for (const l of r.out) console.log("  ", l);
}
await browser.close();
