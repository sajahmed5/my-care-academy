"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ClipboardCheck, GraduationCap, Plus, TriangleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dueStatus, type DueStatus } from "@/lib/records";
import type { CheckAnswer } from "@/lib/audit-forms";
import {
  areaLabel,
  areasOfConcern,
  latestByArea,
  nextDueAcrossAreas,
  outcomeLabel,
  spotOutcomeLabel,
  type CompetencyCheck,
  type SpotCheck,
} from "@/lib/competency";
import type { Suggestion } from "@/lib/complaints/categories";
import type { SaveState } from "@/app/platform/actions";
import { assignAuditTrainingAction } from "./check-actions";
import { formatDate } from "@/lib/dates";

const DUE_STYLE: Record<DueStatus, string> = {
  overdue: "bg-rose-100 text-rose-700",
  due_soon: "bg-amber-100 text-amber-700",
  scheduled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

const OUTCOME_STYLE: Record<string, string> = {
  met: "bg-green-100 text-green-700",
  developing: "bg-amber-100 text-amber-700",
  not_met: "bg-rose-100 text-rose-700",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Spot checks and competency for one carer. What leads is what a manager is
 * asked: when the next spot check is due, which skills are short of
 * competent, and what training that suggests — for them to confirm.
 *
 * Office staff have neither: both happen in clients' homes (STAFF-AUDITS.md).
 */
export function CompetencyList({
  userId,
  isCarer,
  checks,
  spotChecks,
  suggestions,
  areas,
  canRaisePlan,
}: {
  userId: string;
  isCarer: boolean;
  checks: CompetencyCheck[];
  spotChecks: SpotCheck[];
  /** "spot_check:<id>" or "competency:<id>" → what it suggests. */
  suggestions: Record<string, Suggestion[]>;
  /** The skills this company assesses: ours, as it has changed them, and its own. */
  areas: { value: string; label: string }[];
  /** Performance plans are in the package (people.performance_plans). */
  canRaisePlan: boolean;
}) {
  const labelOf = (key: string) => areas.find((a) => a.value === key)?.label ?? areaLabel(key);
  if (!isCarer) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Spot checks and competency assessments are for carers — they happen in clients&apos; homes. Office staff have supervisions and appraisals.
        </CardContent>
      </Card>
    );
  }

  const now = new Date();
  const nextSpot = spotChecks[0]?.next_due ?? null;
  const spotStatus = dueStatus(nextSpot, now);
  const nextCompetency = nextDueAcrossAreas(checks);
  const competencyStatus = dueStatus(nextCompetency, now);
  const concerns = areasOfConcern(checks);
  const current = latestByArea(checks);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${DUE_STYLE[spotStatus]}`}>
          <ClipboardCheck className="size-3.5" />
          {spotStatus === "none" ? "No spot check scheduled" : `Spot check due ${fmtDate(nextSpot)}`}
        </span>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${DUE_STYLE[competencyStatus]}`}>
          <ClipboardCheck className="size-3.5" />
          {competencyStatus === "none" ? "No competency scheduled" : `Next competency due ${fmtDate(nextCompetency)}`}
        </span>
        {concerns.length > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700">
            <TriangleAlert className="size-3.5" />
            {concerns.length} skill{concerns.length === 1 ? "" : "s"} short of competent
          </span>
        )}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Spot checks ({spotChecks.length})</h3>
          <Link href={`/org/staff/${userId}/spot-checks/new`} className={buttonVariants({ variant: "outline" })}>
            <Plus className="size-4" /> Do a spot check
          </Link>
        </div>
        {spotChecks.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              None yet. Spot checks are unannounced — open this on your phone in the client&apos;s home.
            </CardContent>
          </Card>
        ) : (
          spotChecks.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-2 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {fmtDate(s.checked_on)}
                    {s.client_name ? ` · ${s.client_name}` : ""}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[s.outcome] ?? "bg-muted"}`}>
                    {spotOutcomeLabel(s.outcome)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.assessor_name ? `By ${s.assessor_name}` : "Assessor no longer on the system"} ·{" "}
                  {s.next_due ? `next due ${fmtDate(s.next_due)}` : "no next date"}
                </p>
                <Answers answers={s.items} />
                {s.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{s.notes}</p>}
                <p className="border-t pt-2 text-xs text-muted-foreground">
                  {s.carer_signed_name
                    ? `Signed by ${s.carer_signed_name}${s.carer_signed_at ? ` on ${fmtDate(s.carer_signed_at)}` : ""}`
                    : s.carer_unsigned_reason
                      ? `Not signed — ${s.carer_unsigned_reason}`
                      : "Not signed"}
                </p>
                <Suggested
                  userId={userId}
                  sourceType="spot_check"
                  sourceId={s.id}
                  suggestions={suggestions[`spot_check:${s.id}`] ?? []}
                />
                {canRaisePlan && s.outcome !== "met" && <RaisePlan userId={userId} from={`spot_check:${s.id}`} />}
                {s.outcome !== "met" && <OpenCase userId={userId} from="spot_check" id={s.id} label="Spot check" />}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Competency, by skill</h3>
          <Link href={`/org/staff/${userId}/competency/new`} className={buttonVariants({ variant: "outline" })}>
            <Plus className="size-4" /> Assess a skill
          </Link>
        </div>
        <Card>
          <CardContent className="divide-y p-0">
            {areas.map((a) => {
              const latest = current.get(a.value);
              const status = dueStatus(latest?.next_due ?? null, now);
              return (
                <div key={a.value} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium">{a.label}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {latest ? (
                      <>
                        <span className={`rounded-full px-2 py-0.5 font-medium ${OUTCOME_STYLE[latest.outcome] ?? "bg-muted"}`}>
                          {outcomeLabel(latest.outcome)}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 ${DUE_STYLE[status]}`}>
                          {latest.next_due ? `Due ${fmtDate(latest.next_due)}` : `Assessed ${fmtDate(latest.checked_on)}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not assessed</span>
                    )}
                    <Link href={`/org/staff/${userId}/competency/new?area=${a.value}`} className="font-medium text-primary hover:underline">
                      Assess
                    </Link>
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        {checks.map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-2 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {labelOf(c.area)} · {fmtDate(c.checked_on)}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[c.outcome] ?? "bg-muted"}`}>
                  {outcomeLabel(c.outcome)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {c.assessor_name ? `Assessed by ${c.assessor_name}` : "Assessor no longer on the system"} ·{" "}
                {c.next_due ? `next due ${fmtDate(c.next_due)}` : "no next date"}
              </p>
              <Answers answers={c.criteria} />
              {c.notes && <p className="whitespace-pre-line text-sm text-muted-foreground">{c.notes}</p>}
              <Suggested userId={userId} sourceType="competency" sourceId={c.id} suggestions={suggestions[`competency:${c.id}`] ?? []} />
              {canRaisePlan && c.outcome !== "met" && <RaisePlan userId={userId} from={`competency:${c.id}`} />}
              {c.outcome !== "met" && <OpenCase userId={userId} from="competency" id={c.id} label="Competency assessment" />}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

const RESULT_LABEL: Record<string, string> = { yes: "Yes", no: "No", na: "N/A" };

/** Raise a performance plan from a record that wasn't met (STAFF-AUDITS.md). */
export function RaisePlan({ userId, from }: { userId: string; from: string }) {
  return (
    <Link href={`/org/pips/new?user=${userId}&from=${from}`} className="inline-block text-sm font-medium text-primary hover:underline">
      Raise a performance plan →
    </Link>
  );
}

/** A disciplinary or capability case from a record that wasn't met, linked to it (HR-PACK.md). */
function OpenCase({ userId, from, id, label }: { userId: string; from: string; id: string; label: string }) {
  return (
    <Link href={`/org/hr/cases/new?user=${userId}&from=${from}&fromId=${id}&label=${encodeURIComponent(label)}`} className="ml-3 inline-block text-sm font-medium text-primary hover:underline">
      Open a case →
    </Link>
  );
}

/** The "No"s up front, everything in the drop-down. */
function Answers({ answers }: { answers: CheckAnswer[] }) {
  if (answers.length === 0) return null;
  const noes = answers.filter((a) => a.result === "no");
  return (
    <div className="space-y-1">
      {noes.map((a) => (
        <p key={a.id} className="text-sm text-rose-700">
          ✗ {a.label}
          {a.comment ? ` — ${a.comment}` : ""}
        </p>
      ))}
      <details className="rounded-lg border px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-primary">All {answers.length} answers</summary>
        <ul className="mt-2 space-y-1">
          {answers.map((a) => (
            <li key={a.id} className="text-muted-foreground">
              <span className={a.result === "no" ? "text-rose-700" : a.result === "yes" ? "text-green-700" : ""}>
                {RESULT_LABEL[a.result] ?? a.result}
              </span>{" "}
              — {a.label}
              {a.comment ? `: ${a.comment}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * Training a check that fell short suggests. The manager confirms each one —
 * never assigned on its own (STAFF-AUDITS.md, Follow-up).
 */
function Suggested({
  userId,
  sourceType,
  sourceId,
  suggestions,
}: {
  userId: string;
  sourceType: "spot_check" | "competency";
  sourceId: string;
  suggestions: Suggestion[];
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <GraduationCap className="size-4" /> Suggested training
      </p>
      {suggestions.map((s) =>
        s.assigned ? (
          <p key={s.course.id} className="text-sm text-muted-foreground">
            ✓ {s.course.title} — assigned{s.reason ? `: ${s.reason}` : ""}
          </p>
        ) : (
          <AssignOne key={s.course.id} userId={userId} sourceType={sourceType} sourceId={sourceId} course={s.course} />
        ),
      )}
    </div>
  );
}

function AssignOne({
  userId,
  sourceType,
  sourceId,
  course,
}: {
  userId: string;
  sourceType: string;
  sourceId: string;
  course: { id: string; title: string };
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(assignAuditTrainingAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="sourceType" value={sourceType} />
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="courseId" value={course.id} />
      <span className="min-w-40 flex-1 text-sm">{course.title}</span>
      <Input name="reason" placeholder="Why (optional)" maxLength={500} className="h-9 w-48" />
      <Input name="dueDate" type="date" aria-label="Due by" className="h-9 w-40" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : "Assign"}
      </Button>
      {state.error && <span className="w-full text-xs text-rose-600">{state.error}</span>}
    </form>
  );
}
