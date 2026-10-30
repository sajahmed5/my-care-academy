import { isStaff } from "@/lib/roles";
import { emailLayout } from "./email-layout";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailBatch } from "@/lib/email";
import { siteOrigin } from "@/lib/site-url";
import { fetchAll } from "@/lib/fetch-all";
import {
  renewalStage,
  isExpired,
  isOverdue,
  needsReminder,
  engagementRate,
} from "@/lib/engine-logic";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { resolveForms, type FormOverride } from "@/lib/audit-forms";
import { staffAuditDigest, staffAuditDigestHtml } from "@/lib/staff-audit-digest";
import { hrDigestHtml, loadHrDigests } from "@/lib/hr-digest";
import { policyDigest, policyDigestHtml, policyReminderEmail, type PolicyDigest } from "@/lib/policy-digest";
import { loadReadingForOrgs } from "@/lib/policy-reading-data";
import { planPolicyReminders } from "@/lib/policy-reading";
import { ukToday } from "@/lib/policy-library";
import {
  chunk,
  esc,
  planReminders,
  reminderEmail,
  renewalLearnerEmail,
  renewalOrgEmail,
  type ReminderItem,
  type RenewalNotice,
} from "@/lib/engine-digest";

type Admin = ReturnType<typeof createAdminClient>;

export interface EngineSettings {
  engagementThreshold: number;
  renewalWindows: number[];
  reminderRepeatDays: number;
}

/** One enrolment, with every column any of the jobs reads. */
export interface EngineEnrolment {
  id: string;
  user_id: string;
  course_id: string;
  organisation_id: string;
  status: string;
  due_date: string | null;
  last_reminder_at: string | null;
}

export interface EngineRefs {
  users: Map<string, { email: string; name: string; org: string | null; role: string; status: string }>;
  courses: Map<string, string>;
  orgs: Map<string, string>;
  /**
   * Every enrolment, read once per run. Renewals, reminders and engagement
   * each used to page through the whole table themselves — three full reads
   * of the platform's largest working table every morning. Renewals updates
   * this copy as it expires enrolments, so the jobs after it see what a fresh
   * read would have shown them.
   */
  enrolments: EngineEnrolment[];
}

export interface RunSummary {
  [key: string]: number;
}

/**
 * Ids per `.in()` filter or bulk update. The ids travel in the request URL,
 * which fails outright somewhere past ~390 of them (measured against the live
 * API); 100 keeps well clear.
 */
const IDS_PER_REQUEST = 100;

// ---------------------------------------------------------------- reading

export async function loadSettings(admin: Admin): Promise<EngineSettings> {
  const { data } = await admin.from("app_settings").select("key, value");
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    engagementThreshold: Number(map.get("engagement_threshold_pct") ?? 50),
    renewalWindows: (map.get("renewal_windows_days") as number[]) ?? [60, 30, 7],
    reminderRepeatDays: Number(map.get("reminder_repeat_days") ?? 7),
  };
}

/**
 * Every user, course, organisation and enrolment — shared by all the jobs in
 * one run. Each job used to load its own copy, so a daily run read the full
 * user list three times over. The cron routes load it once and pass it in.
 */
export async function loadEngineRefs(admin: Admin): Promise<EngineRefs> {
  const [users, courses, orgs, enrolments] = await Promise.all([
    fetchAll((f, t) =>
      admin
        .from("users")
        .select("id, email, full_name, organisation_id, role, status")
        .order("id")
        .range(f, t),
    ),
    fetchAll((f, t) => admin.from("courses").select("id, title").order("id").range(f, t)),
    fetchAll((f, t) => admin.from("organisations").select("id, name").order("id").range(f, t)),
    fetchAll<EngineEnrolment>((f, t) =>
      admin
        .from("enrolments")
        .select("id, user_id, course_id, organisation_id, status, due_date, last_reminder_at")
        .order("id")
        .range(f, t),
    ),
  ]);
  return {
    users: new Map(
      users.map((u) => [
        u.id as string,
        {
          email: u.email as string,
          name: (u.full_name as string) || (u.email as string),
          org: u.organisation_id as string | null,
          role: u.role as string,
          status: (u.status as string) ?? "active",
        },
      ]),
    ),
    courses: new Map(courses.map((c) => [c.id as string, c.title as string])),
    orgs: new Map(orgs.map((o) => [o.id as string, o.name as string])),
    enrolments,
  };
}

