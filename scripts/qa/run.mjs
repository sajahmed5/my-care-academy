// `npm run test:qa`: reset and seed the local stack, run the end-to-end
// suite (Playwright, signed in as every role) and the unit/integration suite
// (Vitest), all against the local Supabase stack. Stops at the first failure.
import { spawnSync } from "node:child_process";
import { assertLocalSupabase, loadTestEnv } from "./env.mjs";

function step(label, cmd, args, extraEnv = {}) {
  console.log(`\n=== ${label}: ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

step("Local stack keys", "node", ["scripts/qa/local-env.mjs"]);
loadTestEnv();
assertLocalSupabase();
step("Seed QA organisations", "node", ["scripts/seed-test-orgs.mjs"]);
loadTestEnv();
step("End-to-end (Playwright)", "npx", ["playwright", "test"]);
// The Vitest suites create and remove their own rows; with .env.test loaded
// first, tests/helpers.ts's .env.local read changes nothing.
step("Unit and integration (Vitest)", "npx", ["vitest", "run"]);
console.log("\nQA suite passed.");
