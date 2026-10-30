import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { DueTabs } from "@/app/org/due/due-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { staffDocSummary, type StaffDoc } from "@/lib/staff-documents";
import { loadCurrentCarers } from "@/app/org/due/load";

/**
 * Documents across the company (HR-PACK.md, the documents page): who has a
 * document expired, expiring in the next 30 days, or missing. Each row opens
 * the person's documents page, where it is renewed.
 */
export default async function DocumentsDuePage() {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const supabase = await createClient();
  const orgId = context.organisationId!;
  const [people, docs] = await Promise.all([
    loadCurrentCarers(supabase, orgId, { withOffice: true }),
    fetchAll((f, t) =>
      supabase
        .from("staff_documents")
        .select("id, user_id, doc_type, file_name, file_path, expires_at, not_required, not_required_reason")
        .eq("organisation_id", orgId)
        .order("id")
        .range(f, t),
    ),
  ]);
  const now = new Date();
  const byPerson = new Map<string, StaffDoc[]>();
  for (const d of docs) {
    const list = byPerson.get(d.user_id as string) ?? [];
    list.push(d as unknown as StaffDoc);
    byPerson.set(d.user_id as string, list);
  }
  const rows = people
    .map((p) => ({ person: p, ...staffDocSummary(byPerson.get(p.id) ?? [], now) }))
    .filter((r) => r.expired.length + r.expiring.length + r.missing.length > 0)
    .sort((a, b) => b.expired.length - a.expired.length || b.expiring.length - a.expiring.length || a.person.name.localeCompare(b.person.name));
  const groups = [
    { key: "expired", title: "Expired", rows: rows.filter((r) => r.expired.length) },
    { key: "expiring", title: "Expiring in the next 30 days", rows: rows.filter((r) => !r.expired.length && r.expiring.length) },
    { key: "missing", title: "Missing from their file", rows: rows.filter((r) => !r.expired.length && !r.expiring.length) },
  ];

  return (
    <DashboardShell title="Who's due" context={context}>
      <div className="space-y-6">
        <DueTabs context={context} active="/org/hr/documents" />
        <p className="text-sm text-muted-foreground">
          Every current member of staff with a document expired, expiring soon or missing. Open someone to upload the new one, or mark it not needed.
        </p>
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">Everyone&apos;s documents are on file and in date.</CardContent>
          </Card>
        )}
        {groups.map((g) =>
          g.rows.length === 0 ? null : (
            <section key={g.key} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {g.title} ({g.rows.length})
              </h3>
              <Card>
                <CardContent className="divide-y p-0">
                  {g.rows.map((r) => (
                    <Link
                      key={r.person.id}
                      href={`/org/staff/${r.person.id}?section=documents`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium text-primary">{r.person.name}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs">
                        {r.expired.map((l) => (
                          <span key={l} className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">{l} expired</span>
                        ))}
                        {r.expiring.map((l) => (
                          <span key={l} className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">{l} expiring</span>
                        ))}
                        {r.missing.length > 0 && <span className="text-muted-foreground">Missing: {r.missing.join(", ")}</span>}
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </span>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </section>
          ),
        )}
      </div>
    </DashboardShell>
  );
}
