import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DUE_GROUP_LABEL, DUE_ORDER, type DueRowStatus } from "@/lib/due-view";
import type { ClientDueRow } from "@/lib/service-audits";
import { formatDate } from "@/lib/dates";

const CHIP: Record<DueRowStatus, string> = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  never: "bg-rose-50 text-rose-700",
  none: "bg-muted text-muted-foreground",
  scheduled: "bg-muted text-muted-foreground",
};

const fmt = (d: string | null) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * Every current client, grouped by where their next audit or QA stands. Each
 * row opens the form for that client, ready to carry it out.
 */
export function ClientDueList({ rows, href, noun }: { rows: ClientDueRow[]; href: (clientId: string) => string; noun: string }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">No current clients this applies to.</CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {DUE_ORDER.map((s) => {
          const n = rows.filter((r) => r.status === s).length;
          if (!n) return null;
          return (
            <a key={s} href={`#${s}`} className={`rounded-full px-3 py-1 text-sm ${CHIP[s]}`}>
              {s === "never" ? "Never done" : DUE_GROUP_LABEL[s]} · {n}
            </a>
          );
        })}
      </div>
      {DUE_ORDER.map((s) => {
        const group = rows.filter((r) => r.status === s);
        if (!group.length) return null;
        return (
          <section key={s} id={s} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {s === "never" ? "Never done" : DUE_GROUP_LABEL[s]} ({group.length})
            </h3>
            <Card>
              <CardContent className="divide-y p-0">
                {group.map((r) => (
                  <Link
                    key={r.client.id}
                    href={href(r.client.id)}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span>
                      <span className="font-medium text-primary">{r.client.name}</span>
                      {r.client.region && <span className="ml-2 text-xs text-muted-foreground">{r.client.region}</span>}
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Last {noun}: {fmt(r.last)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${CHIP[r.status]}`}>
                        {r.status === "never" ? "Due now" : r.next ? `Next ${fmt(r.next)}` : "No date set"}
                      </span>
                      <ChevronRight className="size-4" aria-hidden />
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
