import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { inflateSync } from "node:zlib";
import { adminDb } from "./db";
import { seeded, session, type RoleKey } from "./roles";
import { buildDueRows, type DueRecord } from "../../lib/due-view";
import { dueStatus } from "../../lib/records";
import { learnerStats, type Enrolment, type Certificate } from "../../lib/learner-stats";
import { clientDueRows, clientsFor, resolveServiceForms, type DueClient } from "../../lib/service-audits";
import { qaAsServiceForm, resolveQaForm, QA_FORM_KEY } from "../../lib/client-qa";

/**
 * The day-to-day flows of QA Test Care, end to end: a manager assigns
 * training, a carer takes it and earns a certificate, and the manager works
 * through the compliance records (Care Certificate, supervisions, spot
 * checks, performance plans, service audits, complaints, feedback) and
 * checks Today's numbers against the database.
 *
 * Everything this file creates carries the RUN tag in a name or note, and
 * is removed again in afterAll, so a re-run starts from the seed. Blocks
 * whose tests build on one another (the carer's assessment, the complaint)
 * run serially; the rest are independent and may run in parallel.
 */

const RUN = `QA-${Date.now().toString(36)}`;
const DAY = 86_400_000;
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * DAY).toISOString().slice(0, 10);
const ORG = () => seeded("QA_TEST_ORG_ID");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function userByEmail(email: string): Promise<{ id: string; full_name: string }> {
  const { data, error } = await adminDb().from("users").select("id, full_name").eq("email", email).single();
  if (error || !data) throw new Error(`no user ${email}: ${error?.message}`);
  return data as { id: string; full_name: string };
}

async function courseByTitle(title: string): Promise<{ id: string; title: string }> {
  const { data, error } = await adminDb().from("courses").select("id, title").eq("title", title).is("retired_at", null).single();
  if (error || !data) throw new Error(`no course ${title}: ${error?.message}`);
  return data as { id: string; title: string };
}

async function clientByName(name: string): Promise<{ id: string; full_name: string }> {
  const { data, error } = await adminDb().from("clients").select("id, full_name").eq("organisation_id", ORG()).eq("full_name", name).single();
  if (error || !data) throw new Error(`no client ${name}: ${error?.message}`);
  return data as { id: string; full_name: string };
}

async function as(browser: Browser, role: RoleKey): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: session(role) });
  const page = await context.newPage();
  return { context, page };
}

/** Open a page and clear the cookie notice so it never sits over a button. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const accept = page.getByRole("button", { name: "Accept", exact: true });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

/** Draw a squiggle on the signature pad inside a group ("Your signature *"). */
async function sign(page: Page, group: Locator): Promise<void> {
  const canvas = group.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  if (!b) throw new Error("signature pad has no box");
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 3, b.y + 15, { steps: 6 });
  await page.mouse.move(b.x + (b.width * 2) / 3, b.y + b.height - 15, { steps: 6 });
  await page.mouse.move(b.x + b.width - 20, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
}

/** The readable text of a PDF whose streams are Flate-compressed (@react-pdf). */
function pdfText(buf: Buffer): string {
  const s = buf.toString("latin1");
  const out: string[] = [];
  // "stream" but never the tail of "endstream".
  const re = /(?<!end)stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endstream", start);
    if (end < 0) break;
    const raw = buf.subarray(start, end);
    let text: string | null = null;
    for (const slice of [raw, raw.subarray(0, raw.length - 1), raw.subarray(0, raw.length - 2)]) {
      try {
        text = inflateSync(slice).toString("latin1");
        break;
      } catch {
        /* try a shorter slice: the stream may end in \r\n */
      }
    }
    if (text === null) text = raw.toString("latin1");
    // Only page content: the strings inside BT … ET, literal "(…)" or, as
    // @react-pdf writes them with its standard fonts, one "<hh>" per
    // WinAnsi character.
    if (!/\bBT\b/.test(text)) {
      re.lastIndex = end + 9;
      continue;
    }
    const tokens = text.match(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]+>/g) ?? [];
    out.push(
      tokens
        .map((x) =>
          x.startsWith("<")
            ? Buffer.from(x.slice(1, -1), "hex").toString("latin1")
            : x.slice(1, -1).replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\"),
        )
        .join(""),
    );
    re.lastIndex = end + 9;
  }
  return out.join("\n").replace(/\s+/g, " ");
}

async function fetchFile(api: APIRequestContext, path: string): Promise<{ status: number; type: string; body: Buffer; disposition: string }> {
  const res = await api.get(path, { maxRedirects: 0 });
  return {
    status: res.status(),
    type: res.headers()["content-type"] ?? "",
    body: Buffer.from(await res.body()),
    disposition: res.headers()["content-disposition"] ?? "",
  };
}

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const tinyPdf = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n",
);

// ---------------------------------------------------------------------------
// 8 (first pass). Today's numbers, from the database by the rules in lib/
// ---------------------------------------------------------------------------

interface Expected {
  trainingPct: number;
  overdueCourses: number;
  supervisionsUpToDate: number;
  people: number;
  auditsLate: number;
  /** The Due badge's parts this test can count (lib/due-badge.ts, lib/org-todo.ts). */
  badge: { staff: number; supervisions: number; appraisals: number; spotChecks: number; competency: number; audits: number };
}

async function expectedToday(now = new Date()): Promise<Expected> {
  const db = adminDb();
  const org = ORG();
  const { data: users } = await db
    .from("users")
    .select("id, full_name, email, role, status, last_seen_at")
    .eq("organisation_id", org)
    .in("role", ["learner", "org_admin", "org_office"]);
  // lib/org-learners.ts: isActiveLearner = status !== "deactivated".
  const active = (users ?? []).filter((u) => u.status !== "deactivated");
  const ids = active.map((u) => u.id as string);
  const [{ data: enrolments }, { data: certs }] = await Promise.all([
    db.from("enrolments").select("user_id, course_id, status, progress, due_date").in("user_id", ids),
    db.from("certificates").select("user_id, course_id, expires_at, issued_at").in("user_id", ids).order("issued_at", { ascending: false }),
  ]);
  // lib/learner-stats.ts learnerStats, per person, then summed as app/org/page.tsx does.
  let assigned = 0;
  let completed = 0;
  let overdueCourses = 0;
  const overdueAnyone: string[] = [];
  for (const u of active) {
    const mine = (enrolments ?? []).filter((e) => e.user_id === u.id) as unknown as Enrolment[];
    const theirs = (certs ?? []).filter((c) => c.user_id === u.id) as unknown as Certificate[];
    const s = learnerStats(mine, theirs, now);
    assigned += s.assigned;
    completed += s.completed;
    overdueCourses += s.overdue;
    if (s.overdue > 0) overdueAnyone.push(u.full_name as string);
  }
  const trainingPct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;
  const neverActive = active.some((u) => !u.last_seen_at);

  // lib/staff-checks.ts: buildDueRows over supervisions + booked bookings, people = active staff.
  const people = active.map((u) => ({ id: u.id as string, name: (u.full_name as string) ?? "" }));
  const [{ data: sups }, { data: bookings }] = await Promise.all([
    db.from("supervisions").select("user_id, kind, held_on, next_due").eq("organisation_id", org).in("kind", ["supervision", "appraisal"]),
    db.from("staff_audit_bookings").select("user_id, kind, booked_on").eq("organisation_id", org).eq("status", "booked"),
  ]);
  const records = (kind: string): DueRecord[] =>
    (sups ?? []).filter((s) => s.kind === kind).map((s) => ({ userId: s.user_id as string, heldOn: s.held_on as string, nextDue: (s.next_due as string | null) ?? null }));
  const booked = (kind: string) => (bookings ?? []).filter((b) => b.kind === kind).map((b) => ({ userId: b.user_id as string, on: b.booked_on as string }));
  const supRows = buildDueRows(people, records("supervision"), now, booked("supervision"));
  const appRows = buildDueRows(people, records("appraisal"), now, booked("appraisal"));
  const isLate = (r: { status: string }) => r.status === "overdue" || r.status === "never";
  const supervisionsUpToDate = supRows.filter((r) => !isLate(r)).length;

  // lib/service-audits-due.ts: every form, service-wide or client by client.
  const [{ data: formRows }, { data: clientRows }, { data: audits }, { data: qas }] = await Promise.all([
    db.from("service_audit_forms").select("key, label, scope, questions, due_every, due_unit, archived").eq("organisation_id", org),
    db.from("clients").select("id, full_name, region, medication_support").eq("organisation_id", org).eq("status", "active"),
    db.from("audits").select("id, kind, client_id, held_on, next_due").eq("organisation_id", org),
    db.from("client_qas").select("id, client_id, held_on, next_due").eq("organisation_id", org),
  ]);
  const overrides = (formRows ?? []).filter((r) => r.key !== QA_FORM_KEY);
  const forms = resolveServiceForms(
    overrides.map((r) => ({
      key: r.key as string,
      label: (r.label as string | null) ?? null,
      scope: r.scope === "client" ? ("client" as const) : ("service" as const),
      questions: Array.isArray(r.questions) ? r.questions : [],
      due_every: r.due_every as number,
      due_unit: r.due_unit === "weeks" ? ("weeks" as const) : ("months" as const),
      archived: !!r.archived,
    })),
  );
  const qaRow = (formRows ?? []).find((r) => r.key === QA_FORM_KEY);
  const qa = qaAsServiceForm(resolveQaForm(qaRow ? { questions: qaRow.questions, due_every: qaRow.due_every as number, due_unit: qaRow.due_unit === "weeks" ? "weeks" : "months" } : null));
  const clients: DueClient[] = (clientRows ?? []).map((c) => ({ id: c.id as string, name: c.full_name as string, region: (c.region as string | null) ?? null, medicationSupport: !!c.medication_support }));
  const all = [
    ...(audits ?? []).map((a) => ({ id: a.id as string, kind: a.kind as string, client_id: a.client_id as string | null, held_on: a.held_on as string, next_due: a.next_due as string | null })),
    ...(qas ?? []).map((q) => ({ id: q.id as string, kind: QA_FORM_KEY, client_id: q.client_id as string | null, held_on: q.held_on as string, next_due: q.next_due as string | null })),
  ];
  let auditsLate = 0;
  for (const form of [qa, ...forms]) {
    const mine = all.filter((r) => r.kind === form.key).sort((a, b) => b.held_on.localeCompare(a.held_on));
    if (form.scope === "client") {
      const rows = clientDueRows(
        clientsFor(form, clients),
        mine.filter((r) => r.client_id).map((r) => ({ id: r.id, clientId: r.client_id!, heldOn: r.held_on, nextDue: r.next_due })),
        now,
      );
      auditsLate += rows.filter(isLate).length;
    } else {
      const last = mine[0];
      const status = last ? dueStatus(last.next_due, now) : "never";
      if (status === "overdue" || status === "never") auditsLate += 1;
    }
  }

  // lib/org-todo.ts staffAudits(): spot checks for carers (never counts), competency per skill (never does not).
  const carers = active.filter((u) => u.role === "learner").map((u) => ({ id: u.id as string, name: (u.full_name as string) ?? "" }));
  const [{ data: spots }, { data: comps }] = await Promise.all([
    db.from("spot_checks").select("user_id, checked_on, next_due").eq("organisation_id", org),
    db.from("competency_checks").select("user_id, checked_on, next_due, area").eq("organisation_id", org),
  ]);
  const spotRows = buildDueRows(carers, (spots ?? []).map((x) => ({ userId: x.user_id as string, heldOn: x.checked_on as string, nextDue: (x.next_due as string | null) ?? null })), now);
  const areas = [...new Set((comps ?? []).map((c) => c.area as string))];
  let competencyLate = 0;
  for (const area of areas) {
    const rows = buildDueRows(carers, (comps ?? []).filter((c) => c.area === area).map((x) => ({ userId: x.user_id as string, heldOn: x.checked_on as string, nextDue: (x.next_due as string | null) ?? null })), now);
    competencyLate += rows.filter((r) => r.status === "overdue").length;
  }

  return {
    trainingPct,
    overdueCourses,
    supervisionsUpToDate,
    people: people.length,
    auditsLate,
    badge: {
      staff: (overdueAnyone.length > 0 ? 1 : 0) + (neverActive ? 1 : 0),
      supervisions: supRows.some(isLate) ? 1 : 0,
      appraisals: appRows.some(isLate) ? 1 : 0,
      spotChecks: spotRows.some(isLate) ? 1 : 0,
      competency: competencyLate > 0 ? 1 : 0,
      audits: auditsLate > 0 ? 1 : 0,
    },
  };
}

