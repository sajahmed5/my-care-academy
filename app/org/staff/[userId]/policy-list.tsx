import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { loadReading } from "@/lib/policy-reading-data";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * The policies on a person's file (POLICIES.md, "Records"): each one that is
 * for them, with the version they accepted and when, or when it is due.
 * Loads its own rows, so the file page only reads them when this section is
 * open.
 */
export async function PersonPolicies({ organisationId, userId }: { organisationId: string; userId: string }) {
  const supabase = await createClient();
  const reading = await loadReading(supabase, organisationId, { userId });
  const copyOf = new Map(reading.copies.map((c) => [c.copyId, c]));
  const rank = (s: string) => (s === "late" ? 0 : s === "outstanding" ? 1 : 2);
  const entries = [...reading.entries].sort((a, b) => rank(a.status) - rank(b.status) || a.dueOn.localeCompare(b.dueOn));

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No published policy is set for them yet.{" "}
          <Link href="/org/policies" className="font-medium text-primary hover:underline">
            Policies
          </Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <div id="policies" className="scroll-mt-24 space-y-2">
      <Card>
        <CardContent className="divide-y p-0">
          {entries.map((e) => {
            const c = copyOf.get(e.copyId);
            return (
              <div key={e.copyId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <Link href={`/org/policies/${c?.code ?? ""}`} className="font-medium hover:underline">
                  {c?.title ?? "Policy"} <span className="text-xs font-normal text-muted-foreground">version {c?.version}</span>
                </Link>
                <span
                  className={`text-xs ${
                    e.status === "late" ? "font-medium text-rose-700" : e.status === "accepted" ? "text-green-700" : "text-muted-foreground"
                  }`}
                >
                  {e.status === "accepted"
                    ? `Accepted ${e.acceptedAt ? fmt(e.acceptedAt) : ""}`
                    : e.status === "late"
                      ? `Not accepted — was due ${fmt(e.dueOn)}`
                      : `To accept by ${fmt(e.dueOn)}`}
                  {e.status !== "accepted" && e.acceptedVersion != null ? ` (accepted version ${e.acceptedVersion})` : ""}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
