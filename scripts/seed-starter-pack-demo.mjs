// Demo data for the "Starter Pack" organisation, to show what the Starter
// package offers: online training only (the HR pack starts at Growth). Ten
// carers with a spread of records — fully up to date, certificates due for
// renewal, some expired, some part-way through, some overdue, two brand-new
// starters — for the training matrix, certificates and reminders.
//
//   node scripts/seed-starter-pack-demo.mjs
//
// Every carer is on @starter-pack.test (no real inbox). Re-running is safe: it
// clears these carers' enrolments, quiz attempts and certificates (rows and
// PDFs) and lays them down again from today's date, so the picture stays fresh.
// It never touches anyone outside @starter-pack.test.
//
// Carers can log in with SEED_PASSWORD, or StarterDemo!2026 by default.

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { createJiti } from "jiti";

// jiti compiles JSX to React.createElement, so React has to be in scope.
globalThis.React = (await import("react")).default;
const jiti = createJiti(import.meta.url, { jsx: true });
const { generateCertificatePdf } = await jiti.import("../lib/certificate.tsx");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const PASSWORD = process.env.SEED_PASSWORD || "StarterDemo!2026";
const ORG_NAME = "Starter Pack";
const DOMAIN = "starter-pack.test";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The core set every carer is given, in the order a new starter does them.
const COURSES = [
  "introduction-to-care",
  "safeguarding-adults-level-2",
  "health-and-safety",
  "fire-safety",
  "infection-prevention-and-control",
  "moving-and-handling",
  "person-centred-care",
  "medication-awareness",
  "basic-life-support-bls",
  "mental-capacity-act-and-dols",
  "food-hygiene-and-nutrition",
  "information-governance-and-gdpr",
];

// Each course is one of:
//   done:N      completed N days ago (certificate issued then)
//   expired:N   completed N days ago, certificate now past its expiry
//   going:P     in progress, P% through
//   todo        not started
// `due` is days from today for anything not completed (negative = overdue).
const CARERS = [
  {
    name: "Amira Hussain", joinedDays: 400, seenDays: 1, due: 30,
    plan: ["done:330", "done:300", "done:290", "done:280", "done:270", "done:250", "done:240", "done:200", "done:150", "done:120", "done:90", "done:60"],
  },
  {
    // Up to date, but three certificates run out within the month.
    name: "Daniel Brooks", joinedDays: 380, seenDays: 3, due: 30,
    plan: ["done:350", "done:345", "done:340", "done:200", "done:190", "done:180", "done:170", "done:160", "done:150", "done:140", "done:120", "done:100"],
  },
  {
    // One certificate has run out; the rest are fine.
    name: "Grace Okafor", joinedDays: 520, seenDays: 6, due: 14,
    plan: ["done:180", "done:175", "expired:395", "done:170", "done:165", "done:160", "done:150", "done:140", "done:130", "done:120", "done:110", "done:100"],
  },
  {
    name: "Tomasz Nowak", joinedDays: 240, seenDays: 0, due: 21,
    plan: ["done:230", "done:225", "done:220", "done:215", "done:210", "done:205", "done:150", "done:90", "going:60", "going:25", "todo", "todo"],
  },
  {
    // Fallen behind: several overdue and not started.
    name: "Chloe Bennett", joinedDays: 200, seenDays: 34, due: -12,
    plan: ["done:190", "done:188", "done:185", "done:180", "going:40", "todo", "todo", "todo", "todo", "todo", "todo", "todo"],
  },
  {
    // Started two weeks ago, working through induction.
    name: "Priya Sharma", joinedDays: 14, seenDays: 0, due: 16,
    plan: ["done:12", "done:10", "done:8", "done:5", "going:70", "going:15", "todo", "todo", "todo", "todo", "todo", "todo"],
  },
  {
    // Joined yesterday — nothing started yet.
    name: "Liam O'Connor", joinedDays: 1, seenDays: null, due: 29,
    plan: Array(12).fill("todo"),
  },
  {
    // Invited three weeks ago, never logged in: everything overdue.
    name: "Fatima Begum", joinedDays: 21, seenDays: null, due: -7,
    plan: Array(12).fill("todo"),
  },
  {
    name: "James Whitfield", joinedDays: 610, seenDays: 2, due: 10,
    plan: ["done:300", "done:280", "done:260", "done:240", "done:220", "done:200", "done:180", "done:160", "done:140", "done:120", "done:80", "going:85"],
  },
  {
    // Two expired and one due for renewal soon.
    name: "Sophie Clarke", joinedDays: 700, seenDays: 9, due: 7,
    plan: ["done:210", "expired:380", "done:200", "expired:372", "done:190", "done:350", "done:180", "done:170", "done:160", "done:150", "done:140", "going:30"],
  },
];

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * DAY);
const dateOnly = (d) => d.toISOString().slice(0, 10);
// A stable "random" per carer and course, so re-runs look the same.
const pick = (seed, lo, hi) => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lo + (h % (hi - lo + 1));
};
const emailFor = (name) =>
  `${name.toLowerCase().replace(/[^a-z ]/g, "").trim().replace(/\s+/g, ".")}@${DOMAIN}`;

async function findUserByEmail(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
}

async function ensureCarer(orgId, carer) {
  const email = emailFor(carer.name);
  const user_metadata = { role: "learner", organisation_id: orgId, full_name: carer.name };
  let user = await findUserByEmail(email);
  if (user) {
    await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, user_metadata });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true, user_metadata,
    });
    if (error) throw error;
    user = data.user;
  }
  const { error } = await admin.from("users").upsert({
    id: user.id,
    email,
    role: "learner",
    organisation_id: orgId,
    full_name: carer.name,
    status: "active",
    created_at: daysAgo(carer.joinedDays).toISOString(),
    last_seen_at: carer.seenDays == null ? null : daysAgo(carer.seenDays).toISOString(),
  });
  if (error) throw error;
  return { id: user.id, email };
}

