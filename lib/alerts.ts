import "server-only";
import dns from "node:dns/promises";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureForOrg } from "@/lib/entitlements";
import { fetchAll } from "@/lib/fetch-all";
import { afterAlertTry, isPrivateAddress, signAlert, SIGNATURE_HEADER, type AlertEvent } from "@/lib/alert-signing";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Alerts to other systems (INTEGRATION-WHITE-LABEL.md, 29 Oct 2026): a
 * signed JSON POST to each address the company has set up for the event,
 * logged in alert_deliveries. The contract is published at /developers and
 * signed as lib/alert-signing says.
 *
 * Sending never holds up or fails what caused it: a certificate is issued
 * whether or not the alert gets through. Each alert is tried three times in
 * the moment, then again by the daily run for up to three days. An address
 * that fails AUTO_PAUSE_AFTER times in a row is paused (lib/alert-signing).
 */

const TIMEOUT_MS = 10_000;
const TRIES_NOW = 3;
const MAX_ATTEMPTS = 6;
const RETRY_DAYS = 3;

interface Endpoint {
  id: string;
  organisation_id: string;
  url: string;
  secret: string;
  events: string[];
}

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mycareacademy.co.uk").replace(/\/+$/, "");

/** Refuse an address that resolves somewhere private, in production. */
async function publicHost(url: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    const { hostname } = new URL(url);
    const addresses = await dns.lookup(hostname, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

interface PostResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

async function post(endpoint: Endpoint, deliveryId: string, event: string, body: string): Promise<PostResult> {
  if (!(await publicHost(endpoint.url))) return { ok: false, status: null, error: "The address isn't on the internet." };
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "MyCareAcademy-Alerts/1",
        "MCA-Event": event,
        "MCA-Delivery": deliveryId,
        [SIGNATURE_HEADER]: signAlert(endpoint.secret, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `Answered ${res.status}` };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, status: null, error: timedOut ? "No answer within 10 seconds" : "Couldn't reach the address" };
  }
}

/** Try one logged delivery, `tries` times with a short wait between. */
async function attempt(admin: Admin, endpoint: Endpoint, delivery: { id: string; event: string; payload: unknown; attempts: number }, tries: number) {
  const body = JSON.stringify(delivery.payload);
  let result: PostResult = { ok: false, status: null, error: null };
  let attempts = delivery.attempts;
  for (let i = 0; i < tries && attempts < MAX_ATTEMPTS; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, i * 1500));
    attempts += 1;
    result = await post(endpoint, delivery.id, delivery.event, body);
    if (result.ok) break;
  }
  const now = new Date().toISOString();
  await admin
    .from("alert_deliveries")
    .update({ attempts, ok: result.ok, status_code: result.status, error: result.error, delivered_at: result.ok ? now : null })
    .eq("id", delivery.id);
  const { data: ep } = await admin.from("alert_endpoints").select("consecutive_failures").eq("id", endpoint.id).maybeSingle();
  const next = afterAlertTry(result.ok, (ep?.consecutive_failures as number | undefined) ?? 0);
  await admin
    .from("alert_endpoints")
    .update({
      last_attempt_at: now,
      last_status: result.status,
      last_error: result.error,
      consecutive_failures: next.consecutiveFailures,
      ...(next.pause ? { active: false } : {}),
    })
    .eq("id", endpoint.id);
  return result.ok;
}

/** Log and send one alert to one address. Null when already sent (dedupe). */
async function deliver(
  admin: Admin,
  endpoint: Endpoint,
  orgName: string,
  event: AlertEvent,
  data: Record<string, unknown>,
  dedupeKey: string | null = null,
  tries = TRIES_NOW,
): Promise<boolean | null> {
  const id = crypto.randomUUID();
  const payload = {
    id,
    type: event,
    createdAt: new Date().toISOString(),
    organisation: { id: endpoint.organisation_id, name: orgName },
    data,
  };
  const { error } = await admin.from("alert_deliveries").insert({
    id,
    endpoint_id: endpoint.id,
    organisation_id: endpoint.organisation_id,
    event,
    dedupe_key: dedupeKey,
    payload,
  });
  if (error) return null;
  return attempt(admin, endpoint, { id, event, payload, attempts: 0 }, tries);
}