// Every member of staff, office staff and managers included (29 Oct 2026).
const isActiveLearner = (u: { role: string; status: string } | undefined) =>
  !!u && isStaff(u.role) && u.status === "active";

function orgAdminEmails(refs: EngineRefs, orgId: string | null): string[] {
  if (!orgId) return [];
  return [...refs.users.values()]
    .filter((u) => u.org === orgId && u.role === "org_admin" && u.status === "active")
    .map((u) => u.email);
}

function platformAdminEmails(refs: EngineRefs): string[] {
  return [...refs.users.values()]
    .filter((u) => u.role === "platform_admin")
    .map((u) => u.email);
}

function wrap(title: string, body: string): string {
  return emailLayout({ heading: title, body });
}

// ---------------------------------------------------------------- sending

interface Outgoing {
  orgId: string | null;
  to: string;
  type: string;
  subject: string;
  html: string;
}

/**
 * Send everything a job queued, then log it — in bulk.
 *
 * Replaces sending each email the moment it was decided on, which meant two
 * network round trips per message, one after another, inside a 60-second
 * limit. Returns how many were queued; a dry run counts without sending or
 * logging anything.
 */
async function flush(admin: Admin, outbox: Outgoing[], dryRun: boolean): Promise<number> {
  if (dryRun || outbox.length === 0) return outbox.length;
  await sendAndLog(admin, outbox);
  return outbox.length;
}

/** Send and log a job's outbox; one delivered/failed flag per message, in order. */
async function sendAndLog(admin: Admin, outbox: Outgoing[]): Promise<boolean[]> {
  if (outbox.length === 0) return [];
  // In the company's own name and dress, with white label — except the
  // alerts that go to us about a company.
  const sent = await sendEmailBatch(
    outbox.map(({ orgId, to, type, subject, html }) => ({
      to,
      subject,
      html,
      organisationId: type === "engagement_alert" ? null : orgId,
    })),
  );
  for (const rows of chunk(
    outbox.map((m, i) => ({
      organisation_id: m.orgId,
      to_email: m.to,
      type: m.type,
      subject: m.subject,
      sent: sent[i] ?? false,
    })),
    500,
  )) {
    await admin.from("email_log").insert(rows);
  }
  return outbox.map((_, i) => sent[i] ?? false);
}

/** Set the same columns on many rows, a URL-safe number of ids at a time. */
async function updateMany(
  admin: Admin,
  table: string,
  ids: string[],
  values: Record<string, unknown>,
): Promise<void> {
  for (const part of chunk(ids, IDS_PER_REQUEST)) {
    await admin.from(table).update(values).in("id", part);
  }
}

// ---------------------------------------------------------------- jobs

/**
 * Renewals: expire lapsed certificates (the course becomes required again) and
 * warn at the 60/30/7-day windows. The newest certificate per learner + course
 * is the live one.
 *
 * Emails are consolidated: each learner gets one message covering all of their
 * certificates that need attention, and each manager one summary for their
 * whole organisation. Previously every certificate produced its own email to
 * the learner AND to every admin — a manager would get one per carer the week
 * a batch of certificates lapsed together.
 */
