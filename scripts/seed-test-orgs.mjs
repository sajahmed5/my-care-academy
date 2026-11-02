// Reset and seed the QA organisations and logins on the LOCAL Supabase stack.
//
//   npm run qa:seed          (after `npx supabase start` and `npm run qa:env`)
//
// Creates, or removes and re-creates, four companies and nine logins (see
// docs/QA-REPORT.md §1). Passwords are strong and random, written to the
// git-ignored .env.test and never printed. Refuses to run against anything
// but a local stack (scripts/qa/env.mjs).
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabase, loadTestEnv, writeEnvFile } from "./qa/env.mjs";

loadTestEnv();
assertLocalSupabase();

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAY = 86_400_000;
/** A date `n` days from today as YYYY-MM-DD (UK calendar day is close enough for seeding). */
const d = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
/** A timestamp `n` days from now. */
const ts = (n, hour = 10) => {
  const x = new Date(Date.now() + n * DAY);
  x.setUTCHours(hour, 0, 0, 0);
  return x.toISOString();
};
const password = () => randomBytes(15).toString("base64url") + "!Qa1";

async function ins(table, rows, select = "id") {
  if (!rows.length) return [];
  // Rows in one insert may name different columns; the unnamed ones take
  // their defaults rather than null.
  const { data, error } = await admin.from(table).insert(rows, { defaultToNull: false }).select(select);
  if (error) throw new Error(`insert into ${table}: ${error.message}\n${JSON.stringify(rows[0]).slice(0, 300)}`);
  return data;
}
async function one(table, row, select = "id") {
  return (await ins(table, [row], select))[0];
}
async function upd(table, match, patch) {
  let q = admin.from(table).update(patch);
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
  const { error } = await q;
  if (error) throw new Error(`update ${table}: ${error.message}`);
}

