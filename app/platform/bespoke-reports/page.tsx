import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestDue, RequestStatus } from "@/components/bespoke/request-parts";
import { frequencyLabel } from "@/lib/bespoke/requests";
import { REPORT_WORKING_DAYS, ukToday } from "@/lib/bespoke/working-days";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Bespoke reports" };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

interface Row {
  id: string;
  request_no: number;
  title: string;
  status: string;
  frequency: string;
  due_on: string;
  ready_at: string | null;
  created_at: string;
  organisation: { name: string } | { name: string }[] | null;
}

const COLUMNS = "id, request_no, title, status, frequency, due_on, ready_at, created_at, organisation:organisations (name)";

/**
 * Bespoke reports, our side (BESPOKE-REPORTS.md): every company's requests,
 * the open ones in the order they fall due against the 10-working-day
 * promise.
 */
export default async function BespokeReportsPage() {
  const context = await requireRole("platform_admin");
  const supabase = await createClient();
  const [{ data: open }, { data: done }] = await Promise.all([
    supabase.from("report_requests").select(COLUMNS).in("status", ["asked", "building"]).order("due_on").limit(500),
    supabase
      .from("report_requests")
      .select(COLUMNS)
      .in("status", ["ready", "withdrawn"])
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  const today = ukToday();

  return (
    <DashboardShell title="Bespoke reports" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Enterprise companies ask for reports on their Evidence &amp; exports page. Each is promised within{" "}
          {REPORT_WORKING_DAYS} working days of asking, weekends and bank holidays skipped.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>To build</CardTitle>
            <CardDescription>Asked or being built, the soonest due first.</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestTable rows={(open ?? []) as Row[]} today={today} empty="Nothing waiting." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Done</CardTitle>
            <CardDescription>Ready or withdrawn, most recent first.</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestTable rows={(done ?? []) as Row[]} today={today} empty="None yet." />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}

function RequestTable({ rows, today, empty }: { rows: Row[]; today: string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Request</th>
            <th className="py-2 pr-3 font-medium">Company</th>
            <th className="py-2 pr-3 font-medium">How often</th>
            <th className="py-2 pr-3 font-medium">Asked</th>
            <th className="py-2 pr-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-3">
                <Link href={`/platform/bespoke-reports/requests/${r.id}`} className="font-medium text-primary hover:underline">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">#{r.request_no}</span>
                  {r.title}
                </Link>
              </td>
              <td className="py-2 pr-3">{one(r.organisation)?.name ?? "—"}</td>
              <td className="py-2 pr-3">{frequencyLabel(r.frequency)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.created_at)}</td>
              <td className="py-2 pr-3">
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <RequestStatus status={r.status} />
                  <RequestDue request={r} today={today} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