export async function processRenewals(
  settings: EngineSettings,
  now: Date,
  dryRun: boolean,
  refs?: EngineRefs,
): Promise<RunSummary> {
  const admin = createAdminClient();
  const r = refs ?? (await loadEngineRefs(admin));
  const origin = await siteOrigin();

  // Still every certificate ever issued: the newest per learner + course is
  // the live one, and telling which is newest needs the renewed ones too. A
  // database function that returns only the live, expiring ones would bound
  // this (see the performance notes, 24 Oct 2026); until then the columns are
  // kept to what the decision needs.
  const certs = await fetchAll((f, t) =>
    admin
      .from("certificates")
      .select("id, user_id, course_id, organisation_id, issued_at, expires_at, reminders_sent")
      .order("id")
      .range(f, t),
  );
  const enrolments = r.enrolments;

  type Cert = (typeof certs)[number];
  const latest = new Map<string, Cert>();
  for (const c of certs) {
    const key = `${c.user_id}_${c.course_id}`;
    const prev = latest.get(key);
    if (!prev || (c.issued_at as string) > (prev.issued_at as string)) latest.set(key, c);
  }
  const enrolByPair = new Map(enrolments.map((e) => [`${e.user_id}_${e.course_id}`, e]));

  const toExpire: string[] = [];
  const stageUpdates = new Map<string, string[]>(); // cert id -> new reminders_sent
  const byLearner = new Map<string, RenewalNotice[]>();
  const byOrg = new Map<string, RenewalNotice[]>();

  const note = (cert: Cert, notice: RenewalNotice) => {
    const learner = r.users.get(cert.user_id as string);
    // A leaver's lapsed certificate is history, not a job — and an admin
    // cannot retake a course. Their records still update; nobody is emailed.
    if (!isActiveLearner(learner)) return;
    const uid = cert.user_id as string;
    byLearner.set(uid, [...(byLearner.get(uid) ?? []), notice]);
    const oid = cert.organisation_id as string;
    byOrg.set(oid, [...(byOrg.get(oid) ?? []), notice]);
  };

  for (const cert of latest.values()) {
    const expiresAt = cert.expires_at ? new Date(cert.expires_at as string) : null;
    const learner = r.users.get(cert.user_id as string);
    const base = {
      learnerName: learner?.name ?? "A learner",
      courseTitle: r.courses.get(cert.course_id as string) ?? "a course",
    };

    if (isExpired(expiresAt, now)) {
      const enrolment = enrolByPair.get(`${cert.user_id}_${cert.course_id}`);
      if (enrolment && enrolment.status !== "expired") {
        toExpire.push(enrolment.id as string);
        note(cert, { ...base, kind: "expired", expiresAt: cert.expires_at as string });
      }
      continue;
    }

    if (!expiresAt) continue;
    const stage = renewalStage(expiresAt, now, settings.renewalWindows);
    const sentStages = (cert.reminders_sent as string[]) ?? [];
    if (stage && !sentStages.includes(String(stage))) {
      stageUpdates.set(cert.id as string, [...sentStages, String(stage)]);
      note(cert, { ...base, kind: "due", expiresAt: cert.expires_at as string, withinDays: stage });
    }
  }

  const outbox: Outgoing[] = [];
  for (const [uid, notices] of byLearner) {
    const learner = r.users.get(uid)!;
    const { subject, html } = renewalLearnerEmail(learner.name, notices, origin);
    const expired = notices.some((n) => n.kind === "expired");
    outbox.push({ orgId: learner.org, to: learner.email, type: expired ? "required_again" : "renewal", subject, html });
  }
  for (const [oid, notices] of byOrg) {
    const { subject, html } = renewalOrgEmail(r.orgs.get(oid) ?? "your organisation", notices, origin);
    for (const to of orgAdminEmails(r, oid)) {
      outbox.push({ orgId: oid, to, type: "renewal", subject, html });
    }
  }

  if (!dryRun) {
    await updateMany(admin, "enrolments", toExpire, { status: "expired" });
    // The shared copy follows the database, so reminders and engagement later
    // in this run see these courses as required again — as a re-read would.
    const expired = new Set(toExpire);
    for (const e of enrolments) if (expired.has(e.id)) e.status = "expired";
    // Certificates that reached the same window share an update.
    const byValue = new Map<string, string[]>();
    for (const [id, stages] of stageUpdates) {
      const k = JSON.stringify(stages);
      byValue.set(k, [...(byValue.get(k) ?? []), id]);
    }
    for (const [k, ids] of byValue) {
      await updateMany(admin, "certificates", ids, { reminders_sent: JSON.parse(k) });
    }
  }
  const emails = await flush(admin, outbox, dryRun);

  return {
    certificatesExpired: toExpire.length,
    renewalRemindersSent: stageUpdates.size,
    renewalEmailsSent: emails,
  };
}

