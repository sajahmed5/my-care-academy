import Link from "next/link";
import {
  Award,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadRecentActivity } from "@/lib/activity";
import { DashboardShell } from "@/components/dashboard-shell";
import { MatrixExport } from "../matrix-export";
import { formatDateTime } from "@/lib/dates";
import { hasFeature } from "@/lib/entitlements";
import { lockedHref } from "@/lib/features";
import { buttonVariants } from "@/components/ui/button";
import { RequestDue, RequestStatus } from "@/components/bespoke/request-parts";
import { isOpenRequest } from "@/lib/bespoke/requests";
import { reportsForConsole } from "@/lib/bespoke/access";
import { REPORT_WORKING_DAYS, ukToday } from "@/lib/bespoke/working-days";

/**
 * Evidence & exports.
 *
 * This page used to say "Reports are coming soon" while sitting high in the
 * menu — the first place a manager looks before an inspection. Everything
 * listed here already worked; it was just scattered across five screens with
 * no way to find it (usability audit, 7 Oct 2026).
 */
export const metadata = { title: "Evidence & exports" };

const EXPORTS: {
  title: string;
  body: string;
  href: string;
  cta: string;
  icon: typeof Users;
}[] = [
  {
    title: "Who is up to date, and who isn't",
    body: "Every carer with their assigned, completed, in-progress and overdue counts. Filter first, then export — the file matches what's on screen.",
    href: "/org/learners#learners",
    cta: "Open the learner list",
    icon: Users,
  },
  {
    title: "Every assignment, course by course",
    body: "One row per carer per course, with status, progress, when it was assigned and when it is due. Sort by any column.",
    href: "/org/learners/statistics",
    cta: "Open every assignment",
    icon: ClipboardList,
  },
  {
    title: "Certificates and renewals",
    body: "What is valid, what expires in the next 60 days and what has already lapsed. Each row downloads its PDF.",
    href: "/org/certificates",
    cta: "Open certificates",
    icon: Award,
  },
  {
    title: "How long courses really take",
    body: "Expected against actual time per course, attempts, and who has finished — useful when a course looks too long for a shift.",
    href: "/org/courses/statistics",
    cta: "Open course statistics",
    icon: CheckCircle2,
  },
];

export default async function OrgReportsPage() {
  const context = await requireConsole();
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const manager = context.role === "org_admin";
  const [activity, bespoke, reports] = await Promise.all([
    loadRecentActivity(supabase, 30, context.organisationId),
    hasFeature(context, "reports.bespoke"),
    reportsForConsole(context),
  ]);
  const { data: requestRows } =
    bespoke && manager
      ? await supabase
          .from("report_requests")
          .select("id, request_no, title, status, due_on, ready_at, created_at")
          .eq("organisation_id", context.organisationId!)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: null };
  const requests = (requestRows ?? []) as {
    id: string;
    request_no: number;
    title: string;
    status: string;
    due_on: string;
    ready_at: string | null;
  }[];
  // Still with us first, then the rest newest first.
  requests.sort((a, b) => Number(isOpenRequest(b.status)) - Number(isOpenRequest(a.status)));
  const when = (iso: string) =>
    formatDateTime(iso, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <DashboardShell title="Evidence & exports" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Everything an inspector is likely to ask for, in one place. Each
          export is a spreadsheet you can save, print or email.
        </p>

        <OurReports bespoke={bespoke} manager={manager} requests={requests} reports={reports} />

        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileSpreadsheet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Training matrix</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The one most inspectors ask for: every carer down the side,
                every course across the top, and the date each was completed.
                Downloads as a spreadsheet.
              </p>
              <div className="mt-3">
                <MatrixExport filename={`training-matrix-${today}.csv`} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {EXPORTS.map(({ title, body, href, cta, icon: Icon }) => (
            <div key={title} className="flex flex-col rounded-2xl border bg-card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-muted text-foreground/70">
                <Icon className="size-5" />
              </span>
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              <Link
                href={href}
                className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-semibold text-primary hover:underline sm:min-h-0"
              >
                {cta} →
              </Link>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Recent activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What has been changed in your organisation, and by whom. Useful
            when you can&apos;t remember whether you assigned something — and
            as evidence that you acted on a problem.
          </p>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          ) : (
            <ol className="mt-3 divide-y text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                  <span>
                    {a.text} <span className="text-muted-foreground">· {a.who}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{when(a.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">Proving a certificate is genuine</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every certificate carries a number. Anyone — an inspector, a
                commissioner, another employer — can check it without going
                through you, at{" "}
                <Link href="/verify" className="font-medium text-primary hover:underline">
                  mycareacademy.co.uk/verify
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}

/**
 * Our reports (BESPOKE-REPORTS.md): reports we build for this company alone,
 * and — for a manager — the requests for them. Without Enterprise it's a
 * padlocked card leading to the page that says which package has it.
 */
function OurReports({
  bespoke,
  manager,
  requests,
  reports,
}: {
  bespoke: boolean;
  manager: boolean;
  requests: { id: string; request_no: number; title: string; status: string; due_on: string; ready_at: string | null }[];
  reports: { id: string; title: string; description: string | null; managers_only: boolean }[];
}) {
  if (!bespoke) {
    return (
      <section id="our-reports" className="rounded-2xl border border-dashed bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70">
            <Lock className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Our reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reports built for your company: tell us what you need and we build it within {REPORT_WORKING_DAYS}{" "}
              working days.
            </p>
            <Link
              href={lockedHref("reports.bespoke")}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline sm:min-h-0"
            >
              {manager ? "See which package has it" : "Find out more"} →
            </Link>
          </div>
        </div>
      </section>
    );
  }
  const today = ukToday();
  return (
    <section id="our-reports" className="space-y-4 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Our reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Built for your company alone, from your live data. Only you see them.
            </p>
          </div>
        </div>
        {manager && (
          <Link href="/org/reports/requests/new" className={buttonVariants()}>
            Ask for a report
          </Link>
        )}
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {manager
            ? `Nothing built yet. Ask for a report and we'll build it within ${REPORT_WORKING_DAYS} working days.`
            : "None to show you yet. Your manager can ask us for one."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-col rounded-xl border p-4">
              <Link href={`/org/reports/bespoke/${r.id}`} className="font-medium text-primary hover:underline">
                {r.title}
              </Link>
              {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
              <p className="mt-auto pt-2 text-xs text-muted-foreground">
                Live · PDF · Excel{r.managers_only ? " · Managers only" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {manager && requests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Your requests</h3>
          <ul className="mt-2 divide-y text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
                <Link href={`/org/reports/requests/${r.id}`} className="font-medium text-primary hover:underline">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{r.request_no}</span>
                  {r.title}
                </Link>
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <RequestDue request={r} today={today} />
                  <RequestStatus status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
