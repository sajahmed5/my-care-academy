import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chaseReferences } from "@/lib/reference-requests";
import {
  loadEngineRefs,
  loadSettings,
  type EngineRefs,
  type EngineSettings,
  processRenewals,
  processReminders,
  processEngagement,
  processPolicyReminders,
} from "@/lib/engine";
import { processFaceToFaceReminders } from "@/lib/face-to-face-email";
import { processCaseReminders } from "@/lib/hr/case-reminders";
import { processLeavers } from "@/lib/hr/leavers-server";
import { newAlertRun, processOverdueAlerts, retryFailedAlerts } from "@/lib/alerts";
import { runCronJobs } from "@/lib/cron-jobs";
import { processTrialEmails } from "@/lib/trial-emails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * The daily run, one job after another: renewals (expire + remind), learner
 * reminders, engagement alerts, the day-before reminder for face-to-face
 * sessions, policy reminders, chasing referees, HR case deadlines, leavers,
 * and alerts to other systems (today's newly overdue courses, then another go
 * at any that didn't get through).
 *
 * Each job runs on its own (lib/cron-jobs): one that throws is reported under
 * `errors` and the rest still run, so a fault in one corner doesn't silently
 * cancel everyone else's reminders for the day.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const now = new Date();
  // The alert jobs run last and stop starting new sends 50 seconds in, and
  // share which addresses have already failed today.
  const alerts = newAlertRun(Date.now() + 50_000);

  const admin = createAdminClient();
  // Every user, course, organisation and enrolment, loaded once and shared by
  // the four engine jobs (renewals, reminders, engagement, policies) — each
  // used to read its own copy. If it can't be read, those four are reported
  // as failed and the others still run.
  let engine: { settings: EngineSettings; refs: EngineRefs } | null = null;
  const needEngine = () => {
    if (!engine) throw new Error("Skipped: the engine's data couldn't be loaded.");
    return engine;
  };

  const { results, errors } = await runCronJobs([
    {
      name: "engineData",
      run: async () => {
        const [settings, refs] = await Promise.all([loadSettings(admin), loadEngineRefs(admin)]);
        engine = { settings, refs };
        return {};
      },
    },
    { name: "renewals", run: () => processRenewals(needEngine().settings, now, dryRun, needEngine().refs) },
    { name: "reminders", run: () => processReminders(needEngine().settings, now, dryRun, needEngine().refs) },
    { name: "engagement", run: () => processEngagement(needEngine().settings, now, dryRun, needEngine().refs) },
    { name: "faceToFace", run: () => processFaceToFaceReminders(admin, now, dryRun) },
    // Policies staff still have to accept: when published to them, and as the date nears or passes.
    { name: "policies", run: () => processPolicyReminders(needEngine().settings, now, dryRun, needEngine().refs) },
    // Referees who haven't answered: a reminder after 3 days, twice at most.
    { name: "references", run: async () => ({ referenceReminders: await chaseReferences(admin, now, dryRun) }) },
    // HR cases: deadlines missed or in the next 2 days, to whoever can see them.
    { name: "cases", run: () => processCaseReminders(admin, now, dryRun) },
    // Leavers: logins off after their last day, training record emailed.
    { name: "leavers", run: () => processLeavers(admin, now, dryRun) },
    // Free trials: their managers at 2 days left and on the last day, and us
    // on the last day (TRIAL.md).
    { name: "trials", run: () => processTrialEmails(admin, now, dryRun) },
    // Alerts to other systems: today's newly overdue courses, and another go
    // at any alert that didn't get through.
    { name: "overdueAlerts", run: () => processOverdueAlerts(now, dryRun, alerts) },
    { name: "retryAlerts", run: () => retryFailedAlerts(now, dryRun, alerts) },
  ]);

  const failed = Object.keys(errors).length > 0;
  return NextResponse.json(
    { ok: !failed, dryRun, ...results, ...(failed ? { errors } : {}) },
    { status: failed ? 500 : 200 },
  );
}