async function readToday(page: Page): Promise<{ trainingPct: number; overdueNote: string; sup: [number, number]; auditsDue: number; thingsToFix: number; badge: number }> {
  await open(page, "/org");
  const training = await page.getByRole("link", { name: /^Training complete/ }).innerText();
  const sup = await page.getByRole("link", { name: /^Supervisions up to date/ }).innerText();
  const audits = await page.getByRole("link", { name: /^Service audits/ }).innerText();
  const fix = await page.getByText(/things? to fix/).first().innerText();
  const due = await page.getByRole("link", { name: /^Due\b/ }).first().innerText();
  const num = (s: string, re: RegExp) => Number((s.match(re) ?? [])[1] ?? NaN);
  return {
    trainingPct: num(training, /(\d+)%/),
    overdueNote: training.replace(/\s+/g, " "),
    sup: [num(sup, /(\d+)\s*\/\s*\d+/), num(sup, /\d+\s*\/\s*(\d+)/)],
    auditsDue: num(audits, /(\d+)\s*due/),
    thingsToFix: num(fix, /(\d+) things? to fix/),
    badge: num(due, /Due\s*(\d+)/),
  };
}

/**
 * The "{n} due" beside a link in an open drop-down (components/top-nav.tsx
 * lateBehind: the link's own path, its `also` paths and its row's paths).
 * -1 when the link is not in the menu at all.
 */
async function menuDue(page: Page, menu: string, link: RegExp): Promise<number> {
  await page.getByRole("button", { name: menu, exact: true }).click();
  const a = page.getByRole("link", { name: link }).filter({ visible: true }).first();
  const text = await a.innerText({ timeout: 3_000 }).catch(() => null);
  await page.keyboard.press("Escape");
  if (text === null) return -1;
  const m = text.replace(/\s+/g, " ").match(/(\d+) due/);
  return m ? Number(m[1]) : 0;
}

/**
 * Today's cards against the database. The expectation is worked out just
 * before and just after the page is read, and the page passes if it matches
 * either, so a record another test writes in between is not a failure.
 */
async function checkToday(page: Page, label: string): Promise<void> {
  const before = await expectedToday();
  const got = await readToday(page);
  const after = await expectedToday();
  const problems: string[] = [];
  const either = (pick: (w: Expected) => boolean) => pick(before) || pick(after);
  if (!either((w) => got.trainingPct === w.trainingPct)) problems.push(`Training complete: page ${got.trainingPct}% vs DB ${before.trainingPct}%`);
  if (!either((w) => w.overdueCourses === 0 || got.overdueNote.includes(`${w.overdueCourses} course`))) problems.push(`Training complete note: "${got.overdueNote}" vs DB ${before.overdueCourses} courses overdue`);
  if (!either((w) => got.sup[0] === w.supervisionsUpToDate && got.sup[1] === w.people)) problems.push(`Supervisions up to date: page ${got.sup[0]}/${got.sup[1]} vs DB ${before.supervisionsUpToDate}/${before.people}`);
  if (!either((w) => got.auditsDue === w.auditsLate)) problems.push(`Service audits due: page ${got.auditsDue} vs DB ${before.auditsLate}`);
  test.info().annotations.push({
    type: "today",
    description: `${label}: page training ${got.trainingPct}%, supervisions ${got.sup.join("/")}, audits due ${got.auditsDue}, things to fix ${got.thingsToFix}, Due badge ${got.badge}; DB ${JSON.stringify(before)}`,
  });
  expect(problems, `${label}: Today disagrees with the database`).toEqual([]);
}

/**
 * The Due badge (lib/due-badge.ts): the training lines (someone overdue,
 * someone never signed in) plus every alert line of the to-do list. The
 * to-do list's staff-audit and service-audit lines can be counted from the
 * database here; its HR, policy, form and complaint lines cannot, so the
 * badge must be at least the sum of the parts below.
 */
async function checkDueBadge(page: Page, label: string): Promise<void> {
  const want = await expectedToday();
  const got = await readToday(page);
  const b = want.badge;
  const lowerBound = b.staff + b.supervisions + b.appraisals + b.spotChecks + b.competency + b.audits;
  const menu = {
    staff: await menuDue(page, "People", /^Staff\b/),
    supervisionsAndAppraisals: await menuDue(page, "Compliance", /^Supervisions & appraisals/),
    spotChecksAndCompetency: await menuDue(page, "Compliance", /^Spot checks & competency/),
    serviceAudits: await menuDue(page, "Compliance", /^Service audits/),
  };
  test.info().annotations.push({
    type: "due-badge",
    description: `${label}: Due badge ${got.badge}, Today "things to fix" ${got.thingsToFix}; DB parts ${JSON.stringify(b)} (at least ${lowerBound}); menus ${JSON.stringify(menu)}`,
  });
  expect.soft(menu.staff, "People → Staff shows the training part of the badge").toBe(b.staff);
  expect.soft(menu.supervisionsAndAppraisals, "Compliance → Supervisions & appraisals shows its late lines").toBe(b.supervisions + b.appraisals);
  expect.soft(menu.spotChecksAndCompetency, "Compliance → Spot checks & competency shows its late lines").toBe(b.spotChecks + b.competency);
  expect(got.badge, `the Due badge (${got.badge}) counts at least the late lines the database shows (${lowerBound})`).toBeGreaterThanOrEqual(lowerBound);
}

