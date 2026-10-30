import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processTrialRemovals } from "@/lib/trial-removal";

export const dynamic = "force-dynamic";
// Removing a company deletes every account and file it holds, which runs
// longer than the daily job's minute (as the platform's own Remove does).
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Lapsed free trials (TRIAL.md): a warning to us a week before a trial that
 * didn't carry on is removed, then the removal, 30 days after it ended.
 * Its own route for the time a removal takes. ?dryRun=1 counts and changes
 * nothing.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    const out = await processTrialRemovals(createAdminClient(), new Date(), dryRun);
    return NextResponse.json({ ok: true, dryRun, ...out });
  } catch (e) {
    console.error("trials cron failed:", e);
    return NextResponse.json({ ok: false, dryRun, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
