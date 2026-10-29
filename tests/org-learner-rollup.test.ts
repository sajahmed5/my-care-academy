import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, cleanup, createOrg, createUser, signIn } from "./helpers";
import { buildOrgLearners, loadOrgLearners, loadOrgTraining } from "@/lib/org-learners";

/*
 * org_learner_rollup() (Postgres) must give exactly the rows buildOrgLearners
 * (Node) gives from the raw enrolments and certificates — the dashboard,
 * Learners overview, reminders and bulk nudges read the first, Courses →
 * Overview the second, and a manager reads both. Checked on a seeded
 * organisation that hits every edge, and on every real one (read-only).
 */

const RUN = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PW = "Test-Passw0rd!";
const email = (l: string) => `rollup-${l}-${RUN}@example.test`;
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const dateIn = (days: number) => at(days).slice(0, 10);

const userIds: string[] = [];
const orgIds: string[] = [];
const courseIds: string[] = [];
let orgA: string;
let orgB: string;
let managerA: SupabaseClient;
let learnerClient: SupabaseClient;
let learnerOne: string;

beforeAll(async () => {
  const admin = adminClient();
  orgA = await createOrg(`Rollup Org A ${RUN}`);
  orgB = await createOrg(`Rollup Org B ${RUN}`);
  orgIds.push(orgA, orgB);

  for (let i = 0; i < 6; i++) {
    const { data, error } = await admin
      .from("courses")
      .insert({ title: `Rollup Course ${i} ${RUN}`, slug: `rollup-${i}-${RUN}`, content_blocks: [] })
      .select("id")
      .single();
    if (error) throw error;
    courseIds.push(data.id);
  }
  const [c1, c2, c3, c4, c5, c6] = courseIds;

  const mk = (label: string, role: "learner" | "org_admin", org = orgA, fullName?: string) =>
    createUser({ email: email(label), password: PW, role, organisationId: org, fullName }).then((id) => {
      userIds.push(id);
      return id;
    });
  const manager = await mk("manager", "org_admin");
  learnerOne = await mk("one", "learner", orgA, "Alex Same");
  const twin = await mk("twin", "learner", orgA, "Alex Same");
  const unnamed = await mk("unnamed", "learner");
  const leaver = await mk("leaver", "learner", orgA, "Zed Leaver");
  const other = await mk("other", "learner", orgB, "Other Org");

  await admin.from("users").update({ full_name: null }).eq("id", unnamed);
  await admin.from("users").update({ status: "deactivated" }).eq("id", leaver);
  await admin.from("users").update({ last_seen_at: at(-40) }).eq("id", twin);

  // A bulk insert sends the union of every row's keys, so each row spells out
  // the defaults it relies on rather than leaving them null.
  const enrol = (user_id: string, course_id: string, extra: Record<string, unknown>, org = orgA) => ({
    user_id, course_id, organisation_id: org,
    status: "not_started", progress: 0, due_date: null, assigned_at: at(0),
    time_spent: 0, last_reminder_at: null,
    ...extra,
  });
  const { error: eErr } = await admin.from("enrolments").insert([
    // Completed after its due date — a late completion; certificate expiring in 30 days.
    enrol(learnerOne, c1, { status: "completed", progress: 100, due_date: dateIn(-10), assigned_at: at(-90) }),
    // Due in 59 days: due soon. Two certificates with the same issue time.
    enrol(learnerOne, c2, { status: "in_progress", progress: 40, due_date: dateIn(59), assigned_at: at(-5) }),
    // Due yesterday, not started: overdue.
    enrol(learnerOne, c3, { status: "not_started", due_date: dateIn(-1), assigned_at: at(-30) }),
    // Expired, renewed long ago: newest certificate expired 35 days ago.
    enrol(learnerOne, c4, { status: "expired", progress: 100, assigned_at: at(-800) }),
    // Due in 61 days: not due soon. Time spent and a reminder sent.
    enrol(learnerOne, c5, { status: "in_progress", progress: 100, due_date: dateIn(61), time_spent: 300, last_reminder_at: at(-2) }),
    // Due today (UTC midnight is already past): overdue.
    enrol(twin, c1, { status: "not_started", due_date: dateIn(0), time_spent: 15 }),
    enrol(leaver, c2, { status: "in_progress", progress: 10 }),
    // A manager's own training never appears in the learner rollup.
    enrol(manager, c1, { status: "not_started", due_date: dateIn(-3) }),
    enrol(other, c1, { status: "not_started", due_date: dateIn(-3) }, orgB),
  ]);
  if (eErr) throw eErr;

  const tied = at(-1);
  let n = 0;
  const cert = (user_id: string, course_id: string, issued_at: string, expires_at: string | null, org = orgA) => ({
    user_id, course_id, organisation_id: org, issued_at, expires_at,
    certificate_number: `ROLLUP-${RUN}-${n++}`,
  });
  const { error: cErr } = await admin.from("certificates").insert([
    cert(learnerOne, c1, at(0), at(30)),
    cert(learnerOne, c2, tied, at(20)),
    cert(learnerOne, c2, tied, at(400)),
    cert(learnerOne, c4, at(-800), at(900)),
    cert(learnerOne, c4, at(-400), at(-35)),
    // A certificate with no enrolment behind it, and no expiry.
    cert(learnerOne, c6, at(-3), null),
    cert(twin, c3, at(-7), at(70)),
    cert(other, c1, at(-1), at(10), orgB),
  ]);
  if (cErr) throw cErr;

  managerA = await signIn(email("manager"), PW);
  learnerClient = await signIn(email("one"), PW);
});