test.describe("Today's numbers before this file changes anything", () => {
  test("Training complete, Supervisions up to date and Service audits match the database", async ({ browser }) => {
    const { context, page } = await as(browser, "testManager");
    try {
      await checkToday(page, "before");
    } finally {
      await context.close();
    }
  });

  test("the Due badge counts the late lines", async ({ browser }) => {
    // BUG: the badge shows 2 (training's two lines) while Today lists 14
    // things to fix: lib/due-badge.ts countDue swallows a failure in
    // loadOrgTodo (.catch(() => [])) and the People/Compliance menus show
    // no "n due" at all.
    const { context, page } = await as(browser, "testManager");
    try {
      await checkDueBadge(page, "before");
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 1. Assign training as the manager
// ---------------------------------------------------------------------------

test.describe("assigning training", () => {
  test.describe.configure({ mode: "serial" });
  let amina: { id: string; full_name: string };
  let carla: { id: string; full_name: string };
  let lena: { id: string; full_name: string };
  let whistle: { id: string; title: string };
  let coshh: { id: string; title: string };
  let fire: { id: string; title: string };

  test.beforeAll(async () => {
    [amina, carla, lena, whistle, coshh, fire] = await Promise.all([
      userByEmail(process.env.QA_TEST_STAFF_EMAIL!),
      userByEmail("carla@qa-test-care.example.com"),
      userByEmail("lena@qa-test-care.example.com"),
      courseByTitle("Whistleblowing"),
      courseByTitle("COSHH"),
      courseByTitle("Fire Safety"),
    ]);
    // Idempotent: a previous run may have left these behind.
    const db = adminDb();
    await db.from("enrolments").delete().eq("user_id", carla.id).eq("course_id", coshh.id);
    await db.from("enrolments").delete().eq("user_id", lena.id).eq("course_id", fire.id);
    await db.from("enrolments").delete().eq("user_id", amina.id).eq("course_id", whistle.id);
  });

  test.afterAll(async () => {
    const db = adminDb();
    await db.from("enrolments").delete().eq("user_id", carla.id).eq("course_id", coshh.id);
    await db.from("enrolments").delete().eq("user_id", lena.id).eq("course_id", fire.id);
    await db.from("enrolments").delete().eq("user_id", amina.id).eq("course_id", whistle.id);
  });

  test("Courses → Admin assigns a course with a due date; the carer sees it on /learn", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/courses/admin");
      await m.page.getByLabel("Due date").first().fill(iso(7));
      await m.page.getByLabel("Search courses").first().fill("Whistle");
      await m.page.getByRole("checkbox", { name: whistle.title, exact: true }).check();
      await m.page.getByLabel("Search carers").fill("Amina");
      await m.page.getByRole("checkbox", { name: amina.full_name, exact: true }).check();
      await m.page.getByRole("button", { name: "Assign training" }).click();
      await expect(m.page.getByText(/Assigned 1 course to 1 carer/)).toBeVisible();
      const { data: e } = await adminDb().from("enrolments").select("due_date, status").eq("user_id", amina.id).eq("course_id", whistle.id).single();
      expect(e?.due_date).toBe(iso(7));
      expect(e?.status).toBe("not_started");
    } finally {
      await m.context.close();
    }
    const c = await as(browser, "testStaff");
    try {
      await open(c.page, "/learn/modules");
      const card = c.page.locator("main").locator("div", { hasText: whistle.title }).filter({ has: c.page.getByRole("link", { name: "Start" }) }).last();
      await expect(card.getByText(whistle.title, { exact: true })).toBeVisible();
      const dueText = new Date(iso(7)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      await expect(card).toContainText(`Due ${dueText}`);
      await expect(card.getByRole("link", { name: "Start" })).toHaveAttribute("href", `/learn/courses/${whistle.id}`);
    } finally {
      await c.context.close();
    }
  });

  test("Assign course from a carer's file with a past due date shows on Today's Needs your attention", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, `/org/staff/${carla.id}?section=training`);
      await m.page.getByRole("button", { name: "Assign a course" }).click();
      await m.page.getByLabel("Search courses").fill("COSHH");
      await m.page.getByRole("checkbox", { name: coshh.title, exact: true }).check();
      await m.page.getByLabel("Due date").fill(iso(-1));
      await m.page.getByRole("button", { name: "Assign", exact: true }).click();
      await expect(m.page.getByText(/Assigned ✓/)).toBeVisible();
      const { data: e } = await adminDb().from("enrolments").select("due_date").eq("user_id", carla.id).eq("course_id", coshh.id).single();
      expect(e?.due_date).toBe(iso(-1));
      // Today: the overdue-training line now names Carla.
      await open(m.page, "/org");
      const line = m.page.getByRole("link", { name: /^Overdue training/ });
      await expect(line).toContainText(carla.full_name);
      // The staff list says so too.
      await open(m.page, "/org/learners");
      await expect(m.page.getByRole("row", { name: new RegExp(carla.full_name) })).toContainText("1 overdue");
    } finally {
      await m.context.close();
    }
  });

  test("Bulk assign from a CSV: a good row is assigned, a mistyped course is skipped", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/courses/admin");
      const csv = `email,course,due date\r\n${lena.id ? "lena@qa-test-care.example.com" : ""},${fire.title},15/12/2026\r\nlena@qa-test-care.example.com,No Such Course ${RUN},\r\n`;
      await m.page.locator('input[type="file"]').setInputFiles({ name: "assign.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await expect(m.page.getByText(/2 assignment\(s\) ready/)).toBeVisible();
      await expect(m.page.getByText(/1 highlighted in red will be skipped/)).toBeVisible();
      await m.page.getByRole("button", { name: /Assign 2 course/ }).click();
      await expect(m.page.getByText(/1 assigned, 1 failed/)).toBeVisible();
      const { data: e } = await adminDb().from("enrolments").select("due_date").eq("user_id", lena.id).eq("course_id", fire.id).single();
      expect(e?.due_date).toBe("2026-12-15");
    } finally {
      await m.context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Take a course as the carer: fail, then pass, certificate, verify, stars
// ---------------------------------------------------------------------------

test.describe("taking a course and earning a certificate", () => {
  test.describe.configure({ mode: "serial" });
  let amina: { id: string; full_name: string };
  let whistle: { id: string; title: string };
  let bank: Map<string, { options: string[]; answer_index: number }>;
  let certificateId = "";
  let certificateNumber = "";

  test.beforeAll(async () => {
    // Its own course: the assignment block above works on Whistleblowing in
    // parallel, and the two must never clean each other up.
    [amina, whistle] = await Promise.all([userByEmail(process.env.QA_TEST_STAFF_EMAIL!), courseByTitle("Slips, Trips & Falls")]);
    const db = adminDb();
    // Assigned here rather than through the form, which the block above covers.
    await db.from("enrolments").upsert({ organisation_id: ORG(), user_id: amina.id, course_id: whistle.id, due_date: iso(7) }, { onConflict: "user_id,course_id" });
    await db.from("certificates").delete().eq("user_id", amina.id).eq("course_id", whistle.id);
    await db.from("quiz_attempts").delete().eq("user_id", amina.id).eq("course_id", whistle.id);
    const { data: qs } = await db.from("quiz_questions").select("question, options, answer_index, type").eq("course_id", whistle.id);
    bank = new Map((qs ?? []).map((q) => [q.question as string, { options: q.options as string[], answer_index: q.answer_index as number }]));
    expect(bank.size, "the course has a question bank").toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    const db = adminDb();
    const { data: certs } = await db.from("certificates").select("id, pdf_path").eq("user_id", amina.id).eq("course_id", whistle.id);
    const paths = (certs ?? []).map((c) => c.pdf_path as string | null).filter((p): p is string => !!p);
    if (paths.length) await db.storage.from("certificates").remove(paths);
    await db.from("certificates").delete().eq("user_id", amina.id).eq("course_id", whistle.id);
    await db.from("quiz_attempts").delete().eq("user_id", amina.id).eq("course_id", whistle.id);
    await db.from("enrolments").delete().eq("user_id", amina.id).eq("course_id", whistle.id);
  });

  async function answerAll(page: Page, correctly: boolean): Promise<number> {
    await expect(page.getByText(/\d+ of \d+ answered/)).toBeVisible({ timeout: 20_000 });
    const cards = page.locator("main div.rounded-xl.border");
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const heading = (await card.locator("p.font-medium").first().innerText()).replace(/^\d+\.\s*/, "").trim();
      const q = bank.get(heading);
      expect(q, `question shown on screen is in the bank: "${heading}"`).toBeTruthy();
      const idx = correctly ? q!.answer_index : (q!.answer_index + 1) % q!.options.length;
      await card.getByRole("radio").nth(idx).check();
    }
    await page.getByRole("button", { name: "Submit assessment" }).click();
    return n;
  }

  test("the carer reads every slide, fails the assessment on purpose, and gets no certificate", async ({ browser }) => {
    const c = await as(browser, "testStaff");
    try {
      await open(c.page, `/learn/courses/${whistle.id}`);
      await expect(c.page.getByRole("heading", { name: whistle.title, exact: true })).toBeVisible();
      for (let i = 0; i < 30; i++) {
        const finish = c.page.getByRole("button", { name: "Finish" });
        if (await finish.isVisible()) {
          await finish.click();
          break;
        }
        await c.page.getByRole("button", { name: "Next" }).click();
      }
      await expect(c.page.getByText("Content complete")).toBeVisible();
      // The last save is fire-and-forget; give it a moment to land.
      await expect.poll(async () => (await adminDb().from("enrolments").select("progress").eq("user_id", amina.id).eq("course_id", whistle.id).single()).data?.progress, { timeout: 10_000 }).toBe(100);
      await c.page.getByRole("button", { name: "Start assessment" }).click();
      await expect(c.page).toHaveURL(new RegExp(`/learn/courses/${whistle.id}/quiz`));
      await expect(c.page.getByRole("heading", { name: "Ready for the assessment?" })).toBeVisible();
      await c.page.getByRole("button", { name: "Start assessment" }).click();
      await answerAll(c.page, false);
      await expect(c.page.getByRole("heading", { name: "Not passed" })).toBeVisible();
      await expect(c.page.getByText(/You scored/)).toContainText("0%");
      await expect(c.page.getByRole("button", { name: "Download certificate" })).toHaveCount(0);
      await expect(c.page.getByText(/don.t show the answers for a failed attempt/)).toBeVisible();
      const db = adminDb();
      const { count } = await db.from("certificates").select("id", { count: "exact", head: true }).eq("user_id", amina.id).eq("course_id", whistle.id);
      expect(count).toBe(0);
      const { data: attempt } = await db.from("quiz_attempts").select("passed, score").eq("user_id", amina.id).eq("course_id", whistle.id).order("started_at", { ascending: false }).limit(1).single();
      expect(attempt?.passed).toBe(false);
      const { data: enr } = await db.from("enrolments").select("status, attempt_count").eq("user_id", amina.id).eq("course_id", whistle.id).single();
      expect(enr?.status).not.toBe("completed");
      expect(enr?.attempt_count).toBe(1);
    } finally {
      await c.context.close();
    }
  });

  test("then passes it: a certificate is issued, downloads as a PDF with her name, and verifies publicly", async ({ browser, baseURL }) => {
    const c = await as(browser, "testStaff");
    try {
      await open(c.page, `/learn/courses/${whistle.id}/quiz`);
      await c.page.getByRole("button", { name: "Start assessment" }).click();
      const n = await answerAll(c.page, true);
      await expect(c.page.getByRole("heading", { name: /^Passed/ })).toBeVisible();
      await expect(c.page.getByText(/You scored/)).toContainText("100%");
      await expect(c.page.getByText(new RegExp(`\\+${n} ⭐`))).toBeVisible();
      await expect(c.page.getByRole("button", { name: "Download certificate" })).toBeVisible();
      const db = adminDb();
      const { data: cert } = await db.from("certificates").select("id, certificate_number, pdf_path, expires_at").eq("user_id", amina.id).eq("course_id", whistle.id).single();
      expect(cert, "a certificate row").toBeTruthy();
      expect(cert!.pdf_path, "its PDF was stored").toBeTruthy();
      certificateId = cert!.id as string;
      certificateNumber = cert!.certificate_number as string;
      const { data: enr } = await db.from("enrolments").select("status, progress, completion_count").eq("user_id", amina.id).eq("course_id", whistle.id).single();
      expect(enr?.status).toBe("completed");
      expect(enr?.completion_count).toBe(1);
      // Her certificate wallet lists it; the star bank in the header counts the right answers.
      await open(c.page, "/learn/certificates");
      await expect(c.page.locator("main")).toContainText(whistle.title);
      await expect(c.page.locator("main")).toContainText(certificateNumber);
      await expect(c.page.getByRole("button", { name: /^\d+ stars?\. What are these\?/ })).toHaveText(new RegExp(`${n}\\s*stars`));
    } finally {
      await c.context.close();
    }
    // The download, as the carer.
    const api = await playwrightRequest.newContext({ baseURL, storageState: session("testStaff") });
    try {
      const file = await fetchFile(api, `/learn/certificates/${certificateId}/download`);
      expect(file.status).toBe(200);
      expect(file.type).toContain("application/pdf");
      expect(file.body.subarray(0, 5).toString()).toBe("%PDF-");
      expect(file.disposition).toMatch(/attachment/);
      expect(file.disposition).toContain(whistle.title);
      const text = pdfText(file.body);
      expect(text, "the PDF names the carer").toContain(amina.full_name);
      expect(text, "the PDF names the course").toContain(whistle.title);
      expect(text, "the PDF carries its number").toContain(certificateNumber);
    } finally {
      await api.dispose();
    }
    // Public verification, signed out.
    const anon = await playwrightRequest.newContext({ baseURL });
    try {
      const res = await anon.get(`/verify?number=${encodeURIComponent(certificateNumber)}`);
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain("Genuine certificate");
      expect(html).toContain(amina.full_name);
      // HTML-escaped, as "&" is in the page source.
      expect(html).toContain(whistle.title.replace(/&/g, "&amp;"));
      const bad = await anon.get(`/verify?number=MCA-0000-NOPE`);
      expect(await bad.text()).toContain("No certificate found");
    } finally {
      await anon.dispose();
    }
  });

  test("the manager sees the new certificate, downloads it, and the Stars leaderboard credits her", async ({ browser, baseURL }) => {
    expect(certificateId, "the pass above issued a certificate").toBeTruthy();
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/certificates?filter=all");
      await m.page.getByRole("searchbox", { name: /Search certificates/ }).fill(whistle.title);
      const row = m.page.getByRole("row", { name: new RegExp(`${amina.full_name}.*${whistle.title}`) });
      await expect(row).toBeVisible();
      await expect(row).toContainText("Valid");
      await open(m.page, `/org/staff/${amina.id}?section=certificates`);
      await expect(m.page.locator("main")).toContainText(whistle.title);
      await open(m.page, `/org/staff/${amina.id}?section=training`);
      await expect(m.page.locator("main")).toContainText(whistle.title);
      await open(m.page, "/org/learners/stars?period=month");
      await expect(m.page.locator("main")).toContainText(amina.full_name);
      await expect(m.page.locator("main")).toContainText(`${bank.size}`);
      await expect(m.page.getByText("Nobody yet")).toHaveCount(0);
      await open(m.page, `/org/staff/${amina.id}?section=stars`);
      await expect(m.page.locator("main")).toContainText(whistle.title);
    } finally {
      await m.context.close();
    }
    const api = await playwrightRequest.newContext({ baseURL, storageState: session("testManager") });
    try {
      const file = await fetchFile(api, `/org/certificates/${certificateId}/download`);
      expect(file.status).toBe(200);
      expect(file.type).toContain("application/pdf");
      expect(file.body.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      await api.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Care Certificate observations
// ---------------------------------------------------------------------------

test.describe("Care Certificate assessment", () => {
  let jade: { id: string; full_name: string };
  test.beforeAll(async () => {
    jade = await userByEmail("jade@qa-test-care.example.com");
    await adminDb().from("care_cert_observations").delete().eq("user_id", jade.id).eq("standard_no", 3);
    await adminDb().from("care_cert_observations").insert({ organisation_id: ORG(), user_id: jade.id, standard_no: 3, status: "pending", assessor_kind: "org" });
  });
  test.afterAll(async () => {
    await adminDb().from("care_cert_observations").update({ status: "pending", observed_at: null, notes: null }).eq("user_id", jade.id).eq("standard_no", 3);
  });

  test("a standard is marked competent with a date and a note; award stays locked until all 16 are done", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/observations");
      await expect(m.page.getByRole("heading", { name: "Care Certificate assessment" })).toBeVisible();
      await expect(m.page.locator("main")).toContainText(jade.full_name);
      await open(m.page, `/org/observations/${jade.id}`);
      await expect(m.page.locator("main")).toContainText("observed competent 2/16");
      await m.page.getByRole("button", { name: /Standard 3 — Duty of care/ }).click();
      const form = m.page.locator("form", { has: m.page.locator('input[name="standard_no"][value="3"]') });
      await form.locator('select[name="status"]').selectOption("competent");
      await form.locator('input[name="observed_at"]').fill(iso(0));
      await form.locator('textarea[name="notes"]').fill(`${RUN}: observed on a double-up call`);
      await form.locator('button[type="submit"]').click();
      await expect(m.page.locator("main")).toContainText("observed competent 3/16");
      const { data } = await adminDb().from("care_cert_observations").select("status, observed_at, notes").eq("user_id", jade.id).eq("standard_no", 3).single();
      expect(data?.status).toBe("competent");
      expect(data?.observed_at).toBe(iso(0));
      expect(data?.notes).toContain(RUN);
      const award = m.page.getByRole("button", { name: "Sign off & award" });
      await expect(award).toBeDisabled();
      await expect(m.page.getByText(/Still needed: .*a competent observation for 13 standards\./)).toBeVisible();
    } finally {
      await m.context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Supervisions, appraisals, spot checks, competency
// ---------------------------------------------------------------------------

test.describe("supervisions and appraisals", () => {
  test.describe.configure({ mode: "serial" });
  let amina: { id: string; full_name: string };
  let mo: { id: string; full_name: string };
  const created = { supervisions: [] as string[], bookings: [] as string[] };

  test.beforeAll(async () => {
    [amina, mo] = await Promise.all([userByEmail(process.env.QA_TEST_STAFF_EMAIL!), userByEmail("mo@qa-test-care.example.com")]);
    // Idempotent: a previous run may have left a booking or a note with the run tag.
    const db = adminDb();
    await db.from("staff_audit_bookings").delete().eq("user_id", amina.id).eq("kind", "appraisal").eq("status", "booked");
    await db.from("supervisions").delete().eq("user_id", mo.id).like("summary", "QA-%");
  });

  test.afterAll(async () => {
    const db = adminDb();
    if (created.supervisions.length) {
      await db.from("record_actions").delete().in("source_id", created.supervisions);
      await db.from("supervisions").delete().in("id", created.supervisions);
    }
    if (created.bookings.length) {
      await db.from("appraisal_self_assessments").delete().in("booking_id", created.bookings);
      await db.from("staff_audit_bookings").delete().in("id", created.bookings);
    }
  });

  test("booking an appraisal shows on the staff list, Who's due and the carer's own Supervisions page, where she fills in her self-assessment", async ({ browser }) => {
    const m = await as(browser, "testManager");
    const day = iso(5);
    try {
      await open(m.page, `/org/staff/${amina.id}?section=supervisions`);
      await m.page.getByRole("button", { name: "Book one" }).click();
      await m.page.getByLabel("What").selectOption("appraisal");
      await m.page.getByLabel("Day").fill(day);
      await m.page.getByLabel("Time (optional)").fill("10:30");
      await m.page.getByLabel("Where (optional)").fill(`${RUN} office`);
      await m.page.getByRole("button", { name: "Book and email them" }).click();
      const booking = () => adminDb().from("staff_audit_bookings").select("id, booked_on, status").eq("user_id", amina.id).eq("kind", "appraisal").eq("status", "booked").eq("booked_on", day).maybeSingle();
      await expect.poll(async () => (await booking()).data?.id ?? null, { timeout: 15_000 }).not.toBeNull();
      const { data: b } = await booking();
      created.bookings.push(b!.id as string);
      await expect(m.page.locator("main")).toContainText(`${RUN} office`);
      await open(m.page, "/org/learners");
      await expect(m.page.getByRole("row", { name: new RegExp(amina.full_name) })).toContainText(/Booked/);
      await open(m.page, "/org/due/appraisals");
      await expect(m.page.getByRole("link", { name: new RegExp(`${amina.full_name}.*Booked`) })).toBeVisible();
    } finally {
      await m.context.close();
    }
    const c = await as(browser, "testStaff");
    try {
      await open(c.page, "/learn/reviews");
      await expect(c.page.locator("main")).toContainText(/Appraisal/);
      await expect(c.page.locator("main")).not.toContainText("Nothing booked");
      const boxes = c.page.locator("main textarea");
      const n = await boxes.count();
      expect(n, "the self-assessment has questions").toBeGreaterThan(0);
      for (let i = 0; i < n; i++) await boxes.nth(i).fill(`${RUN} answer ${i + 1}`);
      await c.page.getByRole("button", { name: "Send to my manager" }).click();
      await expect(c.page.getByRole("button", { name: "Send the changes" })).toBeVisible();
      await expect(c.page.locator("main")).not.toContainText("not sent yet");
      const { data: sa } = await adminDb().from("appraisal_self_assessments").select("submitted_at, answers").eq("booking_id", created.bookings[0]).single();
      expect(sa?.submitted_at).toBeTruthy();
      expect(JSON.stringify(sa?.answers)).toContain(RUN);
    } finally {
      await c.context.close();
    }
  });

  test("holding an overdue supervision, signed by both, brings the person up to date on the staff list and Today", async ({ browser }) => {
    const before = await expectedToday();
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/learners");
      await expect(m.page.getByRole("row", { name: new RegExp(mo.full_name) })).toContainText(/Overdue/);
      await open(m.page, `/org/staff/${mo.id}/supervisions/new?kind=supervision`);
      await expect(m.page.getByRole("heading", { name: `Supervision — ${mo.full_name}` })).toBeVisible();
      await m.page.getByLabel("Held on").fill(iso(0));
      const boxes = m.page.locator("main textarea");
      const n = await boxes.count();
      for (let i = 0; i < n; i++) {
        const name = await boxes.nth(i).getAttribute("name");
        if (name === "summary") await boxes.nth(i).fill(`${RUN} summary`);
        else if (name === "agreed") await boxes.nth(i).fill(`${RUN} shadow a medication call`);
        else await boxes.nth(i).fill(`${RUN} answer`);
      }
      await m.page.getByLabel("Actions due by (optional)").fill(iso(14));
      await sign(m.page, m.page.getByRole("group", { name: `${mo.full_name}'s signature *` }));
      await m.page.getByLabel("Their name, typed by them").fill(mo.full_name);
      await sign(m.page, m.page.getByRole("group", { name: "Your signature *" }));
      await m.page.getByRole("button", { name: "Save the supervision" }).click();
      await expect(m.page).toHaveURL(new RegExp(`/org/staff/${mo.id}\\?section=supervisions`));
      await expect(m.page.locator("main")).toContainText(`${RUN} summary`);
      const { data: s } = await adminDb().from("supervisions").select("id, next_due, carer_signed_at, manager_signed_at, answers").eq("user_id", mo.id).eq("summary", `${RUN} summary`).single();
      expect(s).toBeTruthy();
      created.supervisions.push(s!.id as string);
      expect(s!.carer_signed_at, "the carer's signature was kept").toBeTruthy();
      expect(s!.manager_signed_at, "the manager's signature was kept").toBeTruthy();
      expect(s!.next_due).toBeTruthy();
      const { data: acts } = await adminDb().from("record_actions").select("title").eq("source_id", s!.id);
      expect((acts ?? []).map((a) => a.title)).toContain(`${RUN} shadow a medication call`);
      await open(m.page, "/org/learners");
      await expect(m.page.getByRole("row", { name: new RegExp(mo.full_name) })).not.toContainText(/Overdue/);
      await expect(m.page.getByRole("row", { name: new RegExp(mo.full_name) })).toContainText(/Due/);
      const after = await expectedToday();
      expect(after.supervisionsUpToDate).toBe(before.supervisionsUpToDate + 1);
      const today = await readToday(m.page);
      expect(today.sup[0]).toBe(after.supervisionsUpToDate);
    } finally {
      await m.context.close();
    }
  });
});

test.describe("spot checks and competency", () => {
  test.describe.configure({ mode: "serial" });
  let amina: { id: string; full_name: string };
  let agnes: { id: string; full_name: string };
  const created = { spot: [] as string[], comp: [] as string[] };

  test.beforeAll(async () => {
    [amina, agnes] = await Promise.all([userByEmail(process.env.QA_TEST_STAFF_EMAIL!), clientByName("Agnes Fakeclient")]);
  });
  test.afterAll(async () => {
    const db = adminDb();
    const ids = [...created.spot, ...created.comp];
    if (ids.length) await db.from("record_actions").delete().in("source_id", ids);
    if (created.spot.length) await db.from("spot_checks").delete().in("id", created.spot);
    if (created.comp.length) await db.from("competency_checks").delete().in("id", created.comp);
  });

  test("a spot check is recorded with the carer's signature and shows on her file and Who's due", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, `/org/staff/${amina.id}/spot-checks/new`);
      await m.page.getByLabel("Client", { exact: true }).selectOption({ label: `${agnes.full_name} — Stockport` });
      await m.page.getByLabel("Done on").fill(iso(0));
      const yes = m.page.getByRole("button", { name: /: Yes$/ });
      const n = await yes.count();
      for (let i = 0; i < n; i++) await yes.nth(i).click();
      await m.page.getByRole("button", { name: "Met the standard" }).click();
      await m.page.getByLabel("Notes (optional)").fill(`${RUN} spot check`);
      await sign(m.page, m.page.getByRole("group", { name: `${amina.full_name}'s signature *` }));
      await m.page.getByLabel("Their name, typed by them").fill(amina.full_name);
      await m.page.getByRole("button", { name: "Save the spot check" }).click();
      await expect(m.page).toHaveURL(new RegExp(`/org/staff/${amina.id}\\?section=competency`));
      const { data } = await adminDb().from("spot_checks").select("id, outcome, client_id, next_due").eq("user_id", amina.id).eq("notes", `${RUN} spot check`).single();
      expect(data?.outcome).toBe("met");
      expect(data?.client_id).toBe(agnes.id);
      expect(data?.next_due).toBeTruthy();
      created.spot.push(data!.id as string);
      await expect(m.page.locator("main")).toContainText(agnes.full_name);
      await open(m.page, "/org/due/spot-checks");
      await expect(m.page.getByRole("heading", { name: "Who's due" })).toBeVisible();
      await expect(m.page.locator("main")).toContainText(amina.full_name);
    } finally {
      await m.context.close();
    }
  });

  test("a medication competency assessment is recorded and shows on Who's due → Competency", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, `/org/staff/${amina.id}/competency/new`);
      await m.page.getByLabel("Skill").selectOption("medication");
      await m.page.getByLabel("Assessed on").fill(iso(0));
      const yes = m.page.getByRole("button", { name: /: Yes$/ });
      const n = await yes.count();
      for (let i = 0; i < n; i++) await yes.nth(i).click();
      await m.page.getByRole("button", { name: "Competent", exact: true }).click();
      await m.page.getByLabel("Notes (optional)").fill(`${RUN} competency`);
      await m.page.getByRole("button", { name: "Save the assessment" }).click();
      await expect(m.page).toHaveURL(new RegExp(`/org/staff/${amina.id}\\?section=competency`));
      const { data } = await adminDb().from("competency_checks").select("id, outcome, area, next_due").eq("user_id", amina.id).eq("notes", `${RUN} competency`).single();
      expect(data?.outcome).toBe("met");
      expect(data?.area).toBe("medication");
      created.comp.push(data!.id as string);
      await open(m.page, "/org/due/competency");
      await expect(m.page.getByRole("heading", { name: "Who's due" })).toBeVisible();
      await expect(m.page.locator("main")).toContainText(amina.full_name);
    } finally {
      await m.context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Performance plans
// ---------------------------------------------------------------------------

test.describe("performance plans", () => {
  let amina: { id: string; full_name: string };
  let pipId = "";
  test.beforeAll(async () => {
    amina = await userByEmail(process.env.QA_TEST_STAFF_EMAIL!);
    await adminDb().from("pips").delete().eq("user_id", amina.id).like("reason", `${RUN}%`);
  });
  test.afterAll(async () => {
    if (pipId) await adminDb().from("pips").delete().eq("id", pipId);
  });

  test("create a plan, sign it, review each week, and close it", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, `/org/pips/new?user=${amina.id}`);
      await expect(m.page.getByLabel("Who the plan is for")).toHaveValue(amina.id);
      await m.page.getByLabel("Why this plan is in place").fill(`${RUN} late MAR entries on two visits`);
      await m.page.getByPlaceholder("Concern 1").fill("MAR charts left incomplete");
      await m.page.getByPlaceholder("Standard expected").fill("Every MAR entry made before leaving");
      await m.page.getByPlaceholder("How it is measured").fill("Weekly MAR audit of her visits");
      await m.page.getByPlaceholder("e.g. Stay the full duration of each call").fill("Complete the MAR before leaving the client");
      await m.page.getByPlaceholder("Detail").fill("Medication refresher booked");
      await m.page.getByLabel("Runs for (weeks)").fill("2");
      await m.page.getByRole("button", { name: "Start the plan" }).click();
      await expect(m.page).toHaveURL(/\/org\/pips\/[0-9a-f-]{36}$/);
      pipId = m.page.url().split("/").pop()!;
      const { data: pip } = await adminDb().from("pips").select("status, duration_weeks, pip_reviews (id, week_number)").eq("id", pipId).single();
      expect(pip?.status).toBe("open");
      expect(pip?.duration_weeks).toBe(2);
      expect((pip?.pip_reviews as unknown[]).length).toBe(2);

      // Both signatures: every form with a pad gets a squiggle and is saved.
      for (let round = 0; round < 2; round++) {
        const forms = m.page.locator("form", { has: m.page.locator("canvas") });
        const left = await forms.count();
        if (left === 0) break;
        await sign(m.page, forms.first());
        await forms.first().getByRole("button", { name: "Save signature" }).click();
        await expect(forms).toHaveCount(left - 1);
      }
      const { data: signed } = await adminDb().from("pips").select("carer_signed_at, manager_signed_at").eq("id", pipId).single();
      expect(signed?.carer_signed_at, "carer signature saved").toBeTruthy();
      expect(signed?.manager_signed_at, "manager signature saved").toBeTruthy();

      // Week reviews, each opened from its own heading and signed off.
      for (let week = 1; week <= 2; week++) {
        const heading = m.page.getByRole("button", { name: new RegExp(`^Week ${week} ·`) });
        if (!/Reviewed/.test(await heading.innerText())) {
          const f = heading.locator("xpath=following-sibling::form[1]");
          if ((await f.count()) === 0) await heading.click();
          await expect(f).toBeVisible();
          await f.locator('textarea[name="managerNotes"]').fill(`${RUN} week ${week}: MAR complete on every audited visit`);
          await f.locator('select[name="rating"]').selectOption({ index: 1 });
          await f.getByRole("button", { name: "Save and sign the week off" }).click();
          await expect(heading).toContainText("Reviewed");
        }
      }
      const { data: reviewed } = await adminDb().from("pip_reviews").select("completed_at").eq("pip_id", pipId);
      expect((reviewed ?? []).every((r) => !!r.completed_at)).toBe(true);

      // Close.
      await m.page.getByRole("radio").first().check();
      await m.page.getByLabel("Why").fill(`${RUN}: standards met for both weeks`);
      await m.page.getByRole("button", { name: "Close the plan" }).click();
      await expect(m.page.locator("main")).not.toContainText("Close the plan");
      const { data: closed } = await adminDb().from("pips").select("status, outcome, closed_at").eq("id", pipId).single();
      expect(closed?.status).toBe("completed");
      expect(closed?.closed_at).toBeTruthy();
      await open(m.page, "/org/pips");
      await expect(m.page.locator("main")).toContainText(amina.full_name);
    } finally {
      await m.context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Service audits and the governance report
// ---------------------------------------------------------------------------

test.describe("service audits", () => {
  test.describe.configure({ mode: "serial" });
  let agnes: { id: string; full_name: string };
  let tom: { id: string; full_name: string };
  const auditIds: string[] = [];
  test.beforeAll(async () => {
    [agnes, tom] = await Promise.all([clientByName("Agnes Fakeclient"), userByEmail(process.env.QA_TEST_TRAINER_EMAIL!)]);
  });
  test.afterAll(async () => {
    const db = adminDb();
    if (auditIds.length) {
      await db.from("record_actions").delete().in("source_id", auditIds);
      await db.from("audits").delete().in("id", auditIds);
    }
  });

  test("a medication audit for a client: a No with an owner becomes an action", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/audits/new");
      await m.page.getByRole("link", { name: /^Medication audit/ }).click();
      await expect(m.page.getByRole("heading", { name: "Medication audit" })).toBeVisible();
      await m.page.getByLabel("Client", { exact: true }).selectOption(agnes.id);
      await m.page.getByLabel("Carried out on").fill(iso(0));
      const yes = m.page.getByRole("button", { name: /: Yes$/ });
      const n = await yes.count();
      for (let i = 0; i < n; i++) await yes.nth(i).click();
      // Question 8 falls short, with an owner and a date.
      const short = "Stock counts balance with what the MAR shows was given";
      await m.page.getByRole("button", { name: `${short}: No` }).click();
      await m.page.getByLabel(`Comment on ${short}`).fill(`${RUN}: two paracetamol unaccounted for`);
      await m.page.getByLabel(`Who will act on ${short}`).selectOption(tom.id);
      await m.page.getByLabel("Done by").first().fill(iso(10));
      await m.page.getByLabel("Notes (optional)").fill(`${RUN} medication audit`);
      await sign(m.page, m.page.getByRole("group", { name: "Your signature *" }));
      await expect(m.page.getByText(`${n} of ${n} answered`)).toBeVisible();
      await m.page.getByRole("button", { name: "Sign off and save" }).click();
      await expect(m.page).toHaveURL(/\/org\/audits\/[0-9a-f-]{36}$/);
      const id = m.page.url().split("/").pop()!;
      auditIds.push(id);
      const { data: a } = await adminDb().from("audits").select("kind, client_id, score, next_due").eq("id", id).single();
      expect(a?.kind).toBe("medication");
      expect(a?.client_id).toBe(agnes.id);
      expect(a?.score).toBe(Math.round(((n - 1) / n) * 100));
      const { data: acts } = await adminDb().from("record_actions").select("title, user_id, due_date").eq("source_id", id);
      expect(acts?.length, "one action from the No").toBe(1);
      expect(acts?.[0].user_id).toBe(tom.id);
      expect(acts?.[0].due_date).toBe(iso(10));
      await expect(m.page.locator("main")).toContainText(short);
      await expect(m.page.locator("main")).toContainText(tom.full_name);
      await open(m.page, "/org/audits");
      await expect(m.page.locator("main")).toContainText("Medication audit");
    } finally {
      await m.context.close();
    }
  });

  test("a service-wide infection control audit is recorded and clears its line on Today", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/audits/new?form=infection_control");
      await m.page.getByLabel("Carried out on").fill(iso(0));
      const yes = m.page.getByRole("button", { name: /: Yes$/ });
      const n = await yes.count();
      for (let i = 0; i < n; i++) await yes.nth(i).click();
      // Rating questions, if any, get full marks; text questions a line.
      const fives = m.page.getByRole("button", { name: /: 5 of 5$/ });
      for (let i = 0; i < (await fives.count()); i++) await fives.nth(i).click();
      await m.page.getByLabel("Notes (optional)").fill(`${RUN} IPC audit`);
      await sign(m.page, m.page.getByRole("group", { name: "Your signature *" }));
      await m.page.getByRole("button", { name: "Sign off and save" }).click();
      await expect(m.page).toHaveURL(/\/org\/audits\/[0-9a-f-]{36}$/);
      const id = m.page.url().split("/").pop()!;
      auditIds.push(id);
      const { data: a } = await adminDb().from("audits").select("kind, client_id, next_due").eq("id", id).single();
      expect(a?.kind).toBe("infection_control");
      expect(a?.client_id).toBeNull();
      expect(a?.next_due).toBeTruthy();
      const want = await expectedToday();
      const today = await readToday(m.page);
      expect(today.auditsDue).toBe(want.auditsLate);
    } finally {
      await m.context.close();
    }
  });

  test("the governance report renders and its PDF is a real PDF naming the company", async ({ browser, baseURL }) => {
    const m = await as(browser, "testManager");
    try {
      await open(m.page, "/org/audits/governance");
      await expect(m.page.getByRole("heading", { name: "Governance report" })).toBeVisible();
      await expect(m.page.getByRole("heading", { name: "Audits", exact: true })).toBeVisible();
      await expect(m.page.getByRole("heading", { name: "Training compliance" })).toBeVisible();
      await expect(m.page.getByRole("link", { name: "Download the PDF" })).toHaveAttribute("href", /\/org\/audits\/governance\/pdf\?month=\d{4}-\d{2}/);
    } finally {
      await m.context.close();
    }
    const api = await playwrightRequest.newContext({ baseURL, storageState: session("testManager") });
    try {
      const month = new Date(Date.now() - 20 * DAY).toISOString().slice(0, 7);
      const file = await fetchFile(api, `/org/audits/governance/pdf?month=${month}`);
      expect(file.status).toBe(200);
      expect(file.type).toContain("application/pdf");
      expect(file.body.subarray(0, 5).toString()).toBe("%PDF-");
      expect(file.disposition).toContain("Governance report");
      expect(pdfText(file.body)).toContain("QA Test Care Ltd");
    } finally {
      await api.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Complaints, safeguarding and feedback
// ---------------------------------------------------------------------------

test.describe("complaints and concerns", () => {
  test.describe.configure({ mode: "serial" });
  let tom: { id: string; full_name: string };
  let agnes: { id: string; full_name: string };
  const complaintIds: string[] = [];
  let nearMissId = "";
  let concernId = "";

  test.beforeAll(async () => {
    [tom, agnes] = await Promise.all([userByEmail(process.env.QA_TEST_TRAINER_EMAIL!), clientByName("Agnes Fakeclient")]);
  });
  test.afterAll(async () => {
    const db = adminDb();
    if (complaintIds.length) {
      const { data: docs } = await db.from("complaint_documents").select("file_path").in("complaint_id", complaintIds);
      const paths = (docs ?? []).map((d) => d.file_path as string);
      if (paths.length) await db.storage.from("complaint-documents").remove(paths).catch(() => null);
      await db.from("record_actions").delete().in("source_id", complaintIds);
      await db.from("complaints").delete().in("id", complaintIds);
    }
  });

  /** The company's process must exist before a record can be raised. */
  async function ensureStages(page: Page): Promise<void> {
    await open(page, "/org/complaints");
    const seed = page.getByRole("button", { name: "Add the standard stages" });
    if (await seed.isVisible().catch(() => false)) {
      await seed.click();
      await expect(seed).toHaveCount(0);
    }
  }

  test("a near miss is logged from the form and opens on its own record", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await ensureStages(m.page);
      await open(m.page, "/org/complaints/new");
      await m.page.getByRole("radio", { name: /^Near miss/ }).check();
      await m.page.getByLabel("Date it happened").fill(iso(-1));
      await m.page.getByLabel(/Reported by|Raised by/).fill("QA Reporter");
      await m.page.getByLabel("Role").selectOption("staff");
      await m.page.getByLabel("Client").selectOption(agnes.id);
      await m.page.getByLabel("What it was about").selectOption({ label: "Moving & handling" });
      await m.page.getByLabel("Who or what it concerns").selectOption({ label: "The service as a whole" });
      await m.page.getByLabel(/What happened|Detailed description/).fill(`${RUN} near miss: the hoist sling was the wrong size but was spotted before the transfer.`);
      await m.page.getByRole("button", { name: /Record it|Raise it/ }).click();
      await expect(m.page).toHaveURL(/\/org\/complaints\/[0-9a-f-]{36}$/);
      nearMissId = m.page.url().split("/").pop()!;
      complaintIds.push(nearMissId);
      await expect(m.page.getByRole("heading", { level: 1 })).toContainText(/^NM-/);
      await expect(m.page.locator("main")).toContainText(`${RUN} near miss`);
      const { data: c } = await adminDb().from("complaints").select("kind, status, client_id, raised_by_name").eq("id", nearMissId).single();
      expect(c?.kind).toBe("near_miss");
      expect(c?.status).toBe("open");
      expect(c?.client_id).toBe(agnes.id);
      expect(c?.raised_by_name).toBe("QA Reporter");
      await open(m.page, "/org/complaints?kind=near_miss");
      await expect(m.page.locator("main")).toContainText(`${RUN} near miss`);
    } finally {
      await m.context.close();
    }
  });

  test("an untriaged concern is triaged into an issue, which starts its process", async ({ browser }) => {
    const m = await as(browser, "testManager");
    try {
      await ensureStages(m.page);
      await open(m.page, "/org/complaints/new");
      await m.page.getByRole("radio", { name: /^Not sure yet/ }).check();
      await m.page.getByLabel("Who or what it concerns").selectOption({ label: "The office or a manager" });
      await m.page.getByLabel("Detailed description").fill(`${RUN} concern: a family member says the rota changed without anyone telling them.`);
      await m.page.getByRole("button", { name: "Raise it" }).click();
      await expect(m.page).toHaveURL(/\/org\/complaints\/[0-9a-f-]{36}$/);
      concernId = m.page.url().split("/").pop()!;
      complaintIds.push(concernId);
      await expect(m.page.locator("main")).toContainText("Concern waiting to be looked at");
      await expect(m.page.getByRole("button", { name: "Close the record" })).toBeDisabled();
      await m.page.getByRole("radio", { name: /^Issue/ }).check();
      await m.page.getByRole("button", { name: "Save", exact: true }).first().click();
      await expect(m.page.locator("main")).not.toContainText("Concern waiting to be looked at");
      await expect(m.page.locator("main")).toContainText("Triage");
      const { data: c } = await adminDb().from("complaints").select("kind, triaged_at, triaged_by, reference").eq("id", concernId).single();
      expect(c?.kind).toBe("issue");
      expect(c?.triaged_at).toBeTruthy();
      await open(m.page, "/org/complaints?kind=issue");
      await expect(m.page.locator("main")).toContainText(c!.reference as string);
    } finally {
      await m.context.close();
    }
  });

  test("an action with an owner and documents of every kind go onto a stage", async ({ browser }) => {
    expect(nearMissId).toBeTruthy();
    const m = await as(browser, "testManager");
    try {
      await open(m.page, `/org/complaints/${nearMissId}`);
      await m.page.getByRole("button", { name: "Actions and Training", exact: true }).click();
      await m.page.getByRole("button", { name: "Add another action" }).click();
      await m.page.getByPlaceholder("What is to be done").fill(`${RUN} check every sling size on the round`);
      await m.page.locator('select[name="ownerId"]').last().selectOption(tom.id);
      await m.page.getByLabel("Done by").last().fill(iso(7));
      await m.page.getByRole("button", { name: "Add", exact: true }).last().click();
      await expect(m.page.locator("main")).toContainText(`${RUN} check every sling size`);
      const { data: acts } = await adminDb().from("record_actions").select("title, user_id, due_date, source_type").eq("source_id", nearMissId);
      expect(acts?.map((a) => a.title)).toContain(`${RUN} check every sling size on the round`);
      expect(acts?.find((a) => (a.title as string).includes(RUN))?.user_id).toBe(tom.id);

      // Documents on the same stage.
      const file = m.page.locator('input[name="file"]');
      await expect(file).toBeVisible();
      const upload = async (name: string, mimeType: string, buffer: Buffer) => {
        await file.setInputFiles({ name, mimeType, buffer });
        await m.page.getByRole("button", { name: "Upload", exact: true }).click();
        // The file appears as a link under Documents, or a message says why not.
        const shown = m.page.locator("main").getByRole("link", { name, exact: true });
        const accepted = await shown.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
        const errorText = accepted
          ? ""
          : (await m.page.locator("main").getByText(/failed|must be under|Choose a file|too large|Body exceeded|not allowed|error/i).first().innerText({ timeout: 2_000 }).catch(() => "")).trim();
        return { accepted, errorText };
      };
      const png = await upload(`${RUN}-photo.png`, "image/png", tinyPng);
      expect(png.accepted, `a small PNG is accepted (${png.errorText})`).toBe(true);
      const pdf = await upload(`${RUN}-statement.pdf`, "application/pdf", tinyPdf);
      expect(pdf.accepted, `a small PDF is accepted (${pdf.errorText})`).toBe(true);
      const { data: docs } = await adminDb().from("complaint_documents").select("file_name, mime, file_size").eq("complaint_id", nearMissId);
      expect(docs?.map((d) => d.file_name)).toEqual(expect.arrayContaining([`${RUN}-photo.png`, `${RUN}-statement.pdf`]));

    } finally {
      await m.context.close();
    }
  });

  test("a 10 MB file and an .exe renamed .pdf are refused", async ({ browser }) => {
    // BUG: uploadDocumentAction (app/org/complaints/actions.ts) checks only
    // the size (20 MB) and never the bytes, so a renamed executable is stored
    // and served back as application/pdf. The 10 MB file is stopped by
    // Next's 4 MB server-action body limit, with no message for the user.
    expect(nearMissId).toBeTruthy();
    const m = await as(browser, "testManager");
    try {
      const upload = async (name: string, buffer: Buffer) => {
        await open(m.page, `/org/complaints/${nearMissId}`);
        await m.page.getByRole("button", { name: "Actions and Training", exact: true }).click();
        await m.page.locator('input[name="file"]').setInputFiles({ name, mimeType: "application/pdf", buffer });
        await m.page.getByRole("button", { name: "Upload", exact: true }).click();
        const shown = m.page.locator("main").getByRole("link", { name, exact: true });
        const accepted = await shown.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
        const message = accepted
          ? ""
          : (await m.page.getByText(/failed|must be under|Choose a file|too large|Body exceeded|not allowed|error|wrong/i).first().innerText({ timeout: 2_000 }).catch(() => "")).trim();
        return { accepted, message };
      };
      const big = await upload(`${RUN}-big.pdf`, Buffer.concat([tinyPdf, Buffer.alloc(10 * 1024 * 1024, 0x20)]));
      const exe = await upload(`${RUN}-renamed.pdf`, Buffer.concat([Buffer.from("MZ\x90\x00\x03\x00\x00\x00"), Buffer.alloc(2048, 0)]));
      console.log(`[uploads] 10 MB: ${big.accepted ? "ACCEPTED" : `refused (${big.message || "no message shown"})`}; .exe renamed .pdf: ${exe.accepted ? "ACCEPTED" : `refused (${exe.message || "no message shown"})`}`);
      const { data: docs } = await adminDb().from("complaint_documents").select("file_name, mime, file_size").eq("complaint_id", nearMissId);
      console.log(`[uploads] stored: ${JSON.stringify(docs)}`);
      expect.soft(big.accepted, "a 10 MB file is refused with a message").toBe(false);
      expect.soft(big.message, "the 10 MB refusal says why").not.toBe("");
      expect(exe.accepted, "an executable renamed .pdf is refused").toBe(false);
    } finally {
      await m.context.close();
    }
  });

  test("the record PDF and the evidence bundle download as real files", async ({ baseURL }) => {
    expect(nearMissId).toBeTruthy();
    const api = await playwrightRequest.newContext({ baseURL, storageState: session("testManager") });
    try {
      const pdf = await fetchFile(api, `/org/complaints/${nearMissId}/pdf`);
      expect(pdf.status).toBe(200);
      expect(pdf.type).toContain("application/pdf");
      expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdfText(pdf.body)).toContain("QA Test Care");
      const zip = await fetchFile(api, `/org/complaints/${nearMissId}/bundle`);
      expect(zip.status).toBe(200);
      expect(zip.type).toMatch(/zip/);
      expect(zip.body.subarray(0, 2).toString()).toBe("PK");
    } finally {
      await api.dispose();
    }
  });

  test("the near miss is worked through its stages and closed", async ({ browser }) => {
    expect(nearMissId).toBeTruthy();
    const m = await as(browser, "testManager");
    try {
      await open(m.page, `/org/complaints/${nearMissId}`);
      const stage = (name: string) => m.page.getByRole("button", { name, exact: true });
      // 1. What happened.
      await stage("Near Miss Report").click();
      await m.page.getByLabel("Where it happened *").fill("Agnes's bedroom, morning call");
      await m.page.getByLabel("What would have happened if it had not been caught *").fill("A fall from the hoist during the transfer.");
      await m.page.getByLabel("What stopped it").fill("The second carer checked the sling label.");
      await m.page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(m.page.locator("main")).not.toContainText("Finish the Near Miss Report");
      // 2. Actions and training: the questions, and the action agreed earlier ticked off.
      await stage("Actions and Training").click();
      await m.page.getByLabel("Why it happened *").fill("Two sling sizes are kept in the same bag.");
      await m.page.getByLabel("What will stop it happening again *").fill("Slings labelled and stored separately; label checked before every transfer.");
      await m.page.getByRole("group", { name: "Actions and training" }).getByRole("button", { name: "No", exact: true }).click();
      await m.page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(m.page.locator("main")).not.toContainText("Finish the Actions and Training");
      const done = m.page.getByRole("button", { name: "Mark done" });
      while ((await done.count()) > 0) {
        await done.first().click();
        await m.page.waitForTimeout(800);
      }
      await expect.poll(async () => (await adminDb().from("record_actions").select("completed_at").eq("source_id", nearMissId)).data?.every((a) => !!a.completed_at)).toBe(true);
      // 3. Close.
      await open(m.page, `/org/complaints/${nearMissId}`);
      await expect(m.page.locator("main")).toContainText("Everything is in. Close the record.");
      // The step list's button opens the close panel; the panel's own submits it.
      await m.page.getByRole("listitem").filter({ hasText: "Follow-up and close" }).getByRole("button", { name: "Close the record" }).first().click();
      await m.page.getByLabel("What came of it").fill(`${RUN}: sling sizes re-labelled; nobody was hurt`);
      await m.page.getByLabel("What we learned").fill("Check the sling label against the care plan before every transfer.");
      const submit = m.page.locator("form").getByRole("button", { name: "Close the record" });
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect.poll(async () => (await adminDb().from("complaints").select("status").eq("id", nearMissId).single()).data?.status, { timeout: 15_000 }).toBe("closed");
      const { data: c } = await adminDb().from("complaints").select("status, closed_on, outcome_summary, lessons_learned").eq("id", nearMissId).single();
      expect(c?.closed_on).toBeTruthy();
      expect(c?.outcome_summary).toContain(RUN);
      await open(m.page, "/org/complaints?status=closed");
      await expect(m.page.locator("main")).toContainText(`${RUN} near miss`);
    } finally {
      await m.context.close();
    }
  });
});

test.describe("feedback surveys", () => {
  let surveyId = "";
  test.afterAll(async () => {
    if (surveyId) {
      await adminDb().from("feedback_responses").delete().eq("survey_id", surveyId);
      await adminDb().from("feedback_surveys").delete().eq("id", surveyId);
    }
  });

  test("a round is started, answered through its public link signed out, and counted", async ({ browser }) => {
    const m = await as(browser, "testManager");
    let link = "";
    try {
      await open(m.page, "/org/feedback");
      await m.page.getByLabel("Who it is for").selectOption("client");
      await m.page.getByLabel("Name of the round").fill(`${RUN} client round`);
      await m.page.getByLabel("Closes (optional)").fill(iso(30));
      await m.page.getByRole("button", { name: "Start the round" }).click();
      await expect(m.page).toHaveURL(/\/org\/feedback\/[0-9a-f-]{36}$/);
      surveyId = m.page.url().split("/").pop()!;
      await expect(m.page.getByRole("heading", { name: `${RUN} client round` })).toBeVisible();
      link = (await m.page.locator("main code").first().innerText()).trim();
      expect(link).toMatch(/\/survey\/[A-Za-z0-9_-]+$/);
      await expect(m.page.locator("main")).toContainText("0 responses");
    } finally {
      await m.context.close();
    }
    const anon = await browser.newContext();
    try {
      const page = await anon.newPage();
      await page.goto(link);
      await expect(page.getByRole("heading", { name: `${RUN} client round` })).toBeVisible();
      const groups = page.getByRole("group");
      const n = await groups.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const g = groups.nth(i);
        // The radio itself is visually hidden; its label is what a person taps.
        const good = g.getByText("Good", { exact: true });
        if ((await good.count()) > 0) {
          await good.click();
          await expect(g.getByRole("radio", { name: "Good", exact: true })).toBeChecked();
        }
        const box = g.getByRole("textbox");
        if ((await box.count()) > 0) await box.first().fill(`${RUN}: the carers are kind`);
      }
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.locator("main")).toContainText(/thank you/i);
      const { data: r } = await adminDb().from("feedback_responses").select("answers").eq("survey_id", surveyId);
      expect(r?.length).toBe(1);
      expect(JSON.stringify(r?.[0].answers)).toContain(RUN);
    } finally {
      await anon.close();
    }
    const m2 = await as(browser, "testManager");
    try {
      await open(m2.page, `/org/feedback/${surveyId}`);
      await expect(m2.page.locator("main")).toContainText("1 response");
      await expect(m2.page.locator("main")).toContainText(`${RUN}: the carers are kind`);
      await open(m2.page, "/org/feedback");
      await expect(m2.page.getByRole("link", { name: new RegExp(`${RUN} client round`) })).toContainText("1 response");
    } finally {
      await m2.context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 8 (second pass). Today after everything above changed the records
// ---------------------------------------------------------------------------

test.describe("Today's numbers after this file's changes", () => {
  test("Training complete, Supervisions up to date and Service audits still match the database", async ({ browser }) => {
    const { context, page } = await as(browser, "testManager");
    try {
      await checkToday(page, "after");
    } finally {
      await context.close();
    }
  });

  test("the Due badge still counts the late lines", async ({ browser }) => {
    const { context, page } = await as(browser, "testManager");
    try {
      await checkDueBadge(page, "after");
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 9. The key forms at 390px (@mobile → --project=mobile)
// ---------------------------------------------------------------------------

test.describe("key forms on a phone @mobile", () => {
  test("nothing is cut off or pushed past the edge at 390px", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "runs under --project=mobile only");
    const amina = await userByEmail(process.env.QA_TEST_STAFF_EMAIL!);
    const jade = await userByEmail("jade@qa-test-care.example.com");
    const pages: { path: string; submit: RegExp }[] = [
      { path: "/org/courses/admin", submit: /Assign training/ },
      { path: `/org/staff/${amina.id}/supervisions/new?kind=supervision`, submit: /Save the supervision/ },
      { path: `/org/staff/${amina.id}/spot-checks/new`, submit: /Save the spot check/ },
      { path: `/org/staff/${amina.id}/competency/new`, submit: /Save the assessment/ },
      { path: "/org/audits/new?form=medication", submit: /Sign off and save/ },
      { path: "/org/complaints/new", submit: /Raise it|Record it/ },
      { path: `/org/pips/new?user=${amina.id}`, submit: /Start the plan/ },
      { path: "/org/feedback", submit: /Start the round/ },
      { path: `/org/observations/${jade.id}`, submit: /Sign off & award/ },
    ];
    const problems: string[] = [];
    const { context, page } = await as(browser, "testManager");
    try {
      for (const { path, submit } of pages) {
        await open(page, path);
        const width = page.viewportSize()!.width;
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        if (scrollWidth > width + 1) problems.push(`${path}: page scrolls sideways (${scrollWidth}px wide at ${width}px)`);
        const button = page.getByRole("button", { name: submit }).first();
        if ((await button.count()) === 0) {
          problems.push(`${path}: no submit button matching ${submit}`);
        } else {
          await button.scrollIntoViewIfNeeded();
          const b = await button.boundingBox();
          if (!b) problems.push(`${path}: submit button has no box`);
          else if (b.x < 0 || b.x + b.width > width + 1) problems.push(`${path}: submit button runs past the edge (x ${Math.round(b.x)}–${Math.round(b.x + b.width)})`);
          else if (b.height < 40) problems.push(`${path}: submit button only ${Math.round(b.height)}px tall (under the 44px touch target)`);
        }
        // Every visible field sits inside the viewport.
        const fields = page.locator("main input:visible, main select:visible, main textarea:visible");
        const n = await fields.count();
        for (let i = 0; i < Math.min(n, 60); i++) {
          const f = fields.nth(i);
          const b = await f.boundingBox();
          if (!b) continue;
          if (b.x + b.width > width + 1 || b.x < -1) {
            const label = (await f.getAttribute("aria-label")) ?? (await f.getAttribute("name")) ?? (await f.getAttribute("id")) ?? `field ${i}`;
            problems.push(`${path}: "${label}" runs past the edge (x ${Math.round(b.x)}–${Math.round(b.x + b.width)})`);
          }
        }
      }
    } finally {
      await context.close();
    }
    console.log(`[mobile] checked ${pages.length} pages at ${390}px; problems: ${problems.length ? problems.join(" | ") : "none"}`);
    expect(problems).toEqual([]);
  });
});
