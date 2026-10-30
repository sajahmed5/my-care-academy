import Link from "next/link";
import { Plus } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { auditKind } from "@/lib/audits";
import { clientDueRows, type DueClient } from "@/lib/service-audits";
import { QA_HEADINGS, qaAsServiceForm, runHref, type QaHeading } from "@/lib/client-qa";
import { loadQaForm, loadReviewBelow, loadServiceForms } from "@/lib/service-audits-data";
import { HISTORY_LABEL, buildClientHistory, qaAverages, type HistoryInput, type QaRow } from "@/lib/client-history";
import { loadComplimentsForClient } from "@/lib/complaints/compliments";
import { kindLabel, statusLabel } from "@/lib/complaints/stages";
import { spotOutcomeLabel } from "@/lib/competency";
import { DUE_GROUP_LABEL } from "@/lib/due-view";
import { formatDate } from "@/lib/dates";

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const CHIP: Record<string, string> = {
  overdue: "bg-rose-100 text-rose-700",
  never: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  scheduled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

/**
 * The client page's quality record (SERVICE-AUDITS.md, The client page):
 * what's due for them, their QA ratings, and everything about them over
 * time — QAs, audits, spot checks, concerns and compliments — in one list.
 * Each part only where the company's package has it.
 */
export async function ClientQuality({
  supabase,
  organisationId,
  client,
  spotChecksOn,
  complaintsOn,
}: {
  supabase: SupabaseClient;
  organisationId: string;
  client: DueClient;
  spotChecksOn: boolean;
  complaintsOn: boolean;
}) {
  const id = client.id;
  const [forms, qaForm, reviewBelow, { data: qaRows }, { data: auditRows }, spot, concerns, compliments] = await Promise.all([
    loadServiceForms(organisationId),
    loadQaForm(organisationId),
    loadReviewBelow(organisationId),
    supabase
      .from("client_qas")
      .select("id, held_on, next_due, completed, method, score, review_status, safe, effective, caring, responsive, well_led")
      .eq("client_id", id)
      .order("held_on", { ascending: false })
      .limit(200),
    supabase.from("audits").select("id, kind, title, held_on, next_due, score, review_status").eq("client_id", id).order("held_on", { ascending: false }).limit(300),
    spotChecksOn
      ? supabase
          .from("spot_checks")
          .select("id, user_id, checked_on, outcome, carer:users!spot_checks_user_id_fkey (full_name, email)")
          .eq("client_id", id)
          .order("checked_on", { ascending: false })
          .limit(200)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    complaintsOn
      ? supabase
          .from("complaints")
          .select("id, reference, kind, status, reported_on, description")
          .eq("client_id", id)
          .order("reported_on", { ascending: false })
          .limit(200)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    complaintsOn ? loadComplimentsForClient(supabase, id) : Promise.resolve([]),
  ]);

  const qas: QaRow[] = (qaRows ?? []).map((q) => ({
    id: q.id as string,
    held_on: q.held_on as string,
    completed: !!q.completed,
    method: q.method as string,
    score: (q.score as number | null) ?? null,
    review_status: q.review_status as string,
    ratings: Object.fromEntries(QA_HEADINGS.map((h) => [h.key, (q[h.key as QaHeading] as number | null) ?? null])),
  }));
  const audits = auditRows ?? [];

  // What's due for this client: the QA, then each audit done client by client.
  const now = new Date();
  const due = [qaAsServiceForm(qaForm), ...forms.filter((f) => f.scope === "client")]
    .filter((f) => !f.medicationOnly || client.medicationSupport)
    .map((form) => {
      const records =
        form.key === "client_qa"
          ? (qaRows ?? []).map((q) => ({ id: q.id as string, clientId: id, heldOn: q.held_on as string, nextDue: (q.next_due as string | null) ?? null }))
          : audits.filter((a) => a.kind === form.key).map((a) => ({ id: a.id as string, clientId: id, heldOn: a.held_on as string, nextDue: (a.next_due as string | null) ?? null }));
      return { form, row: clientDueRows([client], records, now)[0] };
    });

  const input: HistoryInput = {
    qas,
    audits: audits.map((a) => ({
      id: a.id as string,
      title: (a.title as string | null) ?? auditKind(a.kind as string)?.label ?? (a.kind as string),
      held_on: a.held_on as string,
      score: (a.score as number | null) ?? null,
      review_status: a.review_status as string,
    })),
    spotChecks: spot.map((s) => {
      const carer = one(s.carer as { full_name?: string | null; email?: string | null } | null);
      return {
        id: s.id as string,
        userId: s.user_id as string,
        checked_on: s.checked_on as string,
        outcome: s.outcome as string,
        outcomeLabel: spotOutcomeLabel(s.outcome as string),
        carer: carer?.full_name || carer?.email || null,
      };
    }),
    concerns: concerns.map((c) => ({
      id: c.id as string,
      reference: c.reference as string,
      kindLabel: kindLabel(c.kind as string),
      statusLabel: statusLabel(c.status as string),
      status: c.status as string,
      reported_on: c.reported_on as string,
      description: c.description as string,
    })),
    compliments: compliments.map((c) => ({
      id: c.id,
      receivedOn: c.receivedOn,
      whatWasSaid: c.whatWasSaid,
      people: c.people.map((p) => p.name).filter((n): n is string => !!n),
    })),
    reviewBelow,
  };
  const history = buildClientHistory(input);
  const averages = qaAverages(qas);
  const doneQas = qas.filter((q) => q.completed);
  const year = now.toISOString().slice(0, 4);
  const concernsThisYear = concerns.filter((c) => (c.reported_on as string).startsWith(year)).length;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Checks due</h2>
          <Link href={runHref("client_qa", id)} className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4" /> Client QA
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {due.map(({ form, row }) => (
            <Card key={form.key}>
              <CardContent className="space-y-1 pt-6">
                <p className="font-medium">{form.label}</p>
                <p className="text-xs text-muted-foreground">{row.last ? `Last ${fmt(row.last)}` : "Never done"}</p>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CHIP[row.status]}`}>
                  {row.status === "never" ? "Due now" : row.next ? `${DUE_GROUP_LABEL[row.status]} · ${fmt(row.next)}` : "No date set"}
                </span>
                <div>
                  <Link href={runHref(form.key, id)} className="text-xs text-primary hover:underline">
                    Carry one out →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {doneQas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">QA ratings over time</h2>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">QA</th>
                    {QA_HEADINGS.map((h) => (
                      <th key={h.key} className="px-2 py-2 text-center font-medium">
                        {h.label}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="bg-muted/40">
                    <td className="px-4 py-2 text-xs font-medium">Average of {doneQas.length}</td>
                    {QA_HEADINGS.map((h) => (
                      <td key={h.key} className="px-2 py-2 text-center text-xs font-medium">
                        {averages[h.key] ?? "–"}
                      </td>
                    ))}
                    <td />
                  </tr>
                  {doneQas.map((q) => (
                    <tr key={q.id}>
                      <td className="px-4 py-2">
                        <Link href={`/org/audits/qa/${q.id}`} className="text-primary hover:underline">
                          {fmt(q.held_on)}
                        </Link>
                      </td>
                      {QA_HEADINGS.map((h) => {
                        const v = q.ratings[h.key];
                        return (
                          <td key={h.key} className={`px-2 py-2 text-center ${typeof v === "number" && v <= 4 ? "font-medium text-rose-700" : ""}`}>
                            {v ?? "–"}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right">{q.score !== null ? `${q.score}%` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}

      <section id="concerns" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Over time
            {complaintsOn && concerns.length ? ` · ${concernsThisYear} concern${concernsThisYear === 1 ? "" : "s"} this year` : ""}
          </h2>
          {complaintsOn && (
            <span className="flex gap-2">
              <Link href={`/org/complaints/new?client=${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Plus className="size-4" /> Raise a concern
              </Link>
              <Link href="/org/complaints/compliments" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Plus className="size-4" /> Log a compliment
              </Link>
            </span>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded for this client yet.</p>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {history.map((e, i) => {
                const body = (
                  <>
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="w-24 shrink-0 text-xs text-muted-foreground">{fmt(e.date)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{HISTORY_LABEL[e.kind]}</span>
                      <span className={`font-medium ${e.flag ? "text-rose-700" : ""}`}>{e.title}</span>
                    </span>
                    {e.detail && <span className="block pl-0 text-xs text-muted-foreground sm:pl-27">{e.detail}</span>}
                  </>
                );
                return e.href ? (
                  <Link key={`${e.kind}-${i}`} href={e.href} className="block space-y-1 px-4 py-3 text-sm hover:bg-muted/50">
                    {body}
                  </Link>
                ) : (
                  <div key={`${e.kind}-${i}`} className="space-y-1 px-4 py-3 text-sm">
                    {body}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