afterAll(async () => {
  await cleanup(userIds, orgIds);
  if (courseIds.length) await adminClient().from("courses").delete().in("id", courseIds);
});

/** Both paths for one organisation, through one client. */
async function bothWays(client: SupabaseClient, org: string) {
  const [fromNode, fromDb] = await Promise.all([
    loadOrgTraining(client, org).then(buildOrgLearners),
    loadOrgLearners(client, org),
  ]);
  return { fromNode, fromDb };
}

describe("org_learner_rollup", () => {
  it("matches the Node rollup on every edge, read as the manager", async () => {
    const { fromNode, fromDb } = await bothWays(managerA, orgA);
    // Four carers and the manager: managers have training too (29 Oct 2026).
    expect(fromDb.length).toBe(5);
    expect(fromDb).toEqual(fromNode);

    const one = fromDb.find((r) => r.id === learnerOne)!;
    expect(one.stats).toMatchObject({
      assigned: 5, completed: 1, inProgress: 2, notStarted: 1, expired: 1,
      overdue: 1, dueSoon: 1, certificates: 6,
    });
    expect(one.lateCompletions).toBe(1);
    expect(one.timeSpentSeconds).toBe(300);
    // c1 (+30 days) and c4 (expired 35 days ago) always; c2 depends on which
    // of its two same-instant certificates wins the tie — both paths agree.
    expect([2, 3]).toContain(one.stats.expiring);
    expect(one.stats.overallPct).toBe(Math.round((100 + 40 + 0 + 100 + 100) / 5));
    expect(one.lastRemindedAt).not.toBeNull();

    // Same name sorts by id; no name sorts last. The manager is a row since
    // 29 Oct 2026 (everyone is staff).
    expect(fromDb.map((r) => r.name).slice(0, 2)).toEqual(["Alex Same", "Alex Same"]);
    expect(fromDb[fromDb.length - 1].name).toBe(email("unnamed"));
    expect(fromDb.filter((r) => r.name === email("manager"))).toHaveLength(1);
    const twin = fromDb.find((r) => r.name === "Alex Same" && r.id !== learnerOne)!;
    expect(twin.stats.overdue).toBe(1);
    expect(twin.lastSeenAt).not.toBeNull();
    expect(fromDb.find((r) => r.status === "deactivated")?.name).toBe("Zed Leaver");
  });

  it("matches through the service role, as bulk nudges read it", async () => {
    const { fromNode, fromDb } = await bothWays(adminClient(), orgA);
    expect(fromDb).toEqual(fromNode);
  });

  it("matches for every real organisation", async () => {
    const admin = adminClient();
    const { data: orgs } = await admin.from("organisations").select("id");
    for (const { id } of orgs ?? []) {
      const { fromNode, fromDb } = await bothWays(admin, id);
      expect(fromDb, `organisation ${id}`).toEqual(fromNode);
    }
  });

  it("gives a manager nothing from another organisation", async () => {
    expect(await loadOrgLearners(managerA, orgB)).toEqual([]);
  });

  it("gives a learner only their own row", async () => {
    const rows = await loadOrgLearners(learnerClient, orgA);
    expect(rows.map((r) => r.id)).toEqual([learnerOne]);
  });

  it("is not callable signed out", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { error } = await anon.rpc("org_learner_rollup", { p_org: orgA });
    expect(error?.code).toBe("42501");
  });
});
