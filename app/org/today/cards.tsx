import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { ProgressRing } from "@/components/learner-ui";
import { Pill } from "@/components/pill";
import { CodeTile } from "@/components/code-tile";
import { cn } from "@/lib/utils";
import type { AttentionRow, Readiness } from "@/lib/today";

/** The dark card on the left: how inspection-ready the company is. */
export function ReadinessCard({ r }: { r: Readiness }) {
  const line =
    r.toFix === 0
      ? r.total === r.met
        ? "Nothing late anywhere"
        : "Nothing late to fix"
      : `${r.toFix} thing${r.toFix === 1 ? "" : "s"} to fix to reach 100%`;
  return (
    <div className="flex h-full items-center gap-5 rounded-card bg-primary p-5 text-primary-foreground sm:p-6">
      <ProgressRing value={r.pct} size={104} stroke={10} color="#5eead4">
        <span className="text-2xl font-extrabold">{r.pct}%</span>
      </ProgressRing>
      <div className="min-w-0">
        <p className="text-xl font-extrabold leading-tight">Inspection ready</p>
        <p className="mt-1 text-sm text-primary-foreground/80">{line}</p>
        <p className="mt-1 text-xs text-primary-foreground/60">
          {r.met} of {r.total} checks clear
        </p>
      </div>
    </div>
  );
}

/** A figure, a bar under it, and one line on what follows from it. */
export function FigureCard({
  label,
  value,
  of,
  pct,
  barTone = "primary",
  note,
  noteTone = "muted",
  href,
}: {
  label: string;
  value: string | number;
  /** "/ 24" after the figure. */
  of?: string;
  pct: number;
  barTone?: "primary" | "warn" | "danger";
  note: string;
  noteTone?: "muted" | "warn" | "danger";
  href: string;
}) {
  const bar = { primary: "bg-primary", warn: "bg-amber-500", danger: "bg-danger-foreground" }[barTone];
  const noteClass = { muted: "text-muted-foreground", warn: "text-warn-foreground", danger: "text-danger-foreground" }[noteTone];
  return (
    <Link href={href} className="block h-full rounded-card border bg-card p-4 transition-colors hover:border-foreground/20 sm:p-6">
      <p className="text-sm font-semibold text-muted-foreground sm:text-[15px]">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[30px] font-extrabold leading-none tracking-tight sm:text-[34px]">{value}</span>
        {of && <span className="text-lg font-semibold text-muted-foreground">{of}</span>}
      </p>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <p className={cn("mt-3 text-sm font-semibold", noteClass)}>{note}</p>
    </Link>
  );
}

/** "Needs your attention": the list, each line with one button to where it is done. */
export function AttentionList({ rows, allHref, allCount }: { rows: AttentionRow[]; allHref: string; allCount: number }) {
  return (
    <section aria-labelledby="attention-heading" data-tour="today-attention" className="rounded-card border bg-card">
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <h2 id="attention-heading" className="text-lg font-extrabold tracking-tight">
          Needs your attention
        </h2>
        {allCount > rows.length ? (
          <Link href={allHref} className="text-sm font-bold text-primary hover:underline">
            View all {allCount}
          </Link>
        ) : (
          rows.length > 0 && (
            <Link href={allHref} className="text-sm font-bold text-primary hover:underline">
              View all
            </Link>
          )
        )}
      </div>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t px-6 py-10 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-ok text-ok-foreground">
            <Check className="size-5" />
          </span>
          <p className="font-bold">Nothing needs you today</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Overdue training, supervisions, audits and concerns will appear here as they fall due, each with a button to deal with it.
          </p>
        </div>
      ) : (
        <ul className="divide-y border-t">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
              <CodeTile code={r.code} tone={r.tone === "alert" ? "danger" : "warn"} />
              <Link href={r.href} className="min-w-0 flex-1 rounded-md focus-visible:outline-2">
                <span className="block truncate font-semibold">{r.title}</span>
                {r.meta && <span className="block truncate text-sm text-muted-foreground">{r.meta}</span>}
              </Link>
              <Pill tone={r.pill.tone} className="hidden sm:inline-flex">
                {r.pill.label}
              </Pill>
              <Link
                href={r.href}
                aria-label={`${r.action}: ${r.title}`}
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl border bg-background px-3.5 text-sm font-bold text-primary transition-colors hover:bg-accent"
              >
                <span className="sm:hidden">
                  <ArrowRight className="size-4" />
                </span>
                <span className="hidden sm:inline">{r.action}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

/** The checklist a new company works through; hidden once it is complete. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section aria-labelledby="setup-heading" className="rounded-card border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="setup-heading" className="text-lg font-extrabold tracking-tight">
          Finish setting up
        </h2>
        <span className="text-sm font-semibold text-muted-foreground">
          {done} of {steps.length}
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
        <div className="h-full rounded-full bg-chart-2" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 space-y-1">
        {steps.map((s) => (
          <li key={s.key}>
            {s.done ? (
              <span className="flex min-h-10 items-center gap-3 text-[15px] text-muted-foreground line-through decoration-muted-foreground/60">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                {s.label}
              </span>
            ) : (
              <Link href={s.href} className="flex min-h-10 items-center gap-3 rounded-lg text-[15px] font-medium hover:text-primary">
                <span className="size-6 shrink-0 rounded-full border-2 border-border" aria-hidden />
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One stacked bar for the whole team's training, with its legend. */
export function TeamTraining({
  segments,
  href,
}: {
  segments: { key: string; label: string; count: number; className: string; dot: string }[];
  href: string;
}) {
  const total = segments.reduce((n, s) => n + s.count, 0);
  return (
    <section aria-labelledby="team-training-heading" className="rounded-card border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="team-training-heading" className="text-lg font-extrabold tracking-tight">
          Training across the team
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
          Open training matrix
          <ArrowRight className="size-4" />
        </Link>
      </div>
      {total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No training assigned yet.{" "}
          <Link href="/org/courses/admin" className="font-bold text-primary hover:underline">
            Assign the mandatory courses
          </Link>{" "}
          and this bar fills as people complete them.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={segments.map((s) => `${s.count} ${s.label}`).join(", ")}>
            {segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div key={s.key} className={cn("h-full", s.className)} style={{ width: `${(s.count / total) * 100}%` }} />
              ))}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {segments.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-sm", s.dot)} aria-hidden />
                <span className="font-extrabold">{s.count}</span>
                <span className="text-muted-foreground">{s.label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
