import path from "node:path";

/**
 * The logins the seed writes to .env.test (scripts/seed-test-orgs.mjs), one
 * saved browser session each. A spec picks one with `test.use({ storageState: session("testManager") })`.
 */
export const ROLES = {
  platformAdmin: { env: "QA_PLATFORM_ADMIN", home: "/platform" },
  testManager: { env: "QA_TEST_MANAGER", home: "/org" },
  testTrainer: { env: "QA_TEST_TRAINER", home: "/org" },
  testStaff: { env: "QA_TEST_STAFF", home: "/learn" },
  testStaffNew: { env: "QA_TEST_STAFF_NEW", home: "/learn" },
  emptyManager: { env: "QA_EMPTY_MANAGER", home: "/org" },
  otherManager: { env: "QA_OTHER_MANAGER", home: "/org" },
  portalManager: { env: "QA_PORTAL_MANAGER", home: "/org" },
  candidate: { env: "QA_CANDIDATE", home: "/my-application" },
} as const;

export type RoleKey = keyof typeof ROLES;

export const AUTH_DIR = path.resolve(__dirname, ".auth");

export function session(role: RoleKey): string {
  return path.join(AUTH_DIR, `${role}.json`);
}

export function credentials(role: RoleKey): { email: string; password: string } {
  const { env } = ROLES[role];
  const email = process.env[`${env}_EMAIL`];
  const password = process.env[`${env}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`${env}_EMAIL / ${env}_PASSWORD missing from .env.test — run npm run qa:seed`);
  }
  return { email, password };
}

/** A seeded id or value from .env.test, e.g. QA_TEST_ORG_ID. */
export function seeded(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} missing from .env.test — run npm run qa:seed`);
  return v;
}
