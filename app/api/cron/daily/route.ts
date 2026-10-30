import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chaseReferences } from "@/lib/reference-requests";
import {
  loadEngineRefs,
  loadSettings,
  processRenewals,
  processReminders,
  processEngagement,
} from "@/lib/engine";
import { processFaceToFaceReminders } from "@/lib/face-to-face-email";
import { processOverdueAlerts, retryFailedAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Daily engine run: renewals (expire + remind), learner reminders, engagement
 * alerts, the day-before reminder for face-to-face sessions, and overdue
 * alerts to other systems.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const now = new Date();

  const admin = createAdminClient();
  // Every user, course, organisation and enrolment, loaded once and shared by
  // all three jobs — each used to read its own copy.
  const [settings, refs] = await Promise.all([
    loadSettings(admin),
    loadEngineRefs(admin),
  ]);

  const renewals = await processRenewals(settings, now, dryRun, refs);
  const reminders = await processReminders(settings, now, dryRun, refs);
  const engagement = await processEngagement(settings, now, dryRun, refs);
  const faceToFace = await processFaceToFaceReminders(admin, now, dryRun);
  // Referees who haven't answered: a reminder after 3 days, twice at most.
  const references = await chaseReferences(admin, now, dryRun);
  // Alerts to other systems: today's newly overdue courses, and another go
  // at any alert that didn't get through.
  const overdueAlerts = await processOverdueAlerts(now, dryRun);
  const retried = await retryFailedAlerts(now, dryRun);

  return NextResponse.json({
    ok: true,
    dryRun,
    ...renewals,
    ...reminders,
    ...engagement,
    ...faceToFace,
    referenceReminders: references,
    ...overdueAlerts,
    ...retried,
  });
}
