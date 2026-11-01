import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProgressRing } from "@/components/learner-ui";
import { Pill, type PillTone } from "@/components/pill";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** One check on the person's Overview (docs/redesign image 4). */
export interface OverviewCheck {
  key: string;
  title: string;
  blurb: string;
  status: { label: string; tone: PillTone };
  /** Met: counts towards the ring. */
  done: boolean;
  /** Red first, then amber, then done. */
  action: { label: string; href: string };
}

export interface ActivityLine {
  key: string;
  text: string;
  at: string;
  /** A time as well as the date — "Today, 21:46". */
  withTime?: boolean;
}

const fmtDay = (iso: string) => formatDate(iso, { day: "numeric", month: "short", year: "numeric" });

function when(line: ActivityLine): string {
  if (!line.withTime) return fmtDay(line.at);
  const d = new Date(line.at);
  const today = new Date().toDateString() === d.toDateString();
  const time = formatDate(line.at, { hour: "2-digit", minute: "2-digit" });
  return today ? `Today, ${time}` : `${fmtDay(line.at)}, ${time}`;
}

/**
 * The Overview tab: the compliance checklist, a ring of how many are met,
 * and what has happened lately. Each card has one button to where the
 * thing is done; the red ones come first.
 */
export function PersonOverview({ checks, activity, children }: { checks: OverviewCheck[]; activity: ActivityLine[]; children?: React.ReactNode }) {
  const order = (c: OverviewCheck) => (c.status.tone === "danger" ? 0 : c.status.tone === "warn" ? 1 : 2);
  const sorted = [...checks].sort((a, b) => order(a) - order(b));
  const met = checks.filter((c) => c.done).length;
  const pct = checks.length ? Math.round((met / checks.length) * 100) : 100;
  const ringColour = pct === 100 ? "var(--primary)" : pct >= 60 ? "#d97706" : "#b42318";
  const red = checks.filter((c) => c.status.tone === "danger").length;
  const amber = checks.filter((c) => c.status.tone === "warn").length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <section aria-labelledby="checklist-heading" className="space-y-4">
        <h2 id="checklist-heading" className="text-lg font-extrabold tracking-tight">
          Compliance checklist
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((c) => (
            <div key={c.key} className="flex flex-col rounded-card border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[17px] font-bold leading-snug">{c.title}</h3>
                <Pill tone={c.status.tone}>{c.status.label}</Pill>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{c.blurb}</p>
              <Link href={c.action.href} className="mt-4 inline-flex min-h-10 items-center gap-1 self-start text-[15px] font-bold text-primary hover:underline">
                {c.action.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          ))}
        </div>
        {children}
      </section>

      <div className="space-y-6">
        <div className="flex items-center gap-5 rounded-card border bg-card p-5">
          <ProgressRing value={pct} size={96} stroke={10} color={ringColour}>
            <span className="text-xl font-extrabold">{pct}%</span>
          </ProgressRing>
          <div>
            <p className="text-[17px] font-extrabold leading-tight">
              {met} of {checks.length} checks done
            </p>
            <p className={cn("mt-1 text-sm", red ? "text-danger-foreground" : amber ? "text-warn-foreground" : "text-muted-foreground")}>
              {red ? "Fix the red ones first" : amber ? "The amber ones are close" : "Everything is in order"}
            </p>
          </div>
        </div>

        <section aria-labelledby="activity-heading" className="rounded-card border bg-card p-5">
          <h2 id="activity-heading" className="text-[17px] font-extrabold tracking-tight">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing yet. Their sign-ins, certificates and supervisions will show here.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {activity.map((a) => (
                <li key={a.key} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-chart-2" aria-hidden />
                  <span>
                    <span className="block font-medium">{a.text}</span>
                    <span className="block text-muted-foreground">{when(a)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
