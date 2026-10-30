import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { hasFeature, requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { answerLabel, type AuditItem } from "@/lib/service-audits";
import { QA_HEADINGS, qaWho, type QaHeading } from "@/lib/client-qa";
import { formatDate } from "@/lib/dates";
import { reviewQaAction } from "../actions";
import { ReviewForm } from "../../review-form";
import { ReviewChip } from "../../review-chip";
import { ComplimentButton, ConcernButton } from "./one-click";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "long", year: "numeric" });
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
type Person = { full_name?: string | null; email?: string | null } | null;
const nameOf = (p: Person) => p?.full_name || p?.email || null;

/** One client QA, read back, with what it led to: the review, a compliment, a concern, actions. */
export default async function ClientQaPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "quality.audits");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: qa }, { data: actions }, complaintsOn] = await Promise.all([
    supabase
      .from("client_qas")
      .select(
        "*, auditor:users!client_qas_auditor_id_fkey (full_name, email), reviewer:users!client_qas_reviewed_by_fkey (full_name, email), complaint:complaints (id, reference)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("record_actions")
      .select("id, title, due_date, completed_at, owner:users!record_actions_user_id_fkey (full_name, email)")
      .eq("source_type", "client_qa")
      .eq("source_id", id),
    hasFeature(context, "complaints.register"),
  ]);
  if (!qa) notFound();
  const { data: carers } = complaintsOn && qa.went_well && !qa.compliment_id
    ? {
        data: await fetchAll((f, t) =>
          supabase
            .from("users")
            .select("id, full_name, email")
            .eq("organisation_id", context.organisationId!)
            .eq("role", "learner")
            .eq("status", "active")
            .order("full_name")
            .order("id")
            .range(f, t),
        ),
      }
    : { data: [] };
  const complaint = one(qa.complaint as { id: string; reference: string } | null);
  const medication = (qa.medication as AuditItem[] | null) ?? [];
  const extra = (qa.extra as AuditItem[] | null) ?? [];

  return (
    <DashboardShell title="Client QA" context={context} back={{ href: "/org/audits", label: "Audits" }}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">
            Client QA{" "}
            {qa.client_id ? (
              <Link href={`/org/clients/${qa.client_id}`} className="underline">
                {qa.client_name as string}
              </Link>
            ) : (
              (qa.client_name as string)
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {fmt(qa.held_on as string)} · {qa.method === "phone" ? "phone call" : "visit"}
            {qa.completed ? ` with ${qaWho(qa as never)}` : " — couldn't be done"}
            {nameOf(one(qa.auditor as Person)) ? ` · by ${nameOf(one(qa.auditor as Person))}` : ""}
            {qa.score !== null ? ` · ${qa.score}%` : ""}
            {qa.next_due ? ` · next due ${fmt(qa.next_due as string)}` : ""}
          </p>
          <ReviewChip status={qa.review_status as string} />
        </div>

        {qa.review_status === "waiting" && (
          <Card className="border-amber-300 bg-amber-50/50">
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm">This scored below {qa.review_below as number}%, so it waits for a manager to review it.</p>
              {context.role === "org_admin" ? <ReviewForm id={id} action={reviewQaAction} /> : <p className="text-sm text-muted-foreground">A manager will review it.</p>}
            </CardContent>
          </Card>
        )}
        {qa.review_status === "reviewed" && (
          <Card>
            <CardContent className="space-y-1 pt-6 text-sm">
              <p className="font-medium">
                Reviewed{nameOf(one(qa.reviewer as Person)) ? ` by ${nameOf(one(qa.reviewer as Person))}` : ""}
                {qa.reviewed_at ? ` on ${fmt(qa.reviewed_at as string)}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">{qa.review_note as string}</p>
            </CardContent>
          </Card>
        )}

        {!qa.completed ? (
          <Card>
            <CardContent className="space-y-1 pt-6 text-sm">
              <p className="font-medium">Why it couldn&apos;t be done</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{qa.not_done_reason as string}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-3 pt-6 sm:grid-cols-5">
                {QA_HEADINGS.map((h) => {
                  const v = qa[h.key as QaHeading] as number;
                  return (
                    <div key={h.key} className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">{h.label}</p>
                      <p className={`text-2xl font-semibold ${v <= 4 ? "text-rose-700" : ""}`}>{v}</p>
                      <p className="text-xs text-muted-foreground">of 10</p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {[
              { title: "Medication", list: medication },
              { title: "Your questions", list: extra },
            ].map(
              (s) =>
                s.list.length > 0 && (
                  <section key={s.title} className="space-y-2">
                    <h3 className="text-sm font-semibold">{s.title}</h3>
                    <Card>
                      <CardContent className="divide-y pt-2">
                        {s.list.map((q) => (
                          <div key={q.id} className="space-y-1 py-2 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <span>{q.label}</span>
                              {q.type !== "text" && (
                                <span className={`shrink-0 text-xs font-medium ${q.answer === "no" ? "text-rose-700" : "text-muted-foreground"}`}>{answerLabel(q)}</span>
                              )}
                            </div>
                            {q.type === "text" && <p className="whitespace-pre-wrap text-muted-foreground">{answerLabel(q)}</p>}
                            {q.comment && <p className="text-xs text-muted-foreground">{q.comment}</p>}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </section>
                ),
            )}

            <Card>
              <CardContent className="space-y-4 pt-6 text-sm">
                <div className="space-y-1">
                  <p className="font-medium">What do we do well?</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{(qa.went_well as string | null) || "—"}</p>
                  {complaintsOn && qa.went_well && (
                    qa.compliment_id ? (
                      <p className="text-xs text-green-700">
                        In the <Link href="/org/complaints/compliments" className="underline">compliments log</Link>.
                      </p>
                    ) : (
                      <ComplimentButton id={id} carers={(carers ?? []).map((u) => ({ id: u.id as string, name: (u.full_name as string | null) || (u.email as string) }))} />
                    )
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-medium">What can we do better?</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{(qa.do_better as string | null) || "—"}</p>
                  {complaintsOn &&
                    (complaint ? (
                      <p className="text-xs">
                        Raised as a concern:{" "}
                        <Link href={`/org/complaints/${complaint.id}`} className="font-mono underline">
                          {complaint.reference}
                        </Link>
                      </p>
                    ) : (
                      <ConcernButton id={id} />
                    ))}
                </div>
                <div className="space-y-1">
                  <p className="font-medium">Action plan for the office</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{(qa.action_plan as string | null) || "—"}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Actions from this QA</h3>
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

        {qa.auditor_signature && (
          <div className="space-y-1 text-sm">
            <h3 className="font-semibold">Signed off</h3>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data URL */}
            <img src={qa.auditor_signature as string} alt={`Signature of ${qa.auditor_signed_name as string}`} className="h-16 rounded border bg-white" />
            <p className="text-xs text-muted-foreground">
              {qa.auditor_signed_name as string}
              {qa.auditor_signed_at ? `, ${fmt(qa.auditor_signed_at as string)}` : ""}
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
