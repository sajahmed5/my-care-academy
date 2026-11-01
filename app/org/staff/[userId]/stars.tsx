import Link from "next/link";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { courseOf, loadCourseIndex, loadOrgPeople } from "@/lib/org-learners";
import { isStaff } from "@/lib/roles";
import {
  byCourse,
  loadStarRows,
  monthlySeries,
  periodBounds,
  starEvents,
  summarise,
  whenLabel,
  type StarEvent,
} from "@/lib/stars-console";

/**
 * The Stars section of a person's file: the stars they have banked month by
 * month, every one of them as a dated line, where they stand in the company,
 * and each course's share. Same maths as the leaderboard (lib/stars-console).
 * The +0 lines stay in the history on purpose: they are how the rules show
 * themselves (a retake while the best stands banks nothing).
 */
export async function PersonStars({
  organisationId,
  userId,
  name,
  sub,
}: {
  organisationId: string;
  userId: string;
  name: string;
  /** "assessments" narrows the history to assessment attempts. */
  sub?: string;
}) {
  const now = new Date();
  const supabase = await createClient();
  // The company's rows, not just this person's: the rank needs everyone.
  const [rows, people, courses] = await Promise.all([loadStarRows(supabase, organisationId), loadOrgPeople(supabase, organisationId), loadCourseIndex(supabase)]);
  const events = starEvents(rows.attempts, rows.certificates, rows.content);
  const mine = events.filter((e) => e.userId === userId);
  const bounds = periodBounds("quarter", now);
  const me = summarise(userId, mine, bounds);

  // Rank among current staff with a star, by total; nobody is "24th of 24"
  // for having none.
  const totals = new Map<string, number>();
  for (const e of events) totals.set(e.userId, (totals.get(e.userId) ?? 0) + e.delta);
  const ranked = [...people]
    .filter(([id, p]) => isStaff(p.role) && p.status !== "deactivated" && (totals.get(id) ?? 0) > 0)
    .map(([id]) => ({ id, total: totals.get(id) ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const rank = ranked.findIndex((r) => r.id === userId) + 1;

  const series = monthlySeries(mine, now);
  const perCourse = byCourse(mine);
  const expiryOf = new Map<string, string>();
  for (const c of rows.certificates) {
    if (c.user_id !== userId || !c.expires_at) continue;
    const cur = expiryOf.get(c.course_id);
    if (!cur || Date.parse(c.expires_at) > Date.parse(cur)) expiryOf.set(c.course_id, c.expires_at);
  }

  const assessmentsOnly = sub === "assessments";
  const history = mine.filter((e) => !assessmentsOnly || e.kind === "assessment").slice().reverse();
  const fmt = (iso: string) => formatDate(iso, { day: "numeric", month: "short", year: "numeric" });
  const when = (iso: string) => {
    const label = whenLabel(iso, now, fmt);
    return label === "Today" ? `Today, ${formatDateTime(iso, { hour: "2-digit", minute: "2-digit" })}` : label;
  };
  const base = `/org/staff/${userId}?section=stars`;
  const firstName = name.split(" ")[0] || name;

  if (mine.length === 0) {
    return (
      <div className="rounded-card border bg-card p-8 text-center">
        <p className="font-bold">No stars yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Stars land as {firstName} answers questions in their training: up to 20 for each course&apos;s assessment, and one for each question along the way.
        </p>
        <Link href={`/org/staff/${userId}?section=training#assign`} className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-4 text-[15px] font-bold text-primary-foreground hover:bg-primary-hover">
          Assign a course
        </Link>
      </div>
    );
  }

  // Chart: 12 bars to one scale, labelled with values it reaches.
  const peak = Math.max(1, ...series.map((m) => m.stars));
  const H = 120;
  const y = (v: number) => 140 - (v / peak) * H;
  const best = series.reduce((b, m) => (m.stars > b.stars ? m : b), series[0]);
  const thisMonth = series[series.length - 1];
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0 space-y-6">
        <div className="rounded-card border bg-card p-5 sm:p-6">
          <h3 className="text-lg font-extrabold tracking-tight">Stars over the last 12 months</h3>
          <p className="text-sm text-muted-foreground">
            {me.total.toLocaleString("en-GB")} in all
            {best.stars > 0 && best.month !== thisMonth.month && (
              <>
                {" · "}
                {best.stars} in {new Date(`${best.month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })}, the best month
              </>
            )}
            {" · "}
            {thisMonth.stars} so far this month
          </p>
          <svg
            viewBox="0 0 720 190"
            className="mt-3 block h-auto w-full"
            role="img"
            aria-label={`Stars earned each month: ${series.map((m) => `${m.label} ${m.stars}`).join(", ")}.`}
          >
            {(peak >= 2 ? [0, 0.5, 1] : [0, 1]).map((f) => (
              <g key={f}>
                <line x1="36" x2="708" y1={y(peak * f)} y2={y(peak * f)} className="stroke-border" strokeWidth="1" />
                <text x="30" y={y(peak * f) + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">
                  {Math.round(peak * f)}
                </text>
              </g>
            ))}
            {series.map((m, i) => {
              const x = 48 + i * 56;
              const h = (m.stars / peak) * H;
              const current = i === series.length - 1;
              return (
                <g key={m.month}>
                  <rect x={x} y={140 - h} width="36" height={h} rx="4" fill={current ? "var(--primary)" : "#f59e0b"} />
                  {m.stars > 0 && (
                    <text x={x + 18} y={140 - h - 6} textAnchor="middle" className="fill-foreground" fontSize="11" fontWeight="700">
                      {m.stars}
                    </text>
                  )}
                  <text x={x + 18} y="162" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
                    {m.label}
                  </text>
                  {(i === 0 || m.month.endsWith("-01")) && (
                    <text x={x + 18} y="178" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
                      {m.month.slice(0, 4)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
            <span>
              <i aria-hidden className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-amber-400 align-[-1px]" />
              Stars earned that month
            </span>
            <span>
              <i aria-hidden className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-primary align-[-1px]" />
              This month so far
            </span>
          </div>
        </div>

        <div className="rounded-card border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold tracking-tight">History</h3>
            <nav aria-label="Show" className="inline-flex rounded-xl bg-muted p-[3px]">
              {[
                { key: "", label: "Everything" },
                { key: "assessments", label: "Assessments only" },
              ].map((t) => {
                const on = (t.key === "assessments") === assessmentsOnly;
                return (
                  <Link
                    key={t.key}
                    href={t.key ? `${base}&sub=${t.key}` : base}
                    aria-current={on ? "page" : undefined}
                    className={on ? "rounded-[9px] bg-card px-3.5 py-1.5 text-sm font-bold text-foreground shadow-sm" : "rounded-[9px] px-3.5 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <ol className="mt-2">
            {history.map((e) => (
              <HistoryRow key={`${e.kind}-${e.courseId}-${e.at}`} event={e} course={courseOf(courses, e.courseId).title} when={when(e.at)} />
            ))}
          </ol>
          {history.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No assessment attempts yet.</p>}
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        <div className="rounded-card border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <p className="flex items-center gap-2 text-[44px] font-extrabold leading-none tabular-nums">
              <Star className="size-9" fill="#f59e0b" stroke="#f59e0b" aria-hidden />
              {me.total.toLocaleString("en-GB")}
            </p>
            <div>
              <p className="font-bold">{rank > 0 ? `${ordinal(rank)} of ${ranked.length}` : "Not ranked yet"}</p>
              <p className="text-sm text-muted-foreground">
                {rank > 0 ? (
                  <Link href="/org/learners/stars" className="font-bold text-primary hover:underline">
                    See the leaderboard →
                  </Link>
                ) : (
                  "Stars from questions along the way count; the first assessment will place them."
                )}
              </p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 border-t pt-4 text-[15px]">
            <dt className="text-muted-foreground">From assessments</dt>
            <dd className="text-right font-bold tabular-nums">{me.assessment}</dd>
            <dt className="text-muted-foreground">From questions along the way</dt>
            <dd className="text-right font-bold tabular-nums">{me.content}</dd>
            <dt className="text-muted-foreground">Courses passed</dt>
            <dd className="text-right font-bold tabular-nums">{me.coursesPassed}</dd>
            <dt className="text-muted-foreground">Renewed after expiry</dt>
            <dd className="text-right font-bold tabular-nums">{me.renewals}</dd>
            <dt className="text-muted-foreground">This quarter</dt>
            <dd className="text-right font-bold tabular-nums">+{me.gain}</dd>
            <dt className="text-muted-foreground">Last star</dt>
            <dd className="text-right font-bold">{whenLabel(me.lastStarAt, now, fmt)}</dd>
          </dl>
        </div>

        <div className="overflow-hidden rounded-card border bg-card">
          <div className="px-5 pt-5 pb-1.5 sm:px-6">
            <h3 className="font-bold">By course</h3>
            <p className="text-sm text-muted-foreground">Best attempt in the current cycle, out of the questions served</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-[15px]">
              <thead>
                <tr className="border-b text-left text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 sm:px-6">Course</th>
                  <th className="px-3 py-2.5 text-right">Best</th>
                  <th className="px-5 py-2.5 text-right sm:px-6">Stars</th>
                </tr>
              </thead>
              <tbody>
                {perCourse.map((c) => {
                  const expiry = expiryOf.get(c.courseId);
                  const renews = expiry && Date.parse(expiry) > now.getTime() ? `Renews ${fmt(expiry)}` : null;
                  const line = [
                    c.cycle > 1 ? `${ordinal(c.cycle)} cycle` : null,
                    renews,
                    !c.passed && c.attempts > 0 ? `Not passed yet · ${c.attempts} ${c.attempts === 1 ? "attempt" : "attempts"}` : c.attempts > 1 ? `${c.attempts} attempts` : null,
                    c.attempts === 0 ? "Assessment not taken" : null,
                    c.content > 0 ? `${c.content} along the way` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <tr key={c.courseId} className="border-b last:border-b-0">
                      <td className="px-5 py-2.5 sm:px-6">
                        <span className="block font-semibold">{courseOf(courses, c.courseId).title}</span>
                        {line && <span className="block text-[13px] text-muted-foreground">{line}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.attempts > 0 ? `${c.best}/${c.questions}` : "–"}</td>
                      <td className="px-5 py-2.5 text-right font-bold tabular-nums sm:px-6">{c.stars}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ event: e, course, when }: { event: StarEvent; course: string; when: string }) {
  const gained = e.delta > 0;
  let title: string;
  let detail: string;
  let tile: React.ReactNode;
  if (e.kind === "content") {
    title = `${course} · questions along the way`;
    detail = `${e.count} ${e.count === 1 ? "question" : "questions"} answered right on first try`;
    tile = <span className="inline-grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-[13px] font-extrabold text-accent-foreground">+{e.count}</span>;
  } else {
    const score = (
      <>
        {e.correct}
        <small className="font-semibold">/{e.questions}</small>
      </>
    );
    tile = (
      <span className={`inline-grid size-11 shrink-0 place-items-center rounded-xl text-[13px] font-extrabold ${gained ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
        {score}
      </span>
    );
    const result = e.passed ? "assessment passed" : "assessment not passed";
    switch (e.outcome) {
      case "first":
        title = `${course} · ${result}`;
        detail = `First attempt · ${e.correct} right banks ${e.delta} ${e.delta === 1 ? "star" : "stars"}${e.passed ? "" : " even on a fail"}`;
        break;
      case "improved":
        title = `${course} · ${result} on retake`;
        detail = `Best this cycle was ${e.bestBefore}, so only the ${e.delta} extra count`;
        break;
      case "renewal":
        title = `${course} · renewed after the certificate expired`;
        detail = `New compliance cycle · the stars from before are kept`;
        break;
      default:
        title = `${course} · assessment retaken`;
        detail = `${e.bestBefore} already banked this cycle · a retake adds only what it beats`;
    }
  }
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5 border-t py-3.5 first:border-t-0">
      {tile}
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      <div className="text-right">
        <p className={gained ? "inline-flex items-center gap-1.5 text-[17px] font-extrabold tabular-nums" : "text-[15px] font-semibold tabular-nums text-muted-foreground"}>
          {gained && <Star className="size-4" fill="#f59e0b" stroke="#f59e0b" aria-hidden />}+{e.delta}
        </p>
        <p className="whitespace-nowrap text-[13px] text-muted-foreground">{when}</p>
      </div>
    </li>
  );
}
