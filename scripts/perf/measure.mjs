// How much each page asks of the database, measured the same way every time.
//
//   npm run perf:measure [-- --out perf-v2.15.5.json]
//
// Builds the COMMITTED code (HEAD) in a throwaway git worktree, runs it with
// `next dev` on a spare port with scripts/perf/meter.cjs preloaded, signs in
// as the QA learner and the QA manager (Demo Care Ltd), loads each page once
// to compile it and once to measure, and records every call that page made to
// Supabase: how many, how many were login checks, the bytes that came back
// and how long the page took. Then, for every organisation, it compares what
// the manager pages used to download (raw assignments and certificates) with
// what org_learner_rollup sends now.
//
// Results go to the speed & egress tracker (ask Claude to "review the
// tracker"). Dev mode on this machine talking to Frankfurt, so the timings
// are for comparing releases, not what a carer sees; call counts and bytes
// are exact.
//
// Needs .env.local with the service-role key and PERF_QA_PASSWORD (the QA
// accounts' password). The database is production: this only reads, plus
// the "last active" write the pages themselves make for the QA accounts.
import { config } from "dotenv";
config({ path: ".env.local" });
import { spawn, execSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const ROOT = resolve(".");
const args = process.argv.slice(2);
const PORT = 3190;
const BASE = `http://localhost:${PORT}`;
const LEARNER = "qa@demo-care.test";
const MANAGER = "qa-admin@demo-care.test";
const { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, PERF_QA_PASSWORD: PASSWORD } = process.env;
if (!URL_ || !ANON || !SERVICE || !PASSWORD) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and PERF_QA_PASSWORD in .env.local");
  process.exit(1);
}

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const release = `v${version}`;
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(tmpdir(), `perf-${release}.json`);
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the build
const work = mkdtempSync(join(tmpdir(), "mca-perf-"));
const tree = join(work, "app");
const meterFile = join(work, "meter.jsonl");
execSync(`git worktree add --detach "${tree}" HEAD`, { stdio: "ignore" });
// Turbopack refuses a node_modules symlink that points outside the project,
// so it is copied (an APFS clone on a Mac: instant, no extra disk).
try {
  execSync(`cp -cR "${join(ROOT, "node_modules")}" "${join(tree, "node_modules")}"`, { stdio: "ignore" });
} catch {
  cpSync(join(ROOT, "node_modules"), join(tree, "node_modules"), { recursive: true });
}
cpSync(join(ROOT, ".env.local"), join(tree, ".env.local"));
cpSync(join(ROOT, "scripts/perf/meter.cjs"), join(work, "meter.cjs"));

const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  cwd: tree,
  env: { ...process.env, PERF_METER_OUT: meterFile, NODE_OPTIONS: `--require ${join(work, "meter.cjs")}` },
  stdio: "ignore",
  detached: true,
});

function teardown() {
  try { process.kill(-server.pid); } catch {}
  try { execSync(`git worktree remove --force "${tree}"`, { stdio: "ignore" }); } catch {}
  rmSync(work, { recursive: true, force: true });
}
process.on("SIGINT", () => { teardown(); process.exit(130); });

