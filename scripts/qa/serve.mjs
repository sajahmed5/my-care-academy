// Build and serve the app for the QA suite with .env.test, on port 3100.
// `next build` bakes NEXT_PUBLIC_* in, so the build itself runs with the QA
// environment; values already in process.env beat .env.local.
import { spawn, spawnSync } from "node:child_process";
import { assertLocalSupabase, loadTestEnv } from "./env.mjs";

loadTestEnv();
assertLocalSupabase();
const port = new URL(process.env.QA_BASE_URL ?? "http://localhost:3100").port || "3100";
// Never let the QA server send real email or read the live project's keys.
delete process.env.RESEND_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

if (process.env.QA_SKIP_BUILD !== "1") {
  const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: process.env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const server = spawn("npx", ["next", "start", "-p", port], { stdio: "inherit", env: process.env });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
