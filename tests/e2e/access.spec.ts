import { expect, test, type Browser } from "@playwright/test";
import { adminDb } from "./db";
import { session } from "./roles";

/**
 * Who can see what (Settings → Your company → Who can see what): a manager
 * switches an area off for office workers, and the office worker loses its
 * pages, its menu items and its Due counts; switching it back on restores
 * them. The QA Test Care office worker is `testTrainer`.
 */
async function orgId(): Promise<string> {
  const { data } = await adminDb().from("organisations").select("id").eq("name", "QA Test Care Ltd").single();
  return data!.id as string;
}
async function setHidden(hidden: string[]): Promise<void> {
  const { error } = await adminDb().from("organisations").update({ office_hidden_areas: hidden }).eq("id", await orgId());
  if (error) throw new Error(error.message);
}
async function as(browser: Browser, role: "testManager" | "testTrainer") {
  const context = await browser.newContext({ storageState: session(role) });
  return { context, page: await context.newPage() };
}

test.describe.serial("who can see what", () => {
  test.afterAll(async () => setHidden([]));

  test("everything is on to start with, and the office worker opens Clients", async ({ browser }) => {
    await setHidden([]);
    const o = await as(browser, "testTrainer");
    try {
      await o.page.goto("/org/clients");
      await expect(o.page).toHaveURL(/\/org\/clients$/);
      await o.page.getByRole("button", { name: "People", exact: true }).click();
      await expect(o.page.getByRole("link", { name: /^Clients/ }).first()).toBeVisible();
    } finally {
      await o.context.close();
    }
  });

  test("a manager switches Clients and HR cases off and the page says so", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await m.page.goto("/org/settings/access");
      await expect(m.page.getByRole("heading", { name: "Who can see what" })).toBeVisible();
      // The switches are visually hidden inputs behind a drawn toggle, so they are set with force.
      const clients = m.page.getByRole("switch", { name: "Clients" });
      await expect(clients).toBeChecked();
      await clients.setChecked(false, { force: true });
      await expect(clients).not.toBeChecked();
      await m.page.getByRole("switch", { name: "Disciplinary and grievance" }).setChecked(false, { force: true });
      await m.page.getByRole("button", { name: "Save" }).click();
      await expect(m.page.getByRole("status")).toContainText("Saved.");
      const { data } = await adminDb().from("organisations").select("office_hidden_areas").eq("id", await orgId()).single();
      expect([...(data!.office_hidden_areas as string[])].sort()).toEqual(["people.cases", "people.clients"]);
      // The manager still opens both.
      await m.page.goto("/org/clients");
      await expect(m.page).toHaveURL(/\/org\/clients$/);
    } finally {
      await m.context.close();
    }
  });

  test("the office worker is sent to the managers-only page and the menu leaves the areas out", async ({ browser }) => {
    const o = await as(browser, "testTrainer");
    try {
      await o.page.goto("/org/clients");
      await expect(o.page).toHaveURL(/\/org\/managers-only\?area=people\.clients$/);
      await expect(o.page.getByRole("heading", { level: 1 })).toHaveText("This is for managers");
      await o.page.goto("/org/hr/cases/new");
      await expect(o.page).toHaveURL(/\/org\/managers-only\?area=people\.cases$/);
      await o.page.goto("/org");
      await o.page.getByRole("button", { name: "People", exact: true }).click();
      await expect(o.page.getByRole("link", { name: /^Staff/ }).first()).toBeVisible();
      await expect(o.page.getByRole("link", { name: /^Clients/ })).toHaveCount(0);
      await expect(o.page.getByRole("link", { name: /^Disciplinary/ })).toHaveCount(0);
      // Settings is managers only regardless, and Today still opens.
      await o.page.goto("/org/settings/access");
      await expect(o.page).not.toHaveURL(/settings\/access/);
    } finally {
      await o.context.close();
    }
  });

  test("the API answers the same way: a redirect, never the page", async ({ browser }) => {
    const o = await as(browser, "testTrainer");
    try {
      const res = await o.page.request.get("/org/clients", { maxRedirects: 0 });
      expect(res.status()).toBeGreaterThanOrEqual(300);
      expect(res.headers()["location"]).toMatch(/\/org\/managers-only\?area=people\.clients$/);
    } finally {
      await o.context.close();
    }
  });

  test("switching the areas back on restores them", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await m.page.goto("/org/settings/access");
      await m.page.getByRole("switch", { name: "Clients" }).setChecked(true, { force: true });
      await m.page.getByRole("switch", { name: "Disciplinary and grievance" }).setChecked(true, { force: true });
      await m.page.getByRole("button", { name: "Save" }).click();
      await expect(m.page.getByRole("status")).toContainText("Saved.");
    } finally {
      await m.context.close();
    }
    const o = await as(browser, "testTrainer");
    try {
      await o.page.goto("/org/clients");
      await expect(o.page).toHaveURL(/\/org\/clients$/);
    } finally {
      await o.context.close();
    }
  });
});