/**
 * Learner reminders for every course assigned and not yet completed — repeated
 * every reminderRepeatDays until it is done.
 *
 * One email per learner listing all their outstanding courses, instead of one
 * per course (see lib/engine-digest). Learners only: an admin cannot open
 * /learn, so reminding one about a course is noise at best (issue #37).
 */
export async function processReminders(
  settings: EngineSettings,
  now: Date,
  dryRun: boolean,
  refs?: EngineRefs,
): Promise<RunSummary> {
  const admin = createAdminClient();
  const r = refs ?? (await loadEngineRefs(admin));
  const origin = await siteOrigin();

  const items: ReminderItem[] = [];
  for (const e of r.enrolments) {
    const overdue = isOverdue(e.due_date as string | null, e.status as string, now);
    if (!needsReminder(e.status as string)) continue;
    const learner = r.users.get(e.user_id as string);
    if (!isActiveLearner(learner) || !learner?.email) continue;
    items.push({
      enrolmentId: e.id as string,
      userId: e.user_id as string,
      courseTitle: r.courses.get(e.course_id as string) ?? "a course",
      dueDate: e.due_date as string | null,
      overdue,
      lastReminderAt: e.last_reminder_at as string | null,
    });
  }

  const plans = planReminders(items, settings.reminderRepeatDays, now);
  const outbox: Outgoing[] = plans.map((p) => {
    const learner = r.users.get(p.userId)!;
    const { subject, html } = reminderEmail(learner.name, p.items, origin);
    return { orgId: learner.org, to: learner.email, type: "reminder", subject, html };
  });

  if (!dryRun) {
    await updateMany(
      admin,
      "enrolments",
      plans.flatMap((p) => p.enrolmentIds),
      { last_reminder_at: now.toISOString() },
    );
  }
  const emails = await flush(admin, outbox, dryRun);

  return {
    learnerRemindersSent: emails,
    coursesCoveredByReminders: plans.reduce((n, p) => n + p.items.length, 0),
  };
}

/** Alert platform_admins when an org's completion rate drops below threshold. */
export async function processEngagement(
  settings: EngineSettings,
  now: Date,
  dryRun: boolean,
  refs?: EngineRefs,
): Promise<RunSummary> {
  const admin = createAdminClient();
  const r = refs ?? (await loadEngineRefs(admin));

  const byOrg = new Map<string, { total: number; completed: number }>();
  for (const e of r.enrolments) {
    const s = byOrg.get(e.organisation_id as string) ?? { total: 0, completed: 0 };
    s.total += 1;
    if (e.status === "completed") s.completed += 1;
    byOrg.set(e.organisation_id as string, s);
  }

  // Dedup: skip any organisation alerted about in the last 7 days. One read
  // of the week's alerts, rather than a count query per low organisation
  // made one after another.
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const recent = await fetchAll((f, t) =>
    admin
      .from("email_log")
      .select("id, organisation_id")
      .eq("type", "engagement_alert")
      .gte("created_at", weekAgo)
      .order("id")
      .range(f, t),
  );
  const alertedThisWeek = new Set(recent.map((e) => e.organisation_id as string));

  const recipients = platformAdminEmails(r);
  const outbox: Outgoing[] = [];
  let alerts = 0;
  for (const [orgId, s] of byOrg) {
    if (s.total < 3) continue; // ignore tiny samples
    const rate = engagementRate(s.total, s.completed);
    if (rate >= settings.engagementThreshold) continue;
    if (alertedThisWeek.has(orgId)) continue;

    const orgName = r.orgs.get(orgId) ?? "An organisation";
    alerts += 1;
    for (const to of recipients) {
      outbox.push({
        orgId,
        to,
        type: "engagement_alert",
        subject: `Low engagement: ${orgName} (${rate}%)`,
        html: wrap(
          "Engagement alert",
          `<p><strong>${esc(orgName)}</strong> has a completion rate of ${rate}% (threshold ${settings.engagementThreshold}%). Consider reaching out.</p>`,
        ),
      });
    }
  }
  await flush(admin, outbox, dryRun);

  return { engagementAlertsSent: alerts };
}