async function clearTraining(userId) {
  const { data: certs } = await admin.from("certificates").select("pdf_path").eq("user_id", userId);
  const paths = (certs ?? []).map((c) => c.pdf_path).filter(Boolean);
  if (paths.length) await admin.storage.from("certificates").remove(paths);
  for (const table of ["certificates", "quiz_attempts", "enrolments"]) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
}

async function issueCertificate({ orgId, userId, name, course, issuedAt }) {
  const expiresAt = course.expiry_months ? new Date(issuedAt) : null;
  if (expiresAt) expiresAt.setMonth(expiresAt.getMonth() + course.expiry_months);
  const id = crypto.randomUUID();
  const number = `MCA-${issuedAt.getFullYear()}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const pdf = await generateCertificatePdf({
    orgLogoUrl: null,
    orgName: null,
    learnerName: name,
    courseTitle: course.title,
    certificateNumber: number,
    issuedAt,
    expiresAt,
    note: course.certificate_note ?? null,
  });
  const path = `${userId}/${id}.pdf`;
  const { error: upErr } = await admin.storage
    .from("certificates")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw upErr;
  const { error } = await admin.from("certificates").insert({
    id,
    certificate_number: number,
    organisation_id: orgId,
    user_id: userId,
    course_id: course.id,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt ? expiresAt.toISOString() : null,
    pdf_path: path,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------

const { data: org, error: orgErr } = await admin
  .from("organisations")
  .select("id")
  .eq("name", ORG_NAME)
  .single();
if (orgErr || !org) throw new Error(`No organisation called "${ORG_NAME}".`);

const { data: courseRows, error: cErr } = await admin
  .from("courses")
  .select("id, slug, title, expiry_months, certificate_note, estimated_minutes, content_blocks")
  .in("slug", COURSES);
if (cErr) throw cErr;
const courses = COURSES.map((slug) => {
  const c = courseRows.find((r) => r.slug === slug);
  if (!c) throw new Error(`Course ${slug} not found.`);
  return c;
});

const { data: questionRows } = await admin
  .from("quiz_questions")
  .select("id, course_id")
  .in("course_id", courses.map((c) => c.id));
const questionsFor = (courseId) =>
  (questionRows ?? []).filter((q) => q.course_id === courseId).map((q) => q.id).slice(0, 20);

for (const carer of CARERS) {
  if (carer.plan.length !== COURSES.length) throw new Error(`${carer.name}: plan length`);
  const { id: userId, email } = await ensureCarer(org.id, carer);
  await clearTraining(userId);

  const assignedAt = daysAgo(Math.max(carer.joinedDays - 1, 0));
  const summary = { done: 0, expired: 0, going: 0, todo: 0 };

  for (const [i, course] of courses.entries()) {
    const [kind, arg] = carer.plan[i].split(":");
    summary[kind]++;
    const blocks = Array.isArray(course.content_blocks) ? course.content_blocks.length : 10;
    const minutes = course.estimated_minutes ?? 20;
    const seed = `${carer.name}/${course.slug}`;

    const enrolment = {
      organisation_id: org.id,
      user_id: userId,
      course_id: course.id,
      assigned_at: assignedAt.toISOString(),
      due_date: dateOnly(new Date(now.getTime() + carer.due * DAY)),
      status: "not_started",
      progress: 0,
      time_spent: 0,
      current_block: 0,
      completion_count: 0,
      attempt_count: 0,
    };

    if (kind === "done" || kind === "expired") {
      const finished = daysAgo(Number(arg));
      finished.setHours(pick(seed, 9, 17), pick(seed + "m", 0, 59));
      const started = new Date(finished.getTime() - pick(seed, 14, 30) * 60 * 1000);
      Object.assign(enrolment, {
        status: kind === "expired" ? "expired" : "completed",
        progress: 100,
        time_spent: minutes * 60 + pick(seed, -300, 600),
        current_block: Math.max(blocks - 1, 0),
        completion_count: 1,
        attempt_count: 1,
        // Assigned before it was done, whenever that was.
        assigned_at: new Date(Math.min(assignedAt.getTime(), finished.getTime() - 3 * DAY)).toISOString(),
        due_date: dateOnly(new Date(finished.getTime() + 7 * DAY)),
        updated_at: finished.toISOString(),
      });
      const { error: qErr } = await admin.from("quiz_attempts").insert({
        organisation_id: org.id,
        user_id: userId,
        course_id: course.id,
        question_ids: questionsFor(course.id),
        answers: {},
        score: [80, 85, 90, 95, 100][pick(seed, 0, 4)],
        passed: true,
        started_at: started.toISOString(),
        submitted_at: finished.toISOString(),
      });
      if (qErr) throw qErr;
      await issueCertificate({ orgId: org.id, userId, name: carer.name, course, issuedAt: finished });
    } else if (kind === "going") {
      const pct = Number(arg);
      Object.assign(enrolment, {
        status: "in_progress",
        progress: pct,
        current_block: Math.floor((blocks * pct) / 100),
        time_spent: Math.round((minutes * 60 * pct) / 100),
        updated_at: daysAgo(carer.seenDays ?? 1).toISOString(),
      });
    }

    const { error } = await admin.from("enrolments").insert(enrolment);
    if (error) throw error;
  }

  console.log(
    `  ${carer.name.padEnd(17)} ${email.padEnd(34)} done ${summary.done}, expired ${summary.expired}, in progress ${summary.going}, not started ${summary.todo}`,
  );
}

console.log(`\nStarter Pack: ${CARERS.length} carers seeded. Password for all: ${PASSWORD}\n`);
