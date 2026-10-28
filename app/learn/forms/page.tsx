import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { loadAssignmentsForPerson } from "@/lib/form-library";
import { formatDate } from "@/lib/dates";

function fmtDate(d: string | null): string {
  if (!d) return "no date";
  return formatDate(d, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The forms a carer has been asked to complete. Open ones first — that is the
 * only reason they open this — with the completed ones kept as their record.
 *
 * No feature gate on the read: if a manager has asked, the ask stands. RLS
 * returns only this person's own.
 */
export default async function LearnerFormsPage() {
  const context = await requireRole("learner");
  const supabase = await createClient();
  const all = await loadAssignmentsForPerson(supabase, context.userId);
  const open = all.filter((a) => !a.completed_at);
  const done = all.filter((a) => a.completed_at);

  return (
    <DashboardShell title="Forms" context={context}>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">To complete ({open.length})</h3>
          {open.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nothing to complete.
              </CardContent>
            </Card>
          ) : (
            open.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6">
                  <div className="flex items-start gap-3">
                    <ClipboardList className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <Link href={`/learn/forms/${a.id}`} className="font-medium hover:underline">
                        {a.template_title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Due {fmtDate(a.due_date)}
                        {a.note ? ` · ${a.note}` : ""}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        {done.length > 0 && (
          <details className="rounded-lg border bg-muted/20 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Completed ({done.length})</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {done.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span>{a.template_title}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(a.completed_at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </DashboardShell>
  );
}
