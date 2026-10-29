import Link from "next/link";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/learner-ui";
import { FolderOpen, Heart } from "lucide-react";
import { concernTrends, lastMonths, type Count, type TrendRow } from "@/lib/complaints/trends";

/**
 * Concerns over time, and what keeps coming up — by type, category, carer,
 * client and month — for CQC's well-led questions.
 */
export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "complaints.register");
  const { range } = await searchParams;
  const months = range === "24" ? 24 : 12;
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const today = new Date().toISOString().slice(0, 10);
  const window = lastMonths(today, months);
  const from = `${window[0]}-01`;

  // Paged: a busy company passes 1,000 concerns in two years, and the
  // silent cap would make the oldest months look quiet.
  const [raw, { count: compliments }] = await Promise.all([
    fetchAll((a, b) =>
      supabase
        .from("complaints")
        .select("id, kind, category, reported_on, client_id, client:clients (full_name), complaint_people (user_id, person:users!complaint_people_user_id_fkey (full_name, email))")
        .eq("organisation_id", orgId)
        .gte("reported_on", from)
        .neq("status", "cancelled")
        .order("id")
        .range(a, b),
    ),
    supabase.from("compliments").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).gte("received_on", from),
  ]);
  const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const rows: TrendRow[] = raw.map((r) => ({
    kind: r.kind as string,
    category: (r.category as string | null) ?? null,
    reportedOn: r.reported_on as string,
    clientId: (r.client_id as string | null) ?? null,
    clientName: (one(r.client as { full_name: string } | { full_name: string }[] | null)?.full_name as string | undefined) ?? null,
    people: ((r.complaint_people as { user_id: string; person: unknown }[] | null) ?? []).map((p) => {
      const u = one(p.person as { full_name?: string | null; email?: string | null } | null);
      return { userId: p.user_id, name: u?.full_name ?? u?.email ?? null };
    }),
  }));
  const t = concernTrends(rows, window);

  return (
    <DashboardShell title="Trends" context={context} back={{ href: "/org/complaints", label: "Complaints & safeguarding" }}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[12, 24].map((m) => (
            <Link
              key={m}
              href={`/org/complaints/trends${m === 12 ? "" : "?range=24"}`}
              className={`rounded-full border px-3 py-1 ${months === m ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              Last {m} months
            </Link>
          ))}
          <span className="text-xs text-muted-foreground">Cancelled records are left out.</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Concerns" value={t.total} icon={FolderOpen} color="#6366f1" href="/org/complaints" />
          <StatTile label="Compliments" value={compliments ?? 0} icon={Heart} color="#14b8a6" href="/org/complaints/compliments" />
        </div>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-semibold">Concerns by month</p>
            <MonthBars data={t.byMonth} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Ranked title="By type" data={t.byType} />
          <Ranked title="By what it was about" data={t.byCategory} />
          <Ranked title="Staff named most often" data={t.byCarer} limit={10} empty="Nobody has been named on a concern." />
          <Ranked title="Clients with the most concerns" data={t.byClient} limit={10} empty="No concern is linked to a client yet." />
        </div>
      </div>
    </DashboardShell>
  );
}

/** One measure per row, one hue: the length is the number, which is printed beside it. */
function Ranked({ title, data, limit, empty = "Nothing in this period." }: { title: string; data: Count[]; limit?: number; empty?: string }) {
  const shown = limit ? data.slice(0, limit) : data;
  const max = Math.max(1, ...shown.map((d) => d.count));
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="text-sm font-semibold">{title}</p>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {shown.map((d) => {
              const label = d.href ? <Link href={d.href} className="hover:underline">{d.label}</Link> : d.label;
              return (
                <li key={d.key} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-2 text-sm" title={`${d.label}: ${d.count}`}>
                  <span className="truncate">{label}</span>
                  <span className="h-3 rounded-r bg-muted/50">
                    <span className="block h-3 rounded-r bg-indigo-500" style={{ width: `${(d.count / max) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">{d.count}</span>
                </li>
              );
            })}
          </ul>
        )}
        {limit && data.length > limit && <p className="text-xs text-muted-foreground">And {data.length - limit} more.</p>}
      </CardContent>
    </Card>
  );
}

/** Columns from a zero baseline, one per month; the count shows on hover and in the table below. */
function MonthBars({ data }: { data: Count[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-2">
      <div className="flex h-40 items-end gap-1 border-b">
        {data.map((d) => (
          <div key={d.key} className="group relative flex h-full flex-1 items-end" title={`${d.label}: ${d.count}`}>
            <div className="w-full rounded-t bg-indigo-500 group-hover:bg-indigo-700" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }} />
            <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-foreground px-1 text-xs text-background group-hover:block">{d.count}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1 text-[10px] text-muted-foreground">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center">{d.label}</span>
        ))}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">As a table</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-t">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
