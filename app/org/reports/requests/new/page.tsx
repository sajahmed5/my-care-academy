import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { onFreeTrial, requireRole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { DashboardShell } from "@/components/dashboard-shell";
import { REPORT_WORKING_DAYS } from "@/lib/bespoke/working-days";
import { RequestForm } from "./request-form";

export const metadata = { title: "Ask for a report" };

/** A manager asks us for a bespoke report (BESPOKE-REPORTS.md). */
export default async function NewReportRequestPage() {
  const context = await requireRole("org_admin");
  await requireFeature(context, "reports.bespoke");
  const trial = await onFreeTrial(context);
  return (
    <DashboardShell title="Ask for a report" context={context}>
      <div className="max-w-2xl space-y-5">
        <Link href="/org/reports#our-reports" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" />
          Evidence &amp; exports
        </Link>
        <p className="text-sm text-muted-foreground">
          Tell us what you need and we&apos;ll build it within {REPORT_WORKING_DAYS} working days. Ask for as many as
          you like. Only your company sees the reports we build for you, and we&apos;ll message you here if anything
          needs clarifying.
        </p>
        {trial && (
          <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <strong>You&apos;re on a free trial.</strong> You can send a request to see how it works, but reports
            aren&apos;t built during a trial. If you carry on with Enterprise, we start on it straight away, and
            it&apos;s ready within {REPORT_WORKING_DAYS} working days.
          </p>
        )}
        <div className="rounded-2xl border bg-card p-5">
          <RequestForm />
        </div>
      </div>
    </DashboardShell>
  );
}
