import Link from "next/link";
import { FileDown } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiStatus } from "@/lib/ai";
import { DashboardShell } from "@/components/dashboard-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QA_HEADINGS } from "@/lib/client-qa";
import { monthRange, previousMonth, recentMonths } from "@/lib/governance";
import { formatDate } from "@/lib/dates";
import { governanceFor } from "./load";
import { SummaryEditor } from "./summary-editor";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });
const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

function Tile({ value, label, warn }: { value: string | number; label: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className={`text-2xl font-semibold ${warn ? "text-rose-700" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * The monthly governance report (SERVICE-AUDITS.md): the month's audits, QA
 * ratings, open actions, concerns, Staff Audits and training on one page, a
 * summary written (or drafted by AI and edited) by a person, and the PDF.
 */
export default async function GovernancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const now = new Date();
  const { month } = await searchParams;
  const range = monthRange(month ?? "") ?? monthRange(previousMonth(now))!;
  const [g, ai] = await Promise.all([governanceFor(context, range), aiStatus(createAdminClient(), context.organisationId!)]);
  const low = (n: number | null) => n !== null && n < g.reviewBelow;

  return (
    <DashboardShell title="Governance report" context={context} back={{ href: "/org/audits", label: "Audits" }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {recentMonths(now, 6).map((m) => (
              <Link
                key={m.month}
                href={`/org/audits/governance?month=${m.month}`}
                aria-current={m.month === range.month ? "page" : undefined}
                className={`rounded-full border px-3 py-1 text-sm ${m.month === range.month ? "border-foreground bg-foreground text-background" : "hover:bg-accent"}`}
              >
                {m.label}
              </Link>
            ))}
          </div>
          <a href={`/org/audits/governance/pdf?month=${range.month}`} className={buttonVariants({ size: "sm" })}>
            <FileDown className="size-4" /> Download the PDF
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          {range.label}, for CQC&apos;s well-led question. Everything below is worked out from what&apos;s recorded; training is as it stands today.
        </p>

        <SummaryEditor key={range.month} month={range.month} initial={g.summary} ai={{ allowed: ai.allowed, reason: ai.reason ?? null }} />

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Audits</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile value={g.audits.done.length} label="carried out" />
            <Tile value={g.audits.waitingReview} label="waiting for review now" warn={g.audits.waitingReview > 0} />
            {g.audits.behind.map((b) => (
              <Tile key={b.title} value={b.count} label={`${b.title.toLowerCase()} behind now`} warn />
            ))}
          </div>
          {g.audits.byForm.length > 0 && (
            <Card>
              <CardContent className="divide-y p-0">
                {g.audits.byForm.map((f) => (
                  <div key={f.title} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      {f.title} · {f.count}
                    </span>
                    <span className={low(f.average) ? "font-medium text-rose-700" : "text-muted-foreground"}>average {pct(f.average)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Client QAs</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile value={g.qas.done} label="done" />
            <Tile value={g.qas.attempted} label="attempted, couldn't be done" />
            <Tile value={pct(g.qas.score)} label="average score" warn={low(g.qas.score)} />
            <Tile value={g.qas.low.length} label={`below ${g.reviewBelow}%`} warn={g.qas.low.length > 0} />
          </div>
          {g.qas.done > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {QA_HEADINGS.map((h) => (
                <div key={h.key} className="rounded-lg border p-2 text-center">
                  <p className="text-xs text-muted-foreground">{h.label}</p>
                  <p className="text-lg font-semibold">{g.qas.averages[h.key] ?? "–"}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Actions still open</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile value={g.actions.open} label={`open at the end of ${range.label}`} />
            <Tile value={g.actions.overdue} label="past their date" warn={g.actions.overdue > 0} />
          </div>
          {g.actions.overdueList.length > 0 && (
            <Card>
              <CardContent className="divide-y p-0">
                {g.actions.overdueList.map((a, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm">
                    <span>{a.title}</span>
                    <span className="text-xs text-rose-700">
                      {a.owner} · due {fmt(a.due)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>

        {g.concerns && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Concerns and compliments</h2>
            <div className="grid gap-3 sm:grid-cols-5">
              <Tile value={g.concerns.raised} label="concerns raised" />
              <Tile value={g.concerns.safeguarding} label="of them safeguarding" warn={g.concerns.safeguarding > 0} />
              <Tile value={g.concerns.closed} label="closed this month" />
              <Tile value={g.concerns.openNow} label="open now" />
              <Tile value={g.concerns.compliments} label="compliments" />
            </div>
          </section>
        )}

        {g.staffAudits && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Staff audits</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Tile value={g.staffAudits.supervisions} label="supervisions held" />
              <Tile value={g.staffAudits.appraisals} label="appraisals held" />
              <Tile value={g.staffAudits.spotChecks} label="spot checks" />
              <Tile value={g.staffAudits.spotChecksShort} label="spot checks that fell short" warn={g.staffAudits.spotChecksShort > 0} />
              <Tile value={g.staffAudits.supervisionsBehind} label="staff overdue a supervision now" warn={g.staffAudits.supervisionsBehind > 0} />
              <Tile value={g.staffAudits.spotChecksBehind} label="carers overdue a spot check now" warn={g.staffAudits.spotChecksBehind > 0} />
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Training compliance</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile value={pct(g.training.compliance)} label="assigned courses completed and in date" />
            <Tile value={`${g.training.upToDate} of ${g.training.people}`} label="staff fully up to date" />
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
