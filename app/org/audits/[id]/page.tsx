import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { auditKind, type AuditAnswer } from "@/lib/audits";
import { formatDate } from "@/lib/dates";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "long", year: "numeric" });
const LABEL: Record<AuditAnswer, string> = { yes: "Yes", no: "No", na: "N/A" };

/** One audit, read back: every answer, the findings, and the actions they became. */
export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: audit }, { data: actions }] = await Promise.all([
    supabase
      .from("audits")
      .select("id, kind, subject, held_on, answers, score, notes, next_due, auditor:users!audits_auditor_id_fkey (full_name, email)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("record_actions")
      .select("id, title, due_date, completed_at, owner:users!record_actions_user_id_fkey (full_name, email)")
      .eq("source_type", "audit")
      .eq("source_id", id),
  ]);
  if (!audit) notFound();
  const kind = auditKind(audit.kind as string);
  const answers = (audit.answers as Record<string, AuditAnswer>) ?? {};
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const auditor = one(audit.auditor as { full_name?: string | null; email?: string | null } | null);

  return (
    <DashboardShell title={kind?.label ?? "Audit"} context={context}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/org/audits" className="text-sm text-muted-foreground hover:underline">
          ← Audits
        </Link>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{kind?.label ?? (audit.kind as string)}</h2>
          <p className="text-sm text-muted-foreground">
            {fmt(audit.held_on as string)}
            {auditor ? ` · by ${auditor.full_name || auditor.email}` : ""}
            {audit.subject ? ` · ${audit.subject}` : ""}
            {audit.score !== null ? ` · ${audit.score}% met` : ""}
            {audit.next_due ? ` · next due ${fmt(audit.next_due as string)}` : ""}
          </p>
        </div>
        <Card>
          <CardContent className="divide-y pt-6">
            {(kind?.questions ?? []).map((q, i) => (
              <div key={q.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span>
                  {i + 1}. {q.text}
                </span>
                <span className={`shrink-0 text-xs font-medium ${answers[q.id] === "no" ? "text-rose-700" : "text-muted-foreground"}`}>
                  {answers[q.id] ? LABEL[answers[q.id]] : "—"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        {audit.notes && (
          <Card>
            <CardContent className="whitespace-pre-wrap pt-6 text-sm">{audit.notes as string}</CardContent>
          </Card>
        )}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Actions from this audit</h3>
          {(actions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="divide-y rounded-lg border text-sm">
              {(actions ?? []).map((a) => {
                const owner = one(a.owner as { full_name?: string | null; email?: string | null } | null);
                return (
                  <li key={a.id as string} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className={a.completed_at ? "text-muted-foreground line-through" : ""}>{a.title as string}</span>
                    <span className="text-xs text-muted-foreground">
                      {owner?.full_name || owner?.email || "—"}
                      {a.due_date ? ` · by ${fmt(a.due_date as string)}` : ""}
                      {a.completed_at ? " · done" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