try {
  for (let i = 0; ; i++) {
    const ok = await fetch(`${BASE}/login`).then((r) => r.ok, () => false);
    if (ok) break;
    if (i > 90) throw new Error("next dev did not start within 3 minutes");
    await sleep(2000);
  }

  // ------------------------------------------------------------ the pages
  async function cookiesFor(email) {
    const jar = new Map();
    const sb = createServerClient(URL_, ANON, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    });
    const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
    return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
  }

  const { data: learner } = await admin.from("users").select("id").eq("email", LEARNER).single();
  const { data: enrolment } = await admin
    .from("enrolments").select("course_id").eq("user_id", learner.id)
    .order("course_id").limit(1).single();
  const course = `/learn/courses/${enrolment.course_id}`;

  const PAGES = {
    learner: [
      "/learn", "/learn/modules/all", "/learn/certificates", "/learn/notifications",
      course, `${course}/quiz`, "/learn/forms", "/learn/policies", "/learn/profile",
      // A course's H5P files: each one used to trigger a login check.
      "/h5p/libraries/H5P.Column-1.18/library.json",
    ],
    manager: [
      "/org", "/org/learners", "/org/learners/statistics", "/org/learners/admin",
      "/org/courses", "/org/courses/statistics", "/org/courses/admin",
      `/org/staff/${learner.id}`, "/org/certificates", "/org/forms", "/org/complaints",
      "/org/incidents", "/org/recruitment", "/org/policies", "/org/pips",
      "/org/observations", "/org/reports",
    ],
  };
  const LABELS = { [course]: "/learn/courses/[course]", [`${course}/quiz`]: "/learn/courses/[course]/quiz", [`/org/staff/${learner.id}`]: "/org/staff/[person]" };

  const lines = () => (existsSync(meterFile) ? readFileSync(meterFile, "utf8").trim().split("\n").filter(Boolean) : []);
  const measuredAt = new Date().toISOString();
  const pages = [];
  for (const [role, email] of [["learner", LEARNER], ["manager", MANAGER]]) {
    const cookie = await cookiesFor(email);
    for (const page of PAGES[role]) {
      await fetch(BASE + page, { headers: { cookie }, redirect: "manual" }).then((r) => r.text());
      await sleep(1500);
      const before = lines().length;
      const t0 = Date.now();
      const res = await fetch(BASE + page, { headers: { cookie }, redirect: "manual" });
      await res.text();
      const ms = Date.now() - t0;
      await sleep(1500);
      const calls = lines().slice(before).map((l) => JSON.parse(l));
      pages.push({
        release, sha, measured_at: measuredAt, role, page: LABELS[page] ?? page,
        status: res.status,
        calls: calls.length,
        login_checks: calls.filter((c) => c.path.startsWith("/auth/")).length,
        kb: +(calls.reduce((s, c) => s + c.bytes, 0) / 1024).toFixed(1),
        ms,
      });
      console.log(`${role.padEnd(8)} ${(LABELS[page] ?? page).padEnd(32)} ${res.status} ${String(calls.length).padStart(3)} calls ${String(pages.at(-1).kb).padStart(6)} KB ${String(ms).padStart(5)} ms`);
    }
  }

  // -------------------------------------------- manager pages at scale
  const size = (x) => JSON.stringify(x ?? []).length;
  const scale = [];
  const { data: orgs } = await admin.from("organisations").select("id, name").order("name");
  for (const o of orgs ?? []) {
    const [u, e, c, co, r] = await Promise.all([
      admin.from("users").select("id, full_name, email, status, last_seen_at").eq("role", "learner").eq("organisation_id", o.id).order("id").range(0, 999),
      admin.from("enrolments").select("id, user_id, course_id, status, progress, due_date, assigned_at, last_reminder_at, time_spent").eq("organisation_id", o.id).order("id").range(0, 999),
      admin.from("certificates").select("id, user_id, course_id, issued_at, expires_at").eq("organisation_id", o.id).order("id").range(0, 999),
      admin.from("courses").select("id, title, estimated_minutes, topics(title)"),
      admin.rpc("org_learner_rollup", { p_org: o.id }),
    ]);
    const learners = (r.data ?? []).length;
    const perRow = (rows) => (rows?.length ? size(rows) / rows.length : 0);
    scale.push({
      release, measured_at: measuredAt, organisation: o.name,
      learners, assignments: e.data?.length ?? 0, certificates: c.data?.length ?? 0,
      raw_kb: +((size(u.data) + size(e.data) + size(c.data) + size(co.data)) / 1024).toFixed(1),
      rollup_kb: +(size(r.data) / 1024).toFixed(1),
      // Every learner on 16 courses with a certificate each, the old way.
      raw_kb_fully_assigned: +((size(u.data) + learners * 16 * (perRow(e.data) + perRow(c.data)) + size(co.data)) / 1024).toFixed(0),
    });
  }

  writeFileSync(out, JSON.stringify({ release, sha, measured_at: measuredAt, pages, scale }, null, 1));
  console.log(`\n${release} (${sha}) → ${out}`);
} finally {
  teardown();
}
