import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/entitlements";
import type { UserContext } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { addDays } from "@/lib/hr/probation";
import { overlaps } from "@/lib/hr/holidays";

const fmt = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" });

/**
 * Who's off today and this week, on the Overview (HR-PACK.md): approved
 * leave and anyone off sick. Nothing when the company hasn't the HR pack.
 */
export async function WhosOff({ context }: { context: UserContext }) {
  if (!(await hasFeature(context, "recruitment.tracker"))) return null;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = addDays(today, 6);
  const [{ data: leave }, { data: sick }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id, user_id, start_date, end_date, users(full_name, email)")
      .eq("organisation_id", context.organisationId!)
      .eq("status", "approved")
      .lte("start_date", weekEnd)
      .gte("end_date", today)
      .order("start_date")
      .limit(200),
    supabase
      .from("sickness_absences")
      .select("id, user_id, start_date, users(full_name, email)")
      .eq("organisation_id", context.organisationId!)
      .is("returned_on", null)
      .limit(200),
  ]);
  const name = (u: unknown) => {
    const p = (Array.isArray(u) ? u[0] : u) as { full_name: string | null; email: string | null } | null;
    return p?.full_name || p?.email || "Someone";
  };
  const today_ = (leave ?? []).filter((r) => overlaps(r as never, today, today));
  const later = (leave ?? []).filter((r) => !today_.includes(r));
  if (!leave?.length && !sick?.length) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Who&apos;s off</h2>
        <p className="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          Nobody is on leave or off sick this week. <Link href="/org/hr/holidays" className="font-medium text-primary hover:underline">Holidays</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Who&apos;s off</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-card px-5 py-4 text-sm">
          <p className="font-semibold">Today</p>
          <ul className="mt-1 space-y-0.5">
            {today_.map((r) => (
              <li key={r.id as string}>{name(r.users)} <span className="text-muted-foreground">· on leave to {fmt(r.end_date as string)}</span></li>
            ))}
            {(sick ?? []).map((r) => (
              <li key={r.id as string}>{name(r.users)} <span className="text-muted-foreground">· off sick since {fmt(r.start_date as string)}</span></li>
            ))}
            {!today_.length && !sick?.length && <li className="text-muted-foreground">Nobody.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card px-5 py-4 text-sm">
          <p className="font-semibold">Later this week</p>
          <ul className="mt-1 space-y-0.5">
            {later.map((r) => (
              <li key={r.id as string}>{name(r.users)} <span className="text-muted-foreground">· {fmt(r.start_date as string)} to {fmt(r.end_date as string)}</span></li>
            ))}
            {!later.length && <li className="text-muted-foreground">Nobody.</li>}
          </ul>
          <Link href="/org/hr/holidays" className="mt-2 inline-block font-medium text-primary hover:underline">The holiday calendar</Link>
        </div>
      </div>
    </section>
  );
}