/** Weekly digest to each org_admin: completions this week, overdue, not started. */
export async function processWeeklyDigest(
  now: Date,
  dryRun: boolean,
  refs?: EngineRefs,
): Promise<RunSummary> {
  const admin = createAdminClient();
  const r = refs ?? (await loadEngineRefs(admin));
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const enrolments = r.enrolments;
  // Only this week's certificates — the digest counts nothing older. It used
  // to read every certificate ever issued and discard all but a week of them.
  const certs = await fetchAll((f, t) =>
    admin
      .from("certificates")
      .select("id, organisation_id, issued_at")
      .gte("issued_at", weekAgo.toISOString())
      .order("id")
      .range(f, t),
  );

  // Grouped once, rather than re-scanning every row for every organisation.
  const stats = new Map<string, { overdue: number; notStarted: number; any: boolean; completions: number }>();
  const get = (oid: string) => {
    const s = stats.get(oid) ?? { overdue: 0, notStarted: 0, any: false, completions: 0 };
    stats.set(oid, s);
    return s;
  };
  for (const e of enrolments) {
    const s = get(e.organisation_id as string);
    s.any = true;
    if (isOverdue(e.due_date as string | null, e.status as string, now)) s.overdue += 1;
    if (e.status === "not_started") s.notStarted += 1;
  }
  for (const c of certs) {
    if (new Date(c.issued_at as string) >= weekAgo) get(c.organisation_id as string).completions += 1;
  }

  const outbox: Outgoing[] = [];
  let digests = 0;
  const digestOrgs = [...r.orgs.keys()].filter((id) => stats.get(id)?.any);
  const [audits, hr, policies] = await Promise.all([
    loadStaffAuditDigests(admin, r, digestOrgs, now),
    loadHrDigests(admin, r.users, digestOrgs, now),
    loadPolicyDigests(admin, digestOrgs, now),
  ]);
  const origin = await siteOrigin();
  for (const [orgId, orgName] of r.orgs) {
    const s = stats.get(orgId);
    if (!s?.any) continue;
    const admins = orgAdminEmails(r, orgId);
    if (admins.length === 0) continue;
    digests += 1;
    const auditHtml =
      staffAuditDigestHtml(audits.get(orgId) ?? [], origin) +
      hrDigestHtml(hr.get(orgId) ?? [], origin) +
      policyDigestHtml(policies.get(orgId), origin);
    for (const to of admins) {
      outbox.push({
        orgId,
        to,
        type: "digest",
        subject: `Weekly training summary — ${orgName}`,
        html: wrap(
          `Weekly summary — ${esc(orgName)}`,
          `<ul>
             <li>Completions this week: <strong>${s.completions}</strong></li>
             <li>Overdue enrolments: <strong>${s.overdue}</strong></li>
             <li>Not yet started: <strong>${s.notStarted}</strong></li>
           </ul>${auditHtml}`,
        ),
      });
    }
  }
  await flush(admin, outbox, dryRun);

  return { digestsSent: digests };
}

