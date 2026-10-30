import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { auditKind } from "@/lib/audits";
import { answerLabel, itemFindings, legacyItems, type AuditItem } from "@/lib/service-audits";
import { formatDate } from "@/lib/dates";
import { reviewAuditAction } from "../actions";
import { ReviewForm } from "../review-form";
import { ReviewChip } from "../review-chip";
import { AutoTable } from "../auto-table";
import type { AutoSnapshot } from "@/lib/auto-audits";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "long", year: "numeric" });
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
type Person = { full_name?: string | null; email?: string | null } | null;
const nameOf = (p: Person) => p?.full_name || p?.email || null;

/** One audit, read back: every answer and photo, the findings and the actions they became, the sign-off and any review. */
export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: audit }, { data: actions }] = await Promise.all([
    supabase
      .from("audits")
      .select(
        "id, kind, title, subject, client_id, client_name, held_on, answers, items, auto, score, notes, next_due, auditor_signature, auditor_signed_name, auditor_signed_at, review_status, review_below, reviewed_at, review_note, auditor:users!audits_auditor_id_fkey (full_name, email), reviewer:users!audits_reviewed_by_fkey (full_name, email)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("record_actions")
      .select("id, title, due_date, completed_at, owner:users!record_actions_user_id_fkey (full_name, email)")
      .eq("source_type", "audit")
      .eq("source_id", id),
  ]);
  if (!audit) notFound();
  const stored = (audit.items as AuditItem[] | null) ?? [];
  const items = stored.length ? stored : legacyItems(audit.kind as string, (audit.answers as Record<string, unknown>) ?? {});
  const title = (audit.title as string | null) ?? auditKind(audit.kind as string)?.label ?? "Audit";
  const auditor = nameOf(one(audit.auditor as Person));
  const reviewer = nameOf(one(audit.reviewer as Person));
  const findings = new Set(itemFindings(items).map((f) => f.id));

  // Photos are private: each is shown through a link that lasts an hour.
  const paths = items.flatMap((i) => (i.photo ? [i.photo] : []));
  const photoUrls = new Map<string, string>();
  if (paths.length) {
    const { data } = await createAdminClient().storage.from("service-audit-photos").createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) photoUrls.set(s.path, s.signedUrl);
  }

  return (
    <DashboardShell title={title} context={context} back={{ href: "/org/audits", label: "Audits" }}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {fmt(audit.held_on as string)}
            {auditor ? ` · by ${auditor}` : ""}
            {audit.client_id ? (
              <>
                {" · "}
                <Link href={`/org/clients/${audit.client_id}`} className="underline">
                  {audit.client_name as string}
                </Link>
              </>
            ) : audit.subject ? (
              ` · ${audit.subject}`
            ) : (
              ""
            )}
            {audit.score !== null ? ` · ${audit.score}% met` : ""}
            {audit.next_due ? ` · next due ${fmt(audit.next_due as string)}` : ""}
          </p>
          <ReviewChip status={audit.review_status as string} />
        </div>

        {audit.review_status === "waiting" && (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm">
                This scored below {audit.review_below as number}%, so it waits for a manager to review it.
              </p>
              {context.role === "org_admin" ? (
                <ReviewForm id={id} action={reviewAuditAction} />
              ) : (
                <p className="text-sm text-muted-foreground">A manager will review it.</p>
              )}
            </CardContent>
          </Card>
        )}
        {audit.review_status === "reviewed" && (
          <Card>
            <CardContent className="space-y-1 pt-6 text-sm">
              <p className="font-medium">
                Reviewed{reviewer ? ` by ${reviewer}` : ""}
                {audit.reviewed_at ? ` on ${fmt(audit.reviewed_at as string)}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">{audit.review_note as string}</p>
            </CardContent>
          </Card>
        )}

        {audit.auto && <AutoTable snapshot={audit.auto as AutoSnapshot} />}

        {items.length > 0 && (
          <Card>
            <CardContent className="divide-y pt-2">
              {items.map((q, i) => (
                <div key={q.id} className="space-y-1 py-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      {i + 1}. {q.label}
                    </span>
                    {q.type !== "text" && q.type !== "photo" && (
                      <span className={`shrink-0 text-xs font-medium ${findings.has(q.id) ? "text-rose-700" : "text-muted-foreground"}`}>
                        {answerLabel(q)}
                      </span>
                    )}
                  </div>
                  {q.type === "text" && <p className="whitespace-pre-wrap text-muted-foreground">{answerLabel(q)}</p>}
                  {q.type === "photo" &&
                    (q.photo && photoUrls.get(q.photo) ? (
                      <a href={photoUrls.get(q.photo)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed link */}
                        <img src={photoUrls.get(q.photo)} alt={q.label} className="max-h-56 rounded-lg border" />
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">No photo taken.</p>
                    ))}
                  {q.comment && <p className="text-xs text-muted-foreground">{q.comment}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

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
              {(actions ?? []).map((a) => (
                <li key={a.id as string} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className={a.completed_at ? "text-muted-foreground line-through" : ""}>{a.title as string}</span>
                  <span className="text-xs text-muted-foreground">
                    {nameOf(one(a.owner as Person)) ?? "—"}
                    {a.due_date ? ` · by ${fmt(a.due_date as string)}` : ""}
                    {a.completed_at ? " · done" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {audit.auditor_signature && (
          <div className="space-y-1 text-sm">
            <h3 className="font-semibold">Signed off</h3>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL */}
            <img src={audit.auditor_signature as string} alt={`Signature of ${audit.auditor_signed_name as string}`} className="h-16 rounded border bg-white" />
            <p className="text-xs text-muted-foreground">
              {audit.auditor_signed_name as string}
              {audit.auditor_signed_at ? `, ${fmt(audit.auditor_signed_at as string)}` : ""}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
