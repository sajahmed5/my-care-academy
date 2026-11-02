// Build and serve the app for the QA suite with .env.test, on port 3100.
// `next build` bakes NEXT_PUBLIC_* in, so the build itself runs with the QA
// environment, and neither the build nor the server reads .env.local.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { assertLocalSupabase, loadTestEnv } from "./env.mjs";

loadTestEnv();
assertLocalSupabase();
const port = new URL(process.env.QA_BASE_URL ?? "http://localhost:3100").port || "3100";
// Never let the QA server send real email, call the AI or read the live
// project's keys. `next start` reads .env.local itself, so deleting a key
// here is not enough: an empty value is set, which wins over the file and
// reads as "not configured" in the app.
for (const key of ["RESEND_API_KEY", "ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "UNSPLASH_ACCESS_KEY", "VERCEL_OIDC_TOKEN"]) {
  delete process.env[key];
}
// An empty value is not enough either: Next drops empty variables and then
// reads .env.local anyway, which is how a QA run once sent a real enquiry
// email. This flag tells Next the environment is already processed, so it
// reads no env file at all and the server sees only what .env.test holds;
// EMAIL_SENDING=off is the second lock (lib/email.ts).
process.env.__NEXT_PROCESSED_ENV = "true";
process.env.EMAIL_SENDING = "off";

if (process.env.QA_SKIP_BUILD !== "1") {
  const build = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: process.env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
// The server's own output goes to a file as well, so a "Something went wrong"
// seen in a test can be traced by its digest: test-results/qa-server.log.
mkdirSync("test-results", { recursive: true });
const log = createWriteStream("test-results/qa-server.log", { flags: "a" });
const server = spawn("npx", ["next", "start", "-p", port], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
}
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
server.on("exit", (code) => process.exit(code ?? 0));