/**
 * Who is due a Staff Audit, per organisation that has them (STAFF-AUDITS.md):
 * what the weekly email adds under the training summary. The records are read
 * only when some organisation is entitled, and the entitlement is asked per
 * organisation — this runs as the service role, so has_feature() has no
 * organisation of its own to read.
 */
async function loadStaffAuditDigests(
  admin: Admin,
  refs: EngineRefs,
  orgIds: string[],
  now: Date,
): Promise<Map<string, ReturnType<typeof staffAuditDigest>>> {
  const out = new Map<string, ReturnType<typeof staffAuditDigest>>();
  const entitled = await Promise.all(
    orgIds.map(async (id) => ({
      id,
      meetings: await hasFeatureForOrg(admin, id, "people.supervisions"),
      checks: await hasFeatureForOrg(admin, id, "people.competency"),
    })),
  );
  const wanted = entitled.filter((e) => e.meetings || e.checks);
  if (wanted.length === 0) return out;

  const [supervisions, spotChecks, competency, forms] = await Promise.all([
    fetchAll((f, t) => admin.from("supervisions").select("id, organisation_id, user_id, kind, held_on, next_due").order("id").range(f, t)),
    fetchAll((f, t) => admin.from("spot_checks").select("id, organisation_id, user_id, checked_on, next_due").order("id").range(f, t)),
    fetchAll((f, t) => admin.from("competency_checks").select("id, organisation_id, user_id, area, checked_on, next_due").order("id").range(f, t)),
    fetchAll((f, t) =>
      admin.from("staff_audit_forms").select("id, organisation_id, kind, area_key, label, questions, self_assessment, due_every, due_unit, archived").order("id").range(f, t),
    ),
  ]);
  const users = [...refs.users.entries()];
  for (const e of wanted) {
    const people = (roles: string[]) =>
      users
        .filter(([, u]) => u.org === e.id && u.status === "active" && roles.includes(u.role))
        .map(([id, u]) => ({ id, name: u.name }));
    const mine = <T extends { organisation_id: unknown }>(rows: T[]) => rows.filter((x) => x.organisation_id === e.id);
    const resolved = resolveForms(
      mine(forms).map((o) => ({
        kind: o.kind as FormOverride["kind"],
        area_key: (o.area_key as string) ?? "",
        label: (o.label as string | null) ?? null,
        questions: Array.isArray(o.questions) ? o.questions : [],
        self_assessment: Array.isArray(o.self_assessment) ? o.self_assessment : [],
        due_every: o.due_every as number,
        due_unit: o.due_unit === "weeks" ? "weeks" : "months",
        archived: !!o.archived,
      })),
    );
    out.set(
      e.id,
      staffAuditDigest({
        carers: people(["learner"]),
        staff: people(["learner", "org_admin", "org_office"]),
        supervisions: mine(supervisions).map((x) => ({
          userId: x.user_id as string,
          kind: x.kind as string,
          heldOn: x.held_on as string,
          nextDue: (x.next_due as string | null) ?? null,
        })),
        spotChecks: mine(spotChecks).map((x) => ({ userId: x.user_id as string, heldOn: x.checked_on as string, nextDue: (x.next_due as string | null) ?? null })),
        competency: mine(competency).map((x) => ({
          userId: x.user_id as string,
          heldOn: x.checked_on as string,
          nextDue: (x.next_due as string | null) ?? null,
          area: x.area as string,
        })),
        areas: resolved.competency.map((f) => ({ key: f.key, label: f.label })),
        meetings: e.meetings,
        checks: e.checks,
        now,
      }),
    );
  }
  return out;
}

/**
 * Policy reviews due and late acceptances, per organisation with the
 * policies (POLICIES.md): what the weekly email adds after Staff audits. Entitlement asked per
 * organisation, as for Staff audits — the service role has no organisation.
 */
