import Link from "next/link";
import { requireConsole, roleLabel } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { loadReading } from "@/lib/policy-reading-data";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * Who has read what (POLICIES.md, "Records"): each person and each policy
 * that is for them — the compliance view an inspector asks for, beside the
 * per-policy view on each policy's own page. People with something late come
 * first.
 */
export default async function PolicyPeoplePage() {
  const context = await requireConsole();
  await requireFeature(context, "documents.library");
  const supabase = await createClient();
  const reading = await loadReading(supabase, context.organisationId!);
  const copyOf = new Map(reading.copies.map((c) => [c.copyId, c]));

  const people = reading.people
    .map((p) => {
      const mine = reading.entries.filter((e) => e.userId === p.id);
      return {
        person: p,
        entries: mine.sort((a, b) =>
          a.status === b.status ? a.dueOn.localeCompare(b.dueOn) : order(a.status) - order(b.status),
        ),
        accepted: mine.filter((e) => e.status === "accepted").length,
        late: mine.filter((e) => e.status === "late").length,
      };
    })
    .filter((r) => r.entries.length > 0)
    .sort((a, b) => b.late - a.late || a.person.name.localeCompare(b.person.name));

  return (
    <DashboardShell title="Who has read what" context={context} back={{ href: "/org/policies", label: "Policies" }}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Everyone asked to read a published policy, and where each one stands. Open a person for the policies on their file.
        </p>
        {people.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nobody has been asked to read a policy yet — they are, as soon as one is published.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {people.map(({ person, entries, accepted, late }) => (
                <details key={person.id} className="group px-4 py-3 text-sm">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{person.name}</span>
                      {person.role !== "learner" && (
                        <span className="ml-2 text-xs text-muted-foreground">{roleLabel(person.role).toLowerCase()}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          accepted === entries.length ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {accepted} of {entries.length} accepted
                      </span>
                      {late > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">{late} late</span>}
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1 border-t pt-2">
                    {entries.map((e) => {
                      const c = copyOf.get(e.copyId);
                      return (
                        <li key={e.copyId} className="flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/org/policies/${c?.code ?? ""}`} className="hover:underline">
                            {c?.title ?? "Policy"} <span className="text-xs text-muted-foreground">v{c?.version}</span>
                          </Link>
                          <span
                            className={`text-xs ${
                              e.status === "late" ? "font-medium text-rose-700" : e.status === "accepted" ? "text-green-700" : "text-muted-foreground"
                            }`}
                          >
                            {e.status === "accepted"
                              ? `Accepted ${e.acceptedAt ? fmt(e.acceptedAt) : ""}`
                              : e.status === "late"
                                ? `Late — was due ${fmt(e.dueOn)}`
                                : `Due by ${fmt(e.dueOn)}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <Link href={`/org/staff/${person.id}?section=policies`} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                    Open their file
                  </Link>
                </details>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

function order(status: string): number {
  return status === "late" ? 0 : status === "outstanding" ? 1 : 2;
}
