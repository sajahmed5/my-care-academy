import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/learner-ui";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";

const SOURCE: Record<string, string> = {
  manual: "Added by your manager",
  supervision: "From a supervision",
  competency: "From a spot check",
  complaint: "From a complaint",
  audit: "From an audit",
};

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "long", year: "numeric" });

/**
 * The actions a carer owns: what was agreed at a supervision or a spot check,
 * or what they were made responsible for on a complaint. A carer given an
 * action used to have nowhere to see it, so its email could only say who to
 * ask. Read only — record_actions_own_read lets a carer read their own rows
 * and nothing else, and ticking one off is their manager's call.
 *
 * Only the action itself is shown: never the record it came from, because a
 * carer never reads a supervision, spot check or complaint (CARER-FILE.md §9).
 */
export default async function MyActionsPage() {
  const context = await requireRole("learner");
  const supabase = await createClient();
  const { data } = await supabase
    .from("record_actions")
    .select("id, title, detail, due_date, source_type, completed_at")
    .eq("user_id", context.userId)
    .order("completed_at", { nullsFirst: true })
    .order("due_date", { nullsFirst: false })
    .limit(200);
  const rows = data ?? [];
  const open = rows.filter((r) => !r.completed_at);
  const done = rows.filter((r) => r.completed_at);
  const today = new Date().toISOString().slice(0, 10);
  // A complaint action carries a stage tag at the front of its detail; it is
  // bookkeeping, not something to show.
  const detailOf = (d: string | null) => (d ?? "").replace(/^\[(meeting:\d|plan)\]\s*/, "") || null;

  return (
    <DashboardShell title="My actions" context={context}>
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Things you have agreed to do, or been asked to do, by your manager. Your manager ticks each one off when it is done.
        </p>
        {open.length === 0 ? (
          <EmptyState title="Nothing outstanding">
            Anything you agree to do in a supervision, spot check or audit will be listed here.
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {open.map((a) => {
              const late = a.due_date && (a.due_date as string) < today;
              return (
                <Card key={a.id}>
                  <CardContent className="space-y-1 pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{a.title}</p>
                      {a.due_date && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${late ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground"}`}>
                          {late ? "Overdue · " : "By "}
                          {fmt(a.due_date as string)}
                        </span>
                      )}
                    </div>
                    {detailOf(a.detail as string | null) && <p className="text-sm text-muted-foreground">{detailOf(a.detail as string | null)}</p>}
                    <p className="text-xs text-muted-foreground">{SOURCE[a.source_type as string] ?? "Action"}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {done.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Done ({done.length})</summary>
            <ul className="mt-2 divide-y text-sm">
              {done.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-muted-foreground line-through">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{fmt(a.completed_at as string)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </DashboardShell>
  );
}