async function loadPolicyDigests(admin: Admin, orgIds: string[], now: Date): Promise<Map<string, PolicyDigest>> {
  const out = new Map<string, PolicyDigest>();
  const entitled = (
    await Promise.all(orgIds.map(async (id) => ((await hasFeatureForOrg(admin, id, "documents.library")) ? id : null)))
  ).filter((id): id is string => !!id);
  if (entitled.length === 0) return out;
  const [copies, reading] = await Promise.all([
    fetchAll((f, t) =>
      admin
        .from("organisation_policies")
        .select("id, organisation_id, review_due_on")
        .in("organisation_id", entitled)
        .eq("status", "published")
        .gt("version", 0)
        .order("id")
        .range(f, t),
    ),
    loadReadingForOrgs(admin, entitled, ukToday(now)),
  ]);
  for (const id of entitled) {
    const rows = copies
      .filter((c) => c.organisation_id === id)
      .map((c) => ({ copyId: c.id as string, title: "", code: "", reviewDueOn: (c.review_due_on as string | null) ?? null }));
    out.set(id, policyDigest(rows, now, reading.get(id)?.entries ?? []));
  }
  return out;
}

/**
 * Policy reminders (POLICIES.md, "Who must read what"): one email per person
 * listing every policy they still have to accept — when one is newly
 * published to them, and again every reminderRepeatDays while one is due
 * within three days or late. planPolicyReminders() decides; the log
 * remembers when each person was last sent one.
 */
export async function processPolicyReminders(
  settings: EngineSettings,
  now: Date,
  dryRun: boolean,
  refs?: EngineRefs,
): Promise<RunSummary> {
  const admin = createAdminClient();
  const r = refs ?? (await loadEngineRefs(admin));
  const entitled = (
    await Promise.all([...r.orgs.keys()].map(async (id) => ((await hasFeatureForOrg(admin, id, "documents.library")) ? id : null)))
  ).filter((id): id is string => !!id);
  if (entitled.length === 0) return { policyRemindersSent: 0 };

  const today = ukToday(now);
  const [reading, log] = await Promise.all([
    loadReadingForOrgs(admin, entitled, today),
    fetchAll((f, t) => admin.from("policy_reminder_log").select("user_id, last_sent_at").order("user_id").range(f, t)),
  ]);
  const lastSent = new Map(log.map((l) => [l.user_id as string, l.last_sent_at as string]));
  const origin = await siteOrigin();
  const outbox: Outgoing[] = [];
  const sentTo: { user_id: string; organisation_id: string; last_sent_at: string }[] = [];
  for (const [orgId, rd] of reading) {
    const plans = planPolicyReminders({
      entries: rd.entries,
      copies: rd.copies,
      lastSent,
      repeatDays: settings.reminderRepeatDays,
      today,
    });
    const copyOf = new Map(rd.copies.map((c) => [c.copyId, c]));
    for (const plan of plans) {
      const to = rd.emails.get(plan.userId);
      if (!to) continue;
      const person = rd.people.find((p) => p.id === plan.userId);
      const items = rd.entries
        .filter((e) => e.userId === plan.userId && plan.copyIds.includes(e.copyId))
        .map((e) => ({ title: copyOf.get(e.copyId)?.title ?? "A policy", dueOn: e.dueOn, late: e.status === "late" }));
      const { subject, html } = policyReminderEmail(person?.name ?? "there", r.orgs.get(orgId) ?? "Your employer", items, origin);
      outbox.push({ orgId, to, type: "policy_reminder", subject, html: wrap(subject, html) });
      sentTo.push({ user_id: plan.userId, organisation_id: orgId, last_sent_at: now.toISOString() });
    }
  }
  if (dryRun) return { policyRemindersSent: outbox.length };
  // Remember only the reminders that actually went: one that failed is due
  // again on the next run, not after reminderRepeatDays.
  const sent = await sendAndLog(admin, outbox);
  const went = sentTo.filter((_, i) => sent[i]);
  for (const part of chunk(went, 500)) await admin.from("policy_reminder_log").upsert(part);
  return { policyRemindersSent: outbox.length };
}
