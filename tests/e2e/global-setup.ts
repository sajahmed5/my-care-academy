import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { AUTH_DIR, ROLES, credentials, session, type RoleKey } from "./roles";

/**
 * Sign in once as every role through the real sign-in form and save each
 * session's cookies, so every spec starts already signed in as the right
 * person. No bypass exists in the app: this is the same form a carer uses.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3100";
  mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of Object.keys(ROLES) as RoleKey[]) {
      const { email, password } = credentials(role);
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
      // /dashboard sends each role on to its own home.
      await page.waitForURL((u) => u.pathname.startsWith(ROLES[role].home), { timeout: 30_000 });
      await context.storageState({ path: session(role) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
