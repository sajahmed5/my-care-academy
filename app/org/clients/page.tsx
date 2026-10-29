import Link from "next/link";
import { Pill, Search, Upload, UserPlus } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { funderLabel } from "@/lib/clients";
import { formatDate } from "@/lib/dates";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/learner-ui";
import { buttonVariants } from "@/components/ui/button";

const fmt = (d: string | null) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * The client list (PACKAGES.md, Clients, 29 Oct 2026): who the service cares
 * for, searchable, current clients first. Spot checks, QAs and concerns link
 * to these people as those features are built.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string; region?: string }>;
}) {
  const context = await requireConsole();
  await requireFeature(context, "clients.list");
  const { q = "", show = "active", region = "" } = await searchParams;

  const supabase = await createClient();
  const all = await fetchAll((f, t) =>
    supabase
      .from("clients")
      .select("id, full_name, date_of_birth, region, postcode, funder_type, funder_name, medication_support, start_date, status")
      .eq("organisation_id", context.organisationId!)
      .order("full_name")
      .order("id")
      .range(f, t),
  );
  const regions = [...new Set(all.map((c) => c.region as string | null).filter(Boolean) as string[])].sort();
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (c) =>
      (show === "all" || c.status === show) &&
      (!region || c.region === region) &&
      (!needle ||
        (c.full_name as string).toLowerCase().includes(needle) ||
        ((c.postcode as string | null) ?? "").toLowerCase().includes(needle)),
  );
  const activeCount = all.filter((c) => c.status === "active").length;

  return (
    <DashboardShell title="Clients" context={context}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-auto text-sm text-muted-foreground">
            {activeCount} current client{activeCount === 1 ? "" : "s"}
            {all.length > activeCount && `, ${all.length - activeCount} ended`}
          </p>
          <Link href="/org/clients/import" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Upload className="size-4" aria-hidden="true" /> Upload a spreadsheet
          </Link>
          <Link href="/org/clients/new" className={buttonVariants({ size: "lg" })}>
            <UserPlus className="size-4" aria-hidden="true" /> Add a client
          </Link>
        </div>

        {all.length === 0 ? (
          <EmptyState title="No clients yet" icon={UserPlus}>
            Upload your client list from a spreadsheet, or add clients one by one.
          </EmptyState>
        ) : (
          <>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <div className="relative min-w-60 flex-1">
                <label htmlFor="q" className="sr-only">Search by name or postcode</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="q"
                  name="q"
                  defaultValue={q}
                  placeholder="Search by name or postcode"
                  className="h-11 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
              {regions.length > 0 && (
                <div>
                  <label htmlFor="region" className="block text-xs text-muted-foreground">Region</label>
                  <select id="region" name="region" defaultValue={region} className="h-11 rounded-lg border bg-background px-3 text-sm">
                    <option value="">All regions</option>
                    {regions.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="show" className="block text-xs text-muted-foreground">Show</label>
                <select id="show" name="show" defaultValue={show} className="h-11 rounded-lg border bg-background px-3 text-sm">
                  <option value="active">Current clients</option>
                  <option value="ended">Ended</option>
                  <option value="all">Everyone</option>
                </select>
              </div>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "lg" })}>Show</button>
            </form>

            <div className="overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Date of birth</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Region</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Funded by</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Medication</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id as string} className="border-b last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <Link href={`/org/clients/${c.id}`} className="font-medium text-foreground hover:underline">
                          {c.full_name as string}
                        </Link>
                        {c.status === "ended" && <span className="ml-2 text-xs text-muted-foreground">Ended</span>}
                        {c.postcode && <span className="block text-xs text-muted-foreground">{c.postcode as string}</span>}
                      </th>
                      <td className="px-3 py-3">{fmt(c.date_of_birth as string | null)}</td>
                      <td className="px-3 py-3">{(c.region as string | null) ?? "—"}</td>
                      <td className="px-3 py-3">{funderLabel(c.funder_type as string, c.funder_name as string | null)}</td>
                      <td className="px-3 py-3">
                        {c.medication_support ? (
                          <span className="inline-flex items-center gap-1.5"><Pill className="size-4 text-primary" aria-hidden="true" />We help</span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="px-3 py-3">{fmt(c.start_date as string | null)}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No clients match.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