/** Create an auth user (the handle_new_user trigger makes the profile). */
async function createLogin({ email, role, organisationId = null, fullName, lastSeen = null, status = "active" }) {
  const pw = password();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
    user_metadata: { role, organisation_id: organisationId, full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user.id;
  const patch = {};
  if (lastSeen !== null) patch.last_seen_at = ts(lastSeen);
  if (status !== "active") patch.status = status;
  if (Object.keys(patch).length) await upd("users", { id }, patch);
  return { id, email, password: pw, fullName };
}

/** Run one of the repo's own seed scripts against the local stack. */
function runScript(label, file, args = []) {
  process.stdout.write(`  ${label}… `);
  const r = spawnSync("node", [file, ...args], { env: process.env, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`\n${file} failed:\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
  console.log("done");
}

const ORG_NAMES = ["QA Test Care Ltd", "QA Empty Care Ltd", "QA Other Care Ltd", "QA Portal Care Ltd"];
const SOLO_EMAILS = ["qa-platform-admin@example.com", "qa-candidate@example.com"];

// ---------------------------------------------------------------------------
// 1. Remove the previous QA data
// ---------------------------------------------------------------------------
async function reset() {
  const { data: orgs } = await admin.from("organisations").select("id, name").in("name", ORG_NAMES);
  const orgIds = (orgs ?? []).map((o) => o.id);
  const { data: members } = orgIds.length
    ? await admin.from("users").select("id").in("organisation_id", orgIds)
    : { data: [] };
  const { data: solo } = await admin.from("users").select("id").in("email", SOLO_EMAILS);
  // A candidate's record links to their login; the login goes with the rest.
  for (const u of [...(members ?? []), ...(solo ?? [])]) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error && !/not found/i.test(error.message)) throw new Error(`deleteUser: ${error.message}`);
  }
  if (orgIds.length) {
    const { error } = await admin.from("organisations").delete().in("id", orgIds);
    if (error) throw new Error(`delete organisations: ${error.message}`);
  }
  console.log(`  removed ${orgIds.length} organisation(s) and ${(members?.length ?? 0) + (solo?.length ?? 0)} login(s)`);
}

// ---------------------------------------------------------------------------
// 2. The shared library: courses, questions, programme, policies, forms
// ---------------------------------------------------------------------------
async function library() {
  const { count } = await admin.from("courses").select("id", { count: "exact", head: true });
  if (!count) runScript("courses", "scripts/seed-catalogue.mjs", ["--i-know-this-destroys-content"]);
  else console.log(`  courses already present (${count}), leaving them`);
  // Additive and safe to re-run: only what is missing is added.
  runScript("newer courses", "scripts/seed-new-courses.mjs");
  runScript("assessment questions", "scripts/seed-questions.mjs");
  runScript("Care Certificate programme", "scripts/seed-programme.mjs");
  const { count: policies } = await admin.from("policy_documents").select("id", { count: "exact", head: true });
  if (!policies) {
    runScript("policy library", "scripts/seed-policy-drafts.mjs");
    // Drafts are published by a platform admin in real life; QA needs them live.
    await upd("policy_documents", { status: "draft" }, { status: "published", version: 1 });
  }
  // The migrations seed the twelve logs; the forms themselves come from
  // scripts/library-forms.json, each added unless its code is already there.
  const lib = JSON.parse(readFileSync("scripts/library-forms.json", "utf8")).forms;
  const { data: have } = await admin.from("form_templates").select("code").in("code", lib.map((f) => f.code));
  const haveCodes = new Set((have ?? []).map((r) => r.code));
  if (lib.some((f) => !haveCodes.has(f.code))) {
    const rows = lib.filter((f) => !haveCodes.has(f.code)).map((f, i) => ({
      code: f.code,
      title: f.title,
      description: f.description ?? null,
      category: f.category,
      audience: f.audience ?? "carer",
      review_months: f.review_months ?? null,
      is_log: !!f.is_log,
      log_person_label: f.log_person_label ?? null,
      service_types: f.service_types ?? null,
      fields: f.fields ?? [],
      status: "published",
      pack: "full",
      version: 1,
      sort_order: i,
    }));
    await ins("form_templates", rows);
    console.log(`  forms library: ${rows.length} added`);
  }
  // A library form always lands as a draft for a platform admin to publish
  // (a trigger sees to it); QA needs the library live.
  await upd("form_templates", { status: "draft" }, { status: "published" });
}

// ---------------------------------------------------------------------------
// 3. The companies
// ---------------------------------------------------------------------------
const env = {};
function remember(prefix, login, orgId) {
  env[`${prefix}_EMAIL`] = login.email;
  env[`${prefix}_PASSWORD`] = login.password;
  if (orgId) env[`${prefix}_ORG_ID`] = orgId;
}

async function org(name, extra = {}) {
  return (await one("organisations", { name, service_type: "homecare", size_band: "10_to_25", ...extra })).id;
}

async function testCare(courses) {
  const orgId = await org("QA Test Care Ltd", { package_tier: "full" });
  env.QA_TEST_ORG_ID = orgId;
  await one("organisation_subscriptions", { organisation_id: orgId, monthly_amount_pence: 24900, note: "QA: paid Enterprise" }, "organisation_id");

  const manager = await createLogin({ email: "qa-manager@qa-test-care.example.com", role: "org_admin", organisationId: orgId, fullName: "Priya Testmanager", lastSeen: -1 });
  const trainer = await createLogin({ email: "qa-trainer@qa-test-care.example.com", role: "org_office", organisationId: orgId, fullName: "Tom Testtrainer", lastSeen: -3 });
  remember("QA_TEST_MANAGER", manager);
  remember("QA_TEST_TRAINER", trainer);

  // Fifteen carers, each in a different state. `seen` is days since last active (null = never).
  const CARERS = [
    ["qa-staff@qa-test-care.example.com", "Amina Fakecarer", -2],
    ["qa-staff-new@qa-test-care.example.com", "Ben Fakestarter", null],
    ["carla@qa-test-care.example.com", "Carla Fakecompliant", -1],
    ["dev@qa-test-care.example.com", "Dev Fakeoverdue", -40],
    ["erin@qa-test-care.example.com", "Erin Fakeappraisal", -5],
    ["farah@qa-test-care.example.com", "Farah Fakeexpiring", -4],
    ["gus@qa-test-care.example.com", "Gus Fakeexpired", -12],
    ["hana@qa-test-care.example.com", "Hana Fakeassessment", -1],
    ["ivan@qa-test-care.example.com", "Ivan Fakeleaver", -60],
    ["jade@qa-test-care.example.com", "Jade Fakeprobation", -2],
    ["kai@qa-test-care.example.com", "Kai Fakesick", -9],
    ["lena@qa-test-care.example.com", "Lena Fakeholiday", -6],
    ["mo@qa-test-care.example.com", "Mo Fakecompetency", -3],
    ["nia@qa-test-care.example.com", "Nia Fakenewstarter", null],
    ["omar@qa-test-care.example.com", "Omar Fakelate", -7],
  ];
  const c = {};
  for (const [email, fullName, seen] of CARERS) {
    const key = fullName.split(" ")[0].toLowerCase();
    c[key] = await createLogin({ email, role: "learner", organisationId: orgId, fullName, lastSeen: seen });
  }
  remember("QA_TEST_STAFF", c.amina);
  remember("QA_TEST_STAFF_NEW", c.ben);
  await upd("users", { id: c.ivan.id }, { status: "deactivated" });

  const everyone = [manager, trainer, ...Object.values(c)];
  // Employment: start dates and job titles (probation runs for six months).
  const starts = { nia: -7, jade: -60, ben: -3, amina: -400, carla: -900, dev: -300, erin: -500, farah: -200, gus: -800, hana: -100, ivan: -700, kai: -250, lena: -350, mo: -150, omar: -450 };
  await ins("staff_employment", everyone.map((u) => {
    const key = u.fullName.split(" ")[0].toLowerCase();
    const start = starts[key] ?? -1000;
    return {
      user_id: u.id,
      organisation_id: orgId,
      start_date: d(start),
      job_title: u === manager ? "Registered manager" : u === trainer ? "Training coordinator" : key === "carla" ? "Senior care worker" : "Care worker",
      probation_status: start > -183 ? "in_probation" : "passed",
      probation_ends_on: d(start + 183),
    };
  }), "user_id");

  // Clients.
  const CLIENTS = ["Agnes Fakeclient", "Bertie Fakeclient", "Constance Fakeclient", "Dilip Fakeclient", "Edna Fakeclient", "Frank Fakeclient", "Gloria Fakeclient", "Harold Fakeclient", "Irene Fakeclient", "Joe Fakeclient"];
  const clients = await ins("clients", CLIENTS.map((full_name, i) => ({
    organisation_id: orgId,
    full_name,
    date_of_birth: `19${40 + i}-0${(i % 9) + 1}-1${i}`,
    postcode: `SK${i + 1} ${i}AB`,
    region: i < 5 ? "Stockport" : "Manchester",
    funder_type: ["council", "self", "nhs", "other"][i % 4],
    medication_support: i < 3,
    start_date: d(-30 * (i + 1)),
    status: i === 9 ? "ended" : "active",
  })));

  // Training. Courses come from the catalogue; take the first ten by sort order.
  const course = (i) => courses[i % courses.length].id;
  const enrol = (user, i, extra = {}) => ({
    organisation_id: orgId, user_id: user.id, course_id: course(i), status: "not_started", progress: 0, due_date: null, assigned_at: ts(-30), time_spent: 0, current_block: 0, completion_count: 0, attempt_count: 0, last_reminder_at: null, ...extra,
  });
  const done = (user, i, issuedDaysAgo, extra = {}) => enrol(user, i, { status: "completed", progress: 100, due_date: d(-issuedDaysAgo - 5), completion_count: 1, ...extra });
  const enrolments = [
    // Amina: training to do — 2 overdue, 1 in progress, 2 complete.
    enrol(c.amina, 0, { due_date: d(-10) }), enrol(c.amina, 1, { due_date: d(-3) }), enrol(c.amina, 2, { status: "in_progress", progress: 45, due_date: d(20) }), done(c.amina, 3, 40), done(c.amina, 4, 100),
    // Ben: never signed in, 3 not started with dates ahead.
    enrol(c.ben, 0, { due_date: d(14) }), enrol(c.ben, 1, { due_date: d(21) }), enrol(c.ben, 2, { due_date: d(28) }),
    // Carla: everything complete.
    done(c.carla, 0, 30), done(c.carla, 1, 60), done(c.carla, 2, 90), done(c.carla, 5, 120),
    // Dev: overdue.
    enrol(c.dev, 0, { due_date: d(-45) }), enrol(c.dev, 3, { status: "in_progress", progress: 10, due_date: d(-20) }), done(c.dev, 1, 200),
    // Erin: due soon.
    enrol(c.erin, 0, { due_date: d(5) }), done(c.erin, 1, 10),
    // Farah: completed, certificate expiring in 20 days.
    done(c.farah, 0, 345), done(c.farah, 1, 20),
    // Gus: an expired certificate.
    done(c.gus, 0, 400, { status: "expired" }), enrol(c.gus, 2, { due_date: d(30) }),
    // Hana: read to the end, assessment outstanding.
    enrol(c.hana, 0, { status: "in_progress", progress: 100, due_date: d(7) }), done(c.hana, 1, 15),
    // Jade: new starter on induction.
    enrol(c.jade, 0, { status: "in_progress", progress: 60, due_date: d(10) }), enrol(c.jade, 1, { due_date: d(10) }), done(c.jade, 2, 5),
    // Kai, Lena, Mo, Omar: mixed.
    done(c.kai, 0, 50), enrol(c.kai, 1, { due_date: d(40) }),
    done(c.lena, 0, 50), done(c.lena, 1, 80),
    enrol(c.mo, 0, { due_date: d(-2) }), done(c.mo, 1, 30),
    done(c.omar, 0, 10, { due_date: d(-30) }), // finished late
    // Manager and trainer have their own training too.
    enrol(manager, 0, { due_date: d(30) }), done(trainer, 0, 20),
  ];
  const enrolRows = await ins("enrolments", enrolments, "id, user_id, course_id, status, due_date");

  // A certificate for every completed (or expired) enrolment.
  let n = 0;
  const certs = [];
  for (const e of enrolRows.filter((x) => x.status === "completed" || x.status === "expired")) {
    const src = enrolments.find((s) => s.user_id === e.user_id && s.course_id === e.course_id);
    const issued = src.due_date ? new Date(Date.parse(src.due_date) + 5 * DAY) : new Date(Date.now() - 30 * DAY);
    let expires = new Date(issued.getTime() + 365 * DAY);
    if (e.user_id === c.farah.id && e.course_id === course(0)) expires = new Date(Date.now() + 20 * DAY);
    if (e.user_id === c.gus.id) expires = new Date(Date.now() - 10 * DAY);
    if (e.user_id === c.omar.id) issued.setTime(Date.now() - 2 * DAY); // completed late
    certs.push({ certificate_number: `MCA-QA-${String(++n).padStart(4, "0")}`, organisation_id: orgId, user_id: e.user_id, course_id: e.course_id, issued_at: issued.toISOString(), expires_at: expires.toISOString() });
  }
  await ins("certificates", certs);

  // Assessment attempts, for pass/fail history and the Stars leaderboard.
  await ins("quiz_attempts", [
    { organisation_id: orgId, user_id: c.amina.id, course_id: course(3), question_ids: [], answers: [], score: 90, passed: true, started_at: ts(-40), submitted_at: ts(-40, 11) },
    { organisation_id: orgId, user_id: c.amina.id, course_id: course(4), question_ids: [], answers: [], score: 60, passed: false, started_at: ts(-101), submitted_at: ts(-101, 11) },
    { organisation_id: orgId, user_id: c.amina.id, course_id: course(4), question_ids: [], answers: [], score: 85, passed: true, started_at: ts(-100), submitted_at: ts(-100, 11) },
    { organisation_id: orgId, user_id: c.carla.id, course_id: course(0), question_ids: [], answers: [], score: 100, passed: true, started_at: ts(-30), submitted_at: ts(-30, 11) },
    { organisation_id: orgId, user_id: c.carla.id, course_id: course(1), question_ids: [], answers: [], score: 95, passed: true, started_at: ts(-60), submitted_at: ts(-60, 11) },
    { organisation_id: orgId, user_id: c.hana.id, course_id: course(1), question_ids: [], answers: [], score: 80, passed: true, started_at: ts(-15), submitted_at: ts(-15, 11) },
  ]);

  // Supervisions and appraisals, in every state.
  const sup = (user, held, next, extra = {}) => ({ organisation_id: orgId, user_id: user.id, supervisor_id: manager.id, kind: "supervision", held_on: d(held), next_due: d(next), summary: "QA seed: routine 1:1", ...extra });
  const app = (user, held, next, extra = {}) => ({ ...sup(user, held, next, extra), kind: "appraisal", summary: "QA seed: annual appraisal" });
  await ins("supervisions", [
    sup(c.carla, -30, 60, { carer_signed_at: ts(-29), carer_signed_name: "Carla Fakecompliant", manager_signed_at: ts(-29), manager_signed_name: "Priya Testmanager" }), app(c.carla, -100, 265),
    sup(c.dev, -150, -60), app(c.dev, -400, -35),
    sup(c.erin, -80, 10), // due soon
    sup(c.amina, -45, 45), app(c.amina, -200, 165),
    sup(c.farah, -20, 70), app(c.farah, -300, 65),
    sup(c.gus, -70, 20), sup(c.hana, -10, 80), app(c.hana, -50, 315),
    sup(c.kai, -40, 50), sup(c.lena, -35, 55), app(c.lena, -20, 345),
    sup(c.mo, -95, -5), // just overdue
    sup(c.omar, -60, 30, { carer_signed_at: ts(-59), carer_signed_name: "Omar Fakelate" }),
    sup(c.jade, -14, 14),
    sup(trainer, -30, 60), sup(manager, -30, 60),
  ]);
  // A booked appraisal for Erin (never had one, but one is in the diary).
  await ins("staff_audit_bookings", [
    { organisation_id: orgId, user_id: c.erin.id, kind: "appraisal", booked_on: d(9), booked_time: "10:00", with_user_id: manager.id, location: "Office" },
    { organisation_id: orgId, user_id: c.ben.id, kind: "supervision", booked_on: d(12), booked_time: "14:00", with_user_id: trainer.id },
  ]);

  // Spot checks and competency.
  await ins("spot_checks", [
    { organisation_id: orgId, user_id: c.carla.id, checked_on: d(-20), outcome: "met", client_id: clients[0].id, client_name: CLIENTS[0], next_due: d(70), assessor_id: trainer.id },
    { organisation_id: orgId, user_id: c.mo.id, checked_on: d(-120), outcome: "developing", client_id: clients[1].id, client_name: CLIENTS[1], next_due: d(-30), assessor_id: trainer.id },
    { organisation_id: orgId, user_id: c.amina.id, checked_on: d(-60), outcome: "met", client_id: clients[2].id, client_name: CLIENTS[2], next_due: d(30), assessor_id: trainer.id },
  ]);
  await ins("competency_checks", [
    { organisation_id: orgId, user_id: c.carla.id, area: "medication", outcome: "met", checked_on: d(-30), next_due: d(335), assessor_id: trainer.id },
    { organisation_id: orgId, user_id: c.mo.id, area: "medication", outcome: "not_met", checked_on: d(-10), next_due: d(20), assessor_id: trainer.id, notes: "QA seed: re-assess after training" },
    { organisation_id: orgId, user_id: c.amina.id, area: "moving_people", outcome: "developing", checked_on: d(-200), next_due: d(-15), assessor_id: trainer.id },
  ]);
  // Care Certificate observations for the new starter.
  await ins("care_cert_observations", [1, 2, 3].map((standard_no) => ({ organisation_id: orgId, user_id: c.jade.id, standard_no, status: standard_no < 3 ? "competent" : "pending", observed_at: standard_no < 3 ? d(-5) : null, assessor_id: trainer.id, assessor_kind: "org" })));

  // Service audits: one due soon, one overdue, one never done (training), client ones mixed.
  await ins("audits", [
    { organisation_id: orgId, kind: "infection_control", held_on: d(-60), next_due: d(30), items: [], score: 92, review_status: "not_needed", auditor_id: manager.id },
    { organisation_id: orgId, kind: "staff_file", held_on: d(-120), next_due: d(-30), items: [], score: 75, review_status: "waiting", review_below: 80, auditor_id: trainer.id },
    { organisation_id: orgId, kind: "medication", client_id: clients[0].id, client_name: CLIENTS[0], held_on: d(-25), next_due: d(5), items: [], score: 100, review_status: "not_needed", auditor_id: manager.id },
    { organisation_id: orgId, kind: "medication", client_id: clients[1].id, client_name: CLIENTS[1], held_on: d(-50), next_due: d(-20), items: [], score: 88, review_status: "not_needed", auditor_id: manager.id },
    { organisation_id: orgId, kind: "care_plan", client_id: clients[0].id, client_name: CLIENTS[0], held_on: d(-30), next_due: d(60), items: [], score: 95, review_status: "not_needed", auditor_id: manager.id },
  ]);
  await ins("client_qas", [
    { organisation_id: orgId, client_id: clients[0].id, client_name: CLIENTS[0], held_on: d(-15), method: "visit", with_whom: "client", completed: true, safe: 9, effective: 8, caring: 9, responsive: 8, well_led: 9, score: 86 },
    { organisation_id: orgId, client_id: clients[3].id, client_name: CLIENTS[3], held_on: d(-10), method: "phone", completed: false, not_done_reason: "No answer" },
  ]);

  // Holidays and sickness.
  await ins("leave_allowances", Object.values(c).map((u) => ({ organisation_id: orgId, user_id: u.id, year_start: `${new Date().getUTCFullYear()}-01-01`, amount: 28, unit: "days" })));
  await ins("leave_requests", [
    { organisation_id: orgId, user_id: c.lena.id, leave_type: "annual", start_date: d(1), end_date: d(3), amount: 3, status: "approved", decided_by: manager.id, decided_at: ts(-5), requested_by: c.lena.id },
    { organisation_id: orgId, user_id: c.carla.id, leave_type: "annual", start_date: d(20), end_date: d(27), amount: 6, status: "requested", requested_by: c.carla.id },
    { organisation_id: orgId, user_id: c.dev.id, leave_type: "unpaid", start_date: d(-30), end_date: d(-28), amount: 3, status: "declined", decided_by: manager.id, decided_at: ts(-35), decision_note: "Short notice", requested_by: c.dev.id },
    { organisation_id: orgId, user_id: c.amina.id, leave_type: "annual", start_date: d(-60), end_date: d(-56), amount: 5, status: "approved", decided_by: manager.id, decided_at: ts(-70), requested_by: c.amina.id },
  ]);
  await ins("sickness_absences", [
    { organisation_id: orgId, user_id: c.kai.id, start_date: d(-2), reason: "Cold, flu or COVID-19", certification: "self", rtw_status: "none" },
    { organisation_id: orgId, user_id: c.dev.id, start_date: d(-90), returned_on: d(-85), reason: "Back, neck or other muscle pain", certification: "fit_note", rtw_status: "held" },
  ]);

  // Probation: Jade's first review is overdue; Nia's is ahead.
  await ins("probation_reviews", [
    { organisation_id: orgId, user_id: c.jade.id, due_on: d(-30), status: "held", held_on: d(-28), held_by: manager.id, outcome: "on_track" },
    { organisation_id: orgId, user_id: c.jade.id, due_on: d(-5), status: "draft" },
    { organisation_id: orgId, user_id: c.nia.id, due_on: d(23), status: "draft" },
  ]);
  // A disciplinary case, a performance plan and a leaver.
  await ins("hr_cases", [{ organisation_id: orgId, ref: "DIS-2026-001", kind: "disciplinary", subtype: "conduct", user_id: c.mo.id, summary: "QA seed: late medication records", stage: "investigation", raised_via: "office", raised_on: d(-14), investigator_id: trainer.id }]);
  await ins("pips", [{ organisation_id: orgId, user_id: c.mo.id, kind: "pip", status: "open", concerns: [{ text: "Medication records not completed on the day" }], expectations: [{ text: "Every MAR chart completed before leaving the client" }], support: [{ text: "Medication refresher course" }], duration_weeks: 4, review_frequency: "weekly", start_date: d(-7), owner_id: manager.id, raised_from_type: "competency" }]);
  await ins("hr_leavers", [{ organisation_id: orgId, user_id: c.ivan.id, reason: "resigned", last_day: d(-10), re_employable: "yes", exit_status: "asked", dbs_referral: "not_needed" }]);

  // Complaints and safeguarding: one open complaint, an untriaged concern, a compliment.
  const complaint = await one("complaints", { organisation_id: orgId, reference: "COM-20261020-1", kind: "complaint", status: "open", description: "QA seed: carer arrived 40 minutes late on two visits and did not phone ahead.", raised_by_role: "family", raised_by_name: "Mary Fakedaughter", category: "missed_visit", reported_on: d(-12), occurred_on: d(-14), complete_by: d(16), client_id: clients[1].id, triaged_at: ts(-12), triaged_by: manager.id });
  await ins("complaint_people", [{ complaint_id: complaint.id, user_id: c.dev.id, involvement: "involved" }], "complaint_id");
  await one("complaints", { organisation_id: orgId, reference: "CON-20261030-1", kind: "concern", status: "open", description: "QA seed: a neighbour is worried about Mr Fakeclient being left alone in the evenings.", raised_by_role: "other", raised_via: "link", reported_on: d(-3), client_id: clients[7].id });
  await one("compliments", { organisation_id: orgId, received_on: d(-6), from_name: "The Fakeclient family", from_role: "family", client_id: clients[0].id, what_was_said: "QA seed: Carla is always on time and so kind to Mum." });

  // Policies: adopt and publish three; most staff have read two of them.
  const { data: policyDocs } = await admin.from("policy_documents").select("id, blocks, version").eq("status", "published").eq("kind", "policy").order("sort_order").limit(3);
  const copies = await ins("organisation_policies", (policyDocs ?? []).map((p, i) => ({
    organisation_id: orgId, policy_id: p.id, blocks: p.blocks, status: i < 3 ? "published" : "draft", version: 1, template_version: p.version ?? 1, published_at: ts(-20), published_by: manager.id, audience: "everyone", accept_within_days: 14, review_months: 12, review_due_on: d(345),
  })), "id, policy_id");
  const acks = [];
  for (const u of [...Object.values(c).filter((x) => x !== c.ben && x !== c.nia && x !== c.ivan), manager, trainer]) {
    for (const copy of copies.slice(0, 2)) acks.push({ organisation_id: orgId, user_id: u.id, policy_id: copy.policy_id, organisation_policy_id: copy.id, version: 1, acknowledged_at: ts(-15) });
  }
  await ins("policy_acknowledgements", acks);

  // Forms: two library forms assigned; one completed, one overdue.
  const { data: tmpl } = await admin.from("form_templates").select("id, version").is("organisation_id", null).eq("status", "published").eq("audience", "carer").order("sort_order").limit(2);
  if (tmpl?.length >= 2) {
    const a1 = await one("form_assignments", { organisation_id: orgId, template_id: tmpl[0].id, user_id: c.amina.id, assigned_by: manager.id, due_date: d(-7), note: "QA seed: overdue form" });
    const a2 = await one("form_assignments", { organisation_id: orgId, template_id: tmpl[1].id, user_id: c.carla.id, assigned_by: manager.id, due_date: d(-20), completed_at: ts(-22) });
    await ins("form_responses", [{ organisation_id: orgId, template_id: tmpl[1].id, template_version: tmpl[1].version, user_id: c.carla.id, subject: "carer", assignment_id: a2.id, answers: {}, signed_name: "Carla Fakecompliant", submitted_at: ts(-22) }]);
    void a1;
  }

  // Recruitment: three candidates, one with their own login.
  const candidate = await createLogin({ email: "qa-candidate@example.com", role: "candidate", organisationId: null, fullName: "Quentin Fakecandidate" });
  remember("QA_CANDIDATE", candidate);
  await ins("candidates", [
    { organisation_id: orgId, full_name: "Quentin Fakecandidate", email: candidate.email, phone: "07700 900001", role_applied: "Care worker", source: "Website", entry_date: d(-9), user_id: candidate.id },
    { organisation_id: orgId, full_name: "Rosa Fakeapplicant", email: "rosa@example.com", role_applied: "Care worker", source: "Indeed", entry_date: d(-20), is_driver: true },
    { organisation_id: orgId, full_name: "Sam Fakerejected", email: "sam@example.com", role_applied: "Senior care worker", source: "Referral", entry_date: d(-40), status: "rejected", rejected_at: ts(-30) },
  ]);

  // A client feedback survey with two answers.
  const survey = await one("feedback_surveys", { organisation_id: orgId, kind: "client", token: "qa-client-survey-" + randomBytes(12).toString("hex"), title: "QA seed: how are we doing?", named: true, sent_to_count: 10 });
  await ins("feedback_responses", [
    { survey_id: survey.id, organisation_id: orgId, answers: { overall: 5, safe: 5, kind: 4 }, client_id: clients[0].id, respondent_name: "Agnes" },
    { survey_id: survey.id, organisation_id: orgId, answers: { overall: 3, safe: 4, kind: 3 }, client_id: clients[2].id },
  ]);

  return { orgId, manager, trainer, carers: c, clients };
}

async function emptyCare() {
  // A brand-new company on its free trial: five days left, nothing in it.
  const end = new Date(Date.now() + 5 * DAY);
  end.setUTCHours(23, 59, 59, 999);
  const orgId = await org("QA Empty Care Ltd", { package_tier: "full", trial_ends_at: end.toISOString(), size_band: null, service_type: null });
  env.QA_EMPTY_ORG_ID = orgId;
  const manager = await createLogin({ email: "qa-manager@qa-empty-care.example.com", role: "org_admin", organisationId: orgId, fullName: "Eve Emptymanager" });
  remember("QA_EMPTY_MANAGER", manager);
  return orgId;
}

async function otherCare(courses) {
  const orgId = await org("QA Other Care Ltd", { package_tier: "core_forms", service_type: "care_home" });
  env.QA_OTHER_ORG_ID = orgId;
  const manager = await createLogin({ email: "qa-manager@qa-other-care.example.com", role: "org_admin", organisationId: orgId, fullName: "Olga Othermanager", lastSeen: -1 });
  remember("QA_OTHER_MANAGER", manager);
  const staff = [];
  for (const [email, fullName] of [["una@qa-other-care.example.com", "Una Otherstaff"], ["vic@qa-other-care.example.com", "Vic Otherstaff"], ["wen@qa-other-care.example.com", "Wen Otherstaff"]]) {
    staff.push(await createLogin({ email, role: "learner", organisationId: orgId, fullName, lastSeen: -2 }));
  }
  const clients = await ins("clients", [{ organisation_id: orgId, full_name: "Xavier Otherclient" }, { organisation_id: orgId, full_name: "Yara Otherclient", medication_support: true }]);
  await ins("enrolments", [
    { organisation_id: orgId, user_id: staff[0].id, course_id: courses[0].id, status: "completed", progress: 100, due_date: d(-40), completion_count: 1 },
    { organisation_id: orgId, user_id: staff[1].id, course_id: courses[0].id, status: "not_started", progress: 0, due_date: d(-5), completion_count: 0 },
    { organisation_id: orgId, user_id: staff[2].id, course_id: courses[1].id, status: "in_progress", progress: 30, due_date: d(15), completion_count: 0 },
  ]);
  await ins("certificates", [{ certificate_number: "MCA-QA-OTHER-0001", organisation_id: orgId, user_id: staff[0].id, course_id: courses[0].id, issued_at: ts(-35), expires_at: ts(330) }]);
  await ins("supervisions", [{ organisation_id: orgId, user_id: staff[0].id, supervisor_id: manager.id, kind: "supervision", held_on: d(-20), next_due: d(70), summary: "QA Other: 1:1" }]);
  await ins("staff_employment", [...staff, manager].map((u) => ({ user_id: u.id, organisation_id: orgId, start_date: d(-300), job_title: "Care assistant", probation_status: "passed" })), "user_id");
  await one("complaints", { organisation_id: orgId, reference: "COM-20261025-1", kind: "complaint", status: "open", description: "QA Other: a complaint that QA Test Care must never see.", raised_by_role: "client", reported_on: d(-8), client_id: clients[0].id, triaged_at: ts(-8), triaged_by: manager.id });
  return { orgId, manager, staff, clients };
}

async function portalCare() {
  const orgId = await org("QA Portal Care Ltd", {
    package_tier: "full",
    custom_domain: "qa-portal.localhost",
    custom_domain_status: "live",
    custom_domain_dns_ok: true,
    custom_domain_requested_at: ts(-10),
    custom_domain_live_at: ts(-9),
    brand_colour: "#1d4ed8",
    email_sender_name: "QA Portal Care training",
  });
  env.QA_PORTAL_ORG_ID = orgId;
  env.QA_PORTAL_DOMAIN = "qa-portal.localhost";
  const manager = await createLogin({ email: "qa-manager@qa-portal-care.example.com", role: "org_admin", organisationId: orgId, fullName: "Pat Portalmanager", lastSeen: -1 });
  remember("QA_PORTAL_MANAGER", manager);
  const staff = await createLogin({ email: "zed@qa-portal-care.example.com", role: "learner", organisationId: orgId, fullName: "Zed Portalstaff", lastSeen: -1 });
  env.QA_PORTAL_STAFF_EMAIL = staff.email;
  env.QA_PORTAL_STAFF_PASSWORD = staff.password;
  // A rostering-portal key (lib/integration-keys.ts: raw "mca_…", stored as sha256).
  const raw = "mca_" + randomBytes(32).toString("base64url");
  await one("integration_keys", { organisation_id: orgId, system: "myroster", label: "QA MyRoster", key_hash: createHash("sha256").update(raw).digest("hex"), hint: raw.slice(-4), created_by: manager.id });
  env.QA_PORTAL_API_KEY = raw;
  return orgId;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`Seeding QA data on ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log("Removing the previous QA data…");
  await reset();
  console.log("Shared library…");
  await library();
  const { data: courses, error } = await admin.from("courses").select("id, slug, title").is("retired_at", null).order("sort_order").limit(12);
  if (error || !courses?.length) throw new Error("No courses to assign: " + (error?.message ?? "catalogue empty"));

  console.log("Companies…");
  const platform = await createLogin({ email: "qa-platform-admin@example.com", role: "platform_admin", organisationId: null, fullName: "Pam Platformadmin", lastSeen: -1 });
  remember("QA_PLATFORM_ADMIN", platform);
  await testCare(courses);
  await emptyCare();
  await otherCare(courses);
  await portalCare();

  writeEnvFile(env);
  console.log(`\nDone. ${Object.keys(env).filter((k) => k.endsWith("_EMAIL")).length} logins written to .env.test (passwords are in that file only).`);
}

main().catch((e) => {
  console.error("\nSeed failed:", e.message);
  process.exit(1);
});
