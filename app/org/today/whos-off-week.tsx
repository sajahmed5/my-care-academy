import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { UserContext } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { addDays } from "@/lib/hr/probation";
import { leaveTypeLabel, overlaps } from "@/lib/hr/holidays";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/initials";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Who's off this week, as a seven-day strip (redesign, 1 Nov 2026): a dot
 * under each day somebody is away, and under it who and why. Approved
 * leave and anyone off sick, from today. Nothing without the HR pack.
 */
export async function WhosOffWeek({ context }: { context: UserContext }) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = addDays(today, 6);
  const [{ data: leave }, { data: sick }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, user_id, start_date, end_date, leave_type, users!leave_requests_user_id_fkey(full_name, email)")
      .eq("organisation_id", context.organisationId!)
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", today)
      .order("start_date")
      .limit(200),
    supabase
      .from("sickness_absences")
      .select("id, user_id, start_date, users!sickness_absences_user_id_fkey(full_name, email)")
      .eq("organisation_id", context.organisationId!)
      .is("returned_on", null)
      .limit(200),
  ]);
  const who = (u: unknown) => {
    const p = (Array.isArray(u) ? u[0] : u) as { full_name: string | null; email: string | null } | null;
    return { name: p?.full_name || p?.email || "Someone", email: p?.email ?? null };
  };
  type Away = { id: string; name: string; email: string | null; why: string; from: string; to: string };
  const away: Away[] = [
    ...(leave ?? []).map((r) => ({
      id: r.id as string,
      ...who(r.users),
      why: leaveTypeLabel((r.leave_type as string | null) ?? "holiday").toLowerCase(),
      from: r.start_date as string,
      to: r.end_date as string,
    })),
    ...(sick ?? []).map((r) => ({ id: r.id as string, ...who(r.users), why: "off sick", from: r.start_date as string, to: weekEnd })),
  ];
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const span = (a: Away) => {
    const from = a.from < today ? today : a.from;
    const to = a.to > weekEnd ? weekEnd : a.to;
    const f = formatDate(from, { weekday: "short" });
    const t = formatDate(to, { weekday: "short" });
    return from === to ? f : `${f}–${t}`;
  };

  return (
    <section aria-labelledby="whos-off-heading" className="rounded-card border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="whos-off-heading" className="text-lg font-extrabold tracking-tight">
          Who&apos;s off this week
        </h2>
        <Link href="/org/hr/holidays" className="text-sm font-bold text-primary hover:underline">
          Calendar
        </Link>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const date = new Date(d + "T00:00:00Z");
          const busy = away.some((a) => overlaps({ start_date: a.from, end_date: a.to }, d, d));
          return (
            <li
              key={d}
              className={cn(
                "flex flex-col items-center rounded-xl border px-1 py-2 text-center",
                i === 0 ? "border-accent bg-accent text-accent-foreground" : "bg-background",
              )}
            >
              <span className="text-[11px] font-semibold text-muted-foreground">{DAY_LABEL[date.getUTCDay()]}</span>
              <span className="text-base font-extrabold">{date.getUTCDate()}</span>
              <span className={cn("mt-1 size-1.5 rounded-full", busy ? "bg-indigo-500" : "bg-transparent")} role={busy ? "img" : undefined} aria-label={busy ? "Someone is off" : undefined} />
            </li>
          );
        })}
      </ol>
      {away.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nobody is on leave or off sick this week.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {away.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-center gap-3 text-sm">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-800">
                {initials(a.name, a.email)}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{a.name}</span> <span className="text-muted-foreground">· {a.why}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{span(a)}</span>
            </li>
          ))}
          {away.length > 6 && (
            <li className="text-sm text-muted-foreground">
              and {away.length - 6} more —{" "}
              <Link href="/org/hr/holidays" className="font-semibold text-primary hover:underline">
                see the calendar
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
