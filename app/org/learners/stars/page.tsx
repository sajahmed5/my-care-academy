import Link from "next/link";
import { Star } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { loadOrgPeople } from "@/lib/org-learners";
import { isStaff } from "@/lib/roles";
import { formatDate } from "@/lib/dates";
import { initials } from "@/lib/initials";
import {
  STAR_PERIODS,
  isStarPeriod,
  loadStarRows,
  periodBounds,
  starEvents,
  summarise,
  whenLabel,
  type StarEvent,
  type StarPeriod,
} from "@/lib/stars-console";
import { StarsExport } from "./stars-export";

/**
 * People → Staff → Stars: who is learning most. Every current member of
 * staff with a star, ranked, with what they banked this period. People with
 * no stars yet are counted above the table rather than ranked last — a new
 * starter should not open the console to find themselves at the bottom.
 * The maths is lib/stars-console.ts; the footnote says what a star is and
 * that it is never a compliance measure.
 */

const SHOWN = 10;

const ROLE_LABEL: Record<string, string> = {
  learner: "Care worker",
  org_admin: "Manager",
  org_office: "Office",
};

export default async function StarsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; sort?: string; all?: string }>;
}) {
  const context = await requireConsole();
  const orgId = context.organisationId!;
  const { period: periodParam, sort, all } = await searchParams;
  const period: StarPeriod = isStarPeriod(periodParam) ? periodParam : "quarter";
  const byGain = sort === "period";
  const showAll = all === "1";
  const now = new Date();

  const supabase = await createClient();
  const [people, rows, { data: organisation }] = await Promise.all([
    loadOrgPeople(supabase, orgId),
    loadStarRows(supabase, orgId),
    supabase.from("organisations").select("name").eq("id", orgId).single(),
  ]);
  const events = starEvents(rows.attempts, rows.certificates, rows.content);
  const eventsOf = new Map<string, StarEvent[]>();
  for (const e of events) {
    const list = eventsOf.get(e.userId) ?? [];
    list.push(e);
    eventsOf.set(e.userId, list);
  }
  const bounds = periodBounds(period, now);
  const periodLabel = STAR_PERIODS.find((p) => p.key === period)!.label.toLowerCase();

  const staff = [...people].filter(([, p]) => isStaff(p.role) && p.status !== "deactivated");
  const everyone = staff.map(([id, p]) => ({
    id,
    name: p.full_name || p.email || "Someone",
    role: ROLE_LABEL[p.role ?? ""] ?? "Staff",
    ...summarise(id, eventsOf.get(id) ?? [], bounds),
  }));
  const ranked = everyone
    .filter((s) => s.total > 0)
    .sort((a, b) => (byGain ? b.gain - a.gain || b.total - a.total : b.total - a.total || b.gain - a.gain) || a.name.localeCompare(b.name));
  const noStars = everyone.length - ranked.length;
  const shown = showAll ? ranked : ranked.slice(0, SHOWN);
  const maxGain = Math.max(1, ...ranked.map((s) => s.gain));

  const earned = ranked.reduce((n, s) => n + s.gain, 0);
  const previous = ranked.reduce((n, s) => n + s.previousGain, 0);
  const total = ranked.reduce((n, s) => n + s.total, 0);
  const top = ranked.reduce<(typeof ranked)[number] | null>((best, s) => (s.gain > 0 && (!best || s.gain > best.gain) ? s : best), null);
  const name = organisation?.name ?? "org";

  const href = (patch: { period?: StarPeriod; sort?: string; all?: string }) => {
    const q = new URLSearchParams();
    const p = patch.period ?? period;
    if (p !== "quarter") q.set("period", p);
    const s = "sort" in patch ? patch.sort : byGain ? "period" : undefined;
    if (s) q.set("sort", s);
    const a = "all" in patch ? patch.all : showAll ? "1" : undefined;
    if (a) q.set("all", a);
    const qs = q.toString();
    return `/org/learners/stars${qs ? `?${qs}` : ""}`;
  };
  const fmt = (iso: string) => formatDate(iso, { day: "numeric", month: "short", year: "numeric" });
  const peopleWord = (n: number) => (n === 1 ? "person" : "people");

  return (
    <DashboardShell
      title="Stars"
      context={context}
      header={
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]">Stars</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Who is learning most · <b className="font-bold text-foreground tabular-nums">{ranked.length}</b> {peopleWord(ranked.length)} {ranked.length === 1 ? "has" : "have"} earned{" "}
              <b className="font-bold text-foreground tabular-nums">{total.toLocaleString("en-GB")}</b> {total === 1 ? "star" : "stars"}
              {ranked.length > 1 && " between them"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Period" className="inline-flex rounded-xl bg-muted p-[3px]">
              {STAR_PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={href({ period: p.key })}
                  aria-current={p.key === period ? "page" : undefined}
                  className={
                    p.key === period
                      ? "rounded-[9px] bg-card px-3.5 py-1.5 text-sm font-bold text-foreground shadow-sm"
                      : "rounded-[9px] px-3.5 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {p.label}
                </Link>
              ))}
            </nav>
            <StarsExport
              filename={`${name}-stars.csv`}
              period={periodLabel}
              rows={ranked.map((s, i) => ({
                rank: i + 1,
                name: s.name,
                role: s.role,
                total: s.total,
                gain: s.gain,
                courses: s.coursesPassed,
                last: s.lastStarAt ? fmt(s.lastStarAt) : "",
              }))}
            />
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border bg-card p-5">
          <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">{period === "all" ? "Stars in all" : `Earned ${periodLabel}`}</p>
          <p className="mt-2 flex items-center gap-2 text-[32px] font-extrabold leading-none tabular-nums">
            <Star className="size-7" fill="#f59e0b" stroke="#f59e0b" aria-hidden />
            {(period === "all" ? total : earned).toLocaleString("en-GB")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {period === "all"
              ? `Across ${ranked.length} ${peopleWord(ranked.length)}.`
              : previous > 0
                ? earned >= previous
                  ? `Up from ${previous.toLocaleString("en-GB")} in the ${period} before.`
                  : `Down from ${previous.toLocaleString("en-GB")} in the ${period} before.`
                : `Nothing was banked in the ${period} before.`}
          </p>
        </div>
        <div className="rounded-card border bg-card p-5">
          <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Top earner {periodLabel}</p>
          {top ? (
            <>
              <p className="mt-2 truncate text-[26px] font-extrabold leading-tight">
                <Link href={`/org/staff/${top.id}?section=stars`} className="hover:underline">
                  {top.name}
                </Link>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="tabular-nums">+{top.gain}</span> {top.gain === 1 ? "star" : "stars"} · {top.coursesPassed} {top.coursesPassed === 1 ? "course" : "courses"} passed in all
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-[26px] font-extrabold leading-tight text-muted-foreground">Nobody yet</p>
              <p className="mt-2 text-sm text-muted-foreground">No stars have been banked {periodLabel}.</p>
            </>
          )}
        </div>
        <div className="rounded-card border bg-card p-5">
          <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">No stars yet</p>
          <p className="mt-2 text-[32px] font-extrabold leading-none tabular-nums">
            {noStars} <span className="text-[20px] font-bold">{peopleWord(noStars)}</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {noStars === 0 ? (
              "Everyone has answered at least one question right."
            ) : (
              <>
                They have not answered a question in their training yet.{" "}
                <Link href="/org/learners?filter=never" className="font-bold text-primary hover:underline">
                  See the staff list →
                </Link>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border bg-card">
        {ranked.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-bold">No stars yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Stars appear here as people answer questions in their training. Assign the mandatory courses and the first ones will land within the week.
            </p>
            <Link href="/org/courses/admin" className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground hover:bg-primary-hover">
              Assign training
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[15px]">
                <thead>
                  <tr className="border-b text-left text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3.5">#</th>
                    <th className="px-4 py-3.5">Name</th>
                    <th className="px-4 py-3.5 text-right">Stars</th>
                    <th className="px-4 py-3.5">{period === "all" ? "Share" : STAR_PERIODS.find((p) => p.key === period)!.label}</th>
                    <th className="px-4 py-3.5 text-right">Courses passed</th>
                    <th className="px-4 py-3.5">Last star</th>
                    <th className="px-4 py-3.5"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s, i) => (
                    <tr key={s.id} className="border-b last:border-b-0 transition-colors hover:bg-background">
                      <td className="px-4 py-3.5">
                        <span className={`inline-grid size-[34px] place-items-center rounded-[10px] text-[15px] font-extrabold tabular-nums ${i < 3 && !byGain ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link href={`/org/staff/${s.id}?section=stars`} className="flex min-w-0 items-center gap-3 font-normal text-foreground">
                          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar text-[13px] font-extrabold text-sidebar-foreground">
                            {initials(s.name, null)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-bold">{s.name}</span>
                            <span className="block text-[13px] text-muted-foreground">{s.role}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1.5 text-[17px] font-extrabold tabular-nums">
                          <Star className="size-4" fill="#f59e0b" stroke="#f59e0b" aria-hidden />
                          {s.total.toLocaleString("en-GB")}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex min-w-[160px] items-center gap-2.5">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                            <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round((s.gain / maxGain) * 100)}%` }} />
                          </div>
                          <b className={`min-w-9 text-right font-bold tabular-nums ${s.gain === 0 ? "text-muted-foreground" : ""}`}>+{s.gain}</b>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{s.coursesPassed}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">{whenLabel(s.lastStarAt, now, fmt)}</td>
                      <td className="px-4 py-3.5 text-muted-foreground" aria-hidden>›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3.5 text-sm text-muted-foreground">
              <span>
                Showing {shown.length} of {ranked.length}
                {ranked.length > SHOWN && (
                  <>
                    {" · "}
                    <Link href={href({ all: showAll ? undefined : "1" })} className="font-bold text-primary hover:underline">
                      {showAll ? `Show the top ${SHOWN}` : "Show everyone"}
                    </Link>
                  </>
                )}
              </span>
              {period !== "all" && (
                <span>
                  Sorted by {byGain ? periodLabel : "total stars"}
                  {" · "}
                  <Link href={href({ sort: byGain ? undefined : "period" })} className="font-bold text-primary hover:underline">
                    {byGain ? "Sort by total" : `Sort by ${periodLabel}`}
                  </Link>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-6 max-w-[72ch] text-sm text-muted-foreground">
        A star is one right answer: up to 20 for each course&apos;s assessment, counting the best attempt in each compliance cycle, plus one for each question answered right along the way.
        Stars show effort and learning. They never count towards compliance, which stays on the{" "}
        <Link href="/org/learners/statistics" className="font-bold text-primary hover:underline">
          Training matrix
        </Link>
        .
      </p>
    </DashboardShell>
  );
}
