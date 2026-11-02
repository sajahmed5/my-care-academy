// Shared by the QA scripts: read and write the git-ignored .env.test, and
// refuse to run against anything but a local Supabase stack.
import fs from "node:fs";
import path from "node:path";

export const ENV_FILE = path.resolve(process.cwd(), ".env.test");

/** Parse a dotenv file into an ordered map (comments and blank lines kept). */
export function readEnvFile(file = ENV_FILE) {
  if (!fs.existsSync(file)) return { lines: [], values: {} };
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) values[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return { lines, values };
}

/** Set keys in .env.test, keeping everything else as it was. */
export function writeEnvFile(updates, file = ENV_FILE) {
  const { lines } = readEnvFile(file);
  const out = [...lines];
  const seen = new Set();
  for (let i = 0; i < out.length; i++) {
    const m = out[i].match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && m[1] in updates) {
      out[i] = `${m[1]}=${updates[m[1]]}`;
      seen.add(m[1]);
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  // No trailing blank-line growth.
  while (out.length && out[out.length - 1] === "") out.pop();
  fs.writeFileSync(file, out.join("\n") + "\n", { mode: 0o600 });
}

/** Load .env.test into process.env, overriding whatever is already set. */
export function loadTestEnv() {
  const { values } = readEnvFile();
  for (const [k, v] of Object.entries(values)) process.env[k] = v;
  return values;
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "host.docker.internal"]);

/** Throw unless the Supabase URL in the environment is a local stack. */
export function assertLocalSupabase(url = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    // Fall through to the error below.
  }
  if (!LOCAL_HOSTS.has(host) && !host.endsWith(".localhost")) {
    throw new Error(
      `Refusing to run QA against ${url ?? "(no NEXT_PUBLIC_SUPABASE_URL)"}: ` +
        "the QA scripts only ever run against a local Supabase stack. " +
        "Run `npx supabase start` and `npm run qa:env` first.",
    );
  }
}
