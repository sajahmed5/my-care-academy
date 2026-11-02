import { test, expect } from "@playwright/test";
import { session } from "./roles";

test.describe("signed-in homes", () => {
  test("manager lands on Today", async ({ browser }) => {
    const context = await browser.newContext({ storageState: session("testManager") });
    const page = await context.newPage();
    await page.goto("/org");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await context.close();
  });
});
