// Write the local Supabase stack's URL and keys into .env.test (git-ignored),
// starting from .env.test.example the first time. Run after `supabase start`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { ENV_FILE, readEnvFile, writeEnvFile } from "./env.mjs";

if (!fs.existsSync(ENV_FILE)) fs.copyFileSync(".env.test.example", ENV_FILE);

let status;
try {
  status = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  console.error("Could not read the local Supabase stack. Is it running? Try: npx supabase start");
  console.error(String(e.stderr ?? e.message).trim());
  process.exit(1);
}
const kv = {};
for (const line of status.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
  if (m) kv[m[1]] = m[2];
}
const url = kv.API_URL;
const anon = kv.ANON_KEY ?? kv.PUBLISHABLE_KEY;
const service = kv.SERVICE_ROLE_KEY ?? kv.SECRET_KEY;
if (!url || !anon || !service) {
  console.error("supabase status did not print API_URL / ANON_KEY / SERVICE_ROLE_KEY:", Object.keys(kv).join(", "));
  process.exit(1);
}
const current = readEnvFile().values;
writeEnvFile({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  MFA_ENFORCED: current.MFA_ENFORCED || "false",
  CRON_SECRET: current.CRON_SECRET || "qa-cron-secret",
  QA_BASE_URL: current.QA_BASE_URL || "http://localhost:3100",
});
console.log(`.env.test now points at the local stack (${url}).`);
