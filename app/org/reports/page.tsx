import Link from "next/link";
import {
  Award,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  ShieldCheck,
  Users,
} from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadRecentActivity } from "@/lib/activity";
import { DashboardShell } from "@/components/dashboard-shell";
import { MatrixExport } from "../matrix-export";

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
  const activity = await loadRecentActivity(supabase, 30);
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <DashboardShell title="Evidence & exports" context={context}>
      <div className="mx-auto max-w-4xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Everything an inspector is likely to ask for, in one place. Each
          export is a spreadsheet you can save, print or email.
        </p>

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