async function endpointsFor(admin: Admin, organisationId: string, event: AlertEvent): Promise<Endpoint[]> {
  const { data } = await admin
    .from("alert_endpoints")
    .select("id, organisation_id, url, secret, events")
    .eq("organisation_id", organisationId)
    .eq("active", true)
    .contains("events", [event]);
  if (!data?.length) return [];
  if (!(await hasFeatureForOrg(admin, organisationId, "platform.portal_api"))) return [];
  return data as Endpoint[];
}

async function orgName(admin: Admin, organisationId: string): Promise<string> {
  const { data } = await admin.from("organisations").select("name").eq("id", organisationId).maybeSingle();
  return (data?.name as string | undefined) ?? "";
}

/** After the response where there is one; straight away otherwise. */
function later(job: () => Promise<unknown>): void {
  const run = () => job().catch((e) => console.error("Alert failed:", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** The person an alert is about, with the other system's own id for them. */
function person(u: { id: string; external_ref: string | null; full_name: string | null; email: string | null }) {
  return { id: u.id, externalRef: u.external_ref, fullName: u.full_name, email: u.email };
}

/** "Certificate issued": sent to every address that wants it. */
export function alertCertificateIssued(organisationId: string, certificateId: string): void {
  later(async () => {
    const admin = createAdminClient();
    const endpoints = await endpointsFor(admin, organisationId, "certificate.issued");
    if (!endpoints.length) return;
    const { data: c } = await admin
      .from("certificates")
      .select("id, certificate_number, issued_at, expires_at, course_id, user_id")
      .eq("id", certificateId)
      .eq("organisation_id", organisationId)
      .maybeSingle();
    if (!c) return;
    const [{ data: u }, { data: course }, name] = await Promise.all([
      admin.from("users").select("id, external_ref, full_name, email").eq("id", c.user_id).maybeSingle(),
      admin.from("courses").select("id, title").eq("id", c.course_id).maybeSingle(),
      orgName(admin, organisationId),
    ]);
    const data = {
      certificate: {
        id: c.id,
        number: c.certificate_number,
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
        verifyUrl: `${SITE()}/verify?number=${encodeURIComponent(c.certificate_number as string)}`,
      },
      learner: u ? person(u as Parameters<typeof person>[0]) : null,
      course: course ? { id: course.id, title: course.title } : null,
    };
    await Promise.all(endpoints.map((e) => deliver(admin, e, name, "certificate.issued", data, `certificate:${c.id}`)));
  });
}

/** A test alert, from the manager's page. */
export async function sendTestAlert(endpointId: string, organisationId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: e } = await admin
    .from("alert_endpoints")
    .select("id, organisation_id, url, secret, events")
    .eq("id", endpointId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!e) return false;
  return !!(await deliver(admin, e as Endpoint, await orgName(admin, organisationId), "ping", {
    message: "A test alert from My Care Academy. If you can read this, alerts are reaching you.",
  }));
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * What the daily run's two alert jobs share: when to stop starting new sends
 * (the function has 60 seconds, and these run last), and the addresses that
 * have already failed this run, which aren't tried again until tomorrow.
 */
export interface AlertRun {
  deadline: number;
  failed: Set<string>;
}

export function newAlertRun(deadline = Date.now() + 20_000): AlertRun {
  return { deadline, failed: new Set() };
}

/**
 * "Training overdue", once a day from the daily run: for each address that
 * wants it, the courses whose due date has passed since its last overdue
 * alert (since it was set up, for the first). One alert per address per day;
 * an empty day sends nothing. What was already overdue before the address
 * was set up is in GET /api/portal/records.
 */
export async function processOverdueAlerts(
  now: Date,
  dryRun: boolean,
  run: AlertRun = newAlertRun(),
): Promise<{ overdueAlertsSent: number; overdueAlertsLeft: number }> {
  const admin = createAdminClient();
  const { data: endpoints } = await admin
    .from("alert_endpoints")
    .select("id, organisation_id, url, secret, events, created_at")
    .eq("active", true)
    .contains("events", ["training.overdue"]);
  let sent = 0;
  let left = 0;
  const today = isoDate(now);
  for (const e of endpoints ?? []) {
    if (Date.now() > run.deadline) {
      left += 1;
      continue;
    }
    if (run.failed.has(e.id as string)) continue;
    if (!(await hasFeatureForOrg(admin, e.organisation_id as string, "platform.portal_api"))) continue;
    const { data: last } = await admin
      .from("alert_deliveries")
      .select("created_at")
      .eq("endpoint_id", e.id)
      .eq("event", "training.overdue")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const since = last ? isoDate(new Date(last.created_at as string)) : isoDate(new Date(new Date(e.created_at as string).getTime() - 86_400_000));
    if (since >= today) continue;
    const enrolments = await fetchAll<{ id: string; user_id: string; course_id: string; due_date: string; status: string }>((f, t) =>
      admin
        .from("enrolments")
        .select("id, user_id, course_id, due_date, status")
        .eq("organisation_id", e.organisation_id)
        .neq("status", "completed")
        .gt("due_date", since)
        .lte("due_date", today)
        .order("id")
        .range(f, t),
    );
    if (!enrolments.length || dryRun) {
      if (enrolments.length) sent += 1;
      continue;
    }
    const courseIds = [...new Set(enrolments.map((x) => x.course_id))];
    const [users, { data: courses }] = await Promise.all([
      fetchAll<{ id: string; external_ref: string | null; full_name: string | null; email: string | null; status: string }>((f, t) =>
        admin.from("users").select("id, external_ref, full_name, email, status").eq("organisation_id", e.organisation_id).order("id").range(f, t),
      ),
      admin.from("courses").select("id, title").in("id", courseIds.slice(0, 300)),
    ]);
    const byUser = new Map(users.map((u) => [u.id, u]));
    const byCourse = new Map((courses ?? []).map((c) => [c.id as string, c.title as string]));
    const items = enrolments
      .filter((x) => byUser.get(x.user_id)?.status === "active")
      .map((x) => ({
        enrolmentId: x.id,
        dueDate: x.due_date,
        learner: person(byUser.get(x.user_id)!),
        course: { id: x.course_id, title: byCourse.get(x.course_id) ?? null },
      }));
    if (!items.length) continue;
    // One try here: a failure is logged and the retry run has it tomorrow.
    const ok = await deliver(admin, e as Endpoint, await orgName(admin, e.organisation_id as string), "training.overdue", { items }, `overdue:${today}`, 1);
    if (ok === false) run.failed.add(e.id as string);
    if (ok !== null) sent += 1;
  }
  return { overdueAlertsSent: sent, overdueAlertsLeft: left };
}

/** The daily run's second go at alerts that didn't get through. */
export async function retryFailedAlerts(
  now: Date,
  dryRun: boolean,
  run: AlertRun = newAlertRun(),
): Promise<{ alertsRetried: number; alertsRetryLeft: number }> {
  const admin = createAdminClient();
  const { data: failed } = await admin
    .from("alert_deliveries")
    .select("id, endpoint_id, event, payload, attempts")
    .eq("ok", false)
    .lt("attempts", MAX_ATTEMPTS)
    .gte("created_at", new Date(now.getTime() - RETRY_DAYS * 86_400_000).toISOString())
    .order("created_at")
    .limit(100);
  if (dryRun || !failed?.length) return { alertsRetried: failed?.length ?? 0, alertsRetryLeft: 0 };
  const { data: endpoints } = await admin
    .from("alert_endpoints")
    .select("id, organisation_id, url, secret, events")
    .in("id", [...new Set(failed.map((d) => d.endpoint_id as string))])
    .eq("active", true);
  const byId = new Map((endpoints ?? []).map((e) => [e.id as string, e as Endpoint]));
  let n = 0;
  let left = 0;
  for (const d of failed) {
    const e = byId.get(d.endpoint_id as string);
    // Paused (by the manager, or by us), or already failed this run.
    if (!e || run.failed.has(e.id)) continue;
    if (Date.now() > run.deadline) {
      left += 1;
      continue;
    }
    const ok = await attempt(admin, e, d as { id: string; event: string; payload: unknown; attempts: number }, 1);
    if (!ok) run.failed.add(e.id);
    n += 1;
  }
  return { alertsRetried: n, alertsRetryLeft: left };
}
