import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processScheduledReports } from "@/lib/bespoke/send";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Hourly: bespoke reports emailed on their schedule (BESPOKE-REPORTS.md),
 * from 7am UK time on the day they fall due. Hourly rather than daily so a
 * busy morning that runs past the 60 seconds carries on at the next run.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const reports = await processScheduledReports(createAdminClient(), new Date(), dryRun);
  return NextResponse.json({ ok: true, dryRun, ...reports });
}
