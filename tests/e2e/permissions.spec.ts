import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { ROUTES, type Who } from "./routes";
import { ROLES, session, type RoleKey } from "./roles";

/**
 * The permissions matrix (docs/QA-REPORT.md §4) as a test: every static page,
 * fetched as every role (and signed out), must answer 200 where the role is
 * allowed and send everyone else away — to sign-in, to their own home, or to
 * the "not in your package" page. Redirects are not followed, so a page that
 * quietly bounces somewhere unexpected is caught too.
 */

/** Pages whose job is to redirect even for an allowed role. */
const KNOWN_REDIRECTS = new Set(["/dashboard", "/org/due", "/org/forms/own", "/org/incidents", "/org/today", "/org/settings", "/org/forms/fill", "/login", "/auth/set-password", "/mfa"]);
/** Public pages that need a token or a signed-out visitor; checked elsewhere. */
/** Also skipped: the two form editors (404 without a ?key) and two old URLs that only redirect to pages tested here. */
const SKIP = new Set(["/apply/form", "/apply/test", "/exit", "/statement", "/reference", "/suspended", "/trial-ended", "/login", "/mfa", "/auth/set-password", "/org/settings/service-audits/edit", "/org/settings/staff-audits/edit", "/org/forms/own", "/org/incidents"]);

/** Which role keys play which part. "signedOut" has no session. */
const CAST: { role: RoleKey | "signedOut"; home: string; roles: Who[]; tier: "full" | "growth" }[] = [
  { role: "platformAdmin", home: "/platform", roles: ["public", "any", "platform"], tier: "full" },
  { role: "testManager", home: "/org", roles: ["public", "any", "manager", "console", "staff"], tier: "full" },
  { role: "testTrainer", home: "/org", roles: ["public", "any", "console", "staff"], tier: "full" },
  { role: "otherManager", home: "/org", roles: ["public", "any", "manager", "console", "staff"], tier: "growth" },
  { role: "testStaff", home: "/learn", roles: ["public", "any", "staff"], tier: "full" },
  { role: "candidate", home: "/my-application", roles: ["public", "any", "candidate"], tier: "full" },
  { role: "signedOut", home: "/login", roles: ["public"], tier: "full" },
];

/** What Growth (QA Other Care) has; anything else is locked for it. */
const GROWTH = new Set(["training.courses", "training.matrix", "training.programmes", "recruitment.tracker", "people.supervisions", "people.competency", "clients.list", "people.performance_plans"]);

function expectation(path: string, who: Who, feature: string | null, cast: (typeof CAST)[number]): "allowed" | "login" | "home" | "locked" {
  if (!cast.roles.includes(who)) return cast.role === "signedOut" ? "login" : "home";
  if (feature && cast.tier === "growth" && !GROWTH.has(feature)) return "locked";
  return "allowed";
}

for (const cast of CAST) {
  test.describe(`as ${cast.role}`, () => {
    let api: APIRequestContext;
    test.beforeAll(async ({ baseURL }) => {
      api = await playwrightRequest.newContext({
        baseURL,
        storageState: cast.role === "signedOut" ? undefined : session(cast.role),
      });
    });
    test.afterAll(async () => api.dispose());

    for (const { path, who, feature } of ROUTES) {
      if (SKIP.has(path)) continue;
      const want = expectation(path, who, feature, cast);
      test(`${path} → ${want}`, async () => {
        const res = await api.get(path, { maxRedirects: 0 });
        const status = res.status();
        const location = res.headers()["location"] ?? "";
        const target = location.replace(/^https?:\/\/[^/]+/, "");
        const info = `${status} ${target}`;
        if (want === "allowed") {
          if (KNOWN_REDIRECTS.has(path)) {
            expect(status, info).toBeGreaterThanOrEqual(300);
            expect(status, info).toBeLessThan(400);
            expect(target, info).not.toMatch(/^\/login/);
          } else {
            expect(status, info).toBe(200);
          }
        } else if (want === "login") {
          expect(status, info).toBeGreaterThanOrEqual(300);
          expect(target, info).toMatch(/^\/login/);
        } else if (want === "locked") {
          expect(status, info).toBeGreaterThanOrEqual(300);
          // Carer-side pages have no locked page: they go back to /learn.
          expect(target, info).toMatch(path.startsWith("/learn") ? /^\/learn(\?|$)/ : /^\/org\/locked\//);
        } else {
          expect(status, info).toBeGreaterThanOrEqual(300);
          expect(status, info).toBeLessThan(400);
          // Sent to their own home — never to the page, never to sign-in.
          expect(target, info).toMatch(new RegExp(`^${cast.home}(\\?|/|$)`));
        }
      });
    }
  });
}

test("signed-out visitor to a protected page is sent to sign in, keeping the way back", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.get("/org/learners", { maxRedirects: 0 });
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.headers()["location"]).toContain("/login?redirectTo=%2Forg%2Flearners");
  await api.dispose();
});

test("roles land on their own home from /dashboard", async ({ browser }) => {
  for (const role of Object.keys(ROLES) as RoleKey[]) {
    const context = await browser.newContext({ storageState: session(role) });
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page, role).toHaveURL(new RegExp(`${ROLES[role].home}`));
    await context.close();
  }
});
