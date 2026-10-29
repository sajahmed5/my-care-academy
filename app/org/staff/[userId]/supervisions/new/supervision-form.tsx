"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/dates";
import { intervalLabel, nextDueFrom, type ActionReviewStatus, type AuditForm } from "@/lib/audit-forms";
import type { SelfAssessment } from "@/lib/supervisions";
import { recordSupervisionAction, type RecordState } from "../../supervision-actions";
import { CarerSignatureFields, ManagerSignatureFields } from "../../signature-fields";

const textareaClass =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export interface ActionToReview {
  id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const fmt = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * A supervision or appraisal, question by question: last time's actions
 * first, then the form's questions, then what is agreed now, then both sign.
 */
export function SupervisionForm({
  userId,
  personName,
  managerName,
  form,
  bookingId,
  previousActions,
  selfAssessment,
}: {
  userId: string;
  personName: string;
  managerName: string;
  form: AuditForm;
  bookingId: string | null;
  previousActions: ActionToReview[];
  selfAssessment: SelfAssessment | null;
}) {
  const router = useRouter();
  const [heldOn, setHeldOn] = useState(todayISO);
  const [nextDue, setNextDue] = useState(() => nextDueFrom(todayISO(), form.due));
  const [ownNextDue, setOwnNextDue] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // An action already ticked off on the task list starts as done.
  const [review, setReview] = useState<Record<string, { status: ActionReviewStatus; comment: string }>>(() =>
    Object.fromEntries(previousActions.map((a) => [a.id, { status: a.completed_at ? "done" : "not_done", comment: "" }])),
  );
  const [state, formAction, pending] = useActionState<RecordState, FormData>(async (prev, fd) => {
    const r = await recordSupervisionAction(prev, fd);
    if (r.ok) router.push(`/org/staff/${userId}?section=supervisions`);
    return r;
  }, {});

  const noun = form.label.toLowerCase();

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="kind" value={form.kind} />
      <input type="hidden" name="bookingId" value={bookingId ?? ""} />
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <input
        type="hidden"
        name="actionsReview"
        value={JSON.stringify(Object.entries(review).map(([id, r]) => ({ id, ...r })))}
      />
      <input type="hidden" name="offeredActions" value={JSON.stringify(previousActions.map((a) => ({ id: a.id, title: a.title })))} />

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sv-held">Held on</Label>
            <Input
              id="sv-held"
              name="heldOn"
              type="date"
              required
              value={heldOn}
              onChange={(e) => {
                setHeldOn(e.target.value);
                if (!ownNextDue && e.target.value) setNextDue(nextDueFrom(e.target.value, form.due));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sv-next">Next {noun} due</Label>
            <Input
              id="sv-next"
              name="nextDue"
              type="date"
              value={nextDue}
              onChange={(e) => {
                setOwnNextDue(true);
                setNextDue(e.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">{intervalLabel(form.due)} unless you change it.</p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Last time&apos;s actions</h2>
        {previousActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing was agreed last time, or this is their first.</p>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {previousActions.map((a) => {
                const r = review[a.id];
                return (
                  <div key={a.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{a.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {a.completed_at ? `Ticked off ${fmt(a.completed_at)}` : a.due_date ? `Due ${fmt(a.due_date)}` : "No date"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["done", "not_done"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={r.status === s}
                          onClick={() => setReview((cur) => ({ ...cur, [a.id]: { ...cur[a.id], status: s } }))}
                          className={`min-h-11 rounded-lg border px-3 text-sm sm:min-h-9 ${
                            r.status === s
                              ? s === "done"
                                ? "border-green-600 bg-green-50 text-green-800"
                                : "border-amber-600 bg-amber-50 text-amber-800"
                              : "bg-background"
                          }`}
                        >
                          {s === "done" ? "Done" : "Not yet — stays on their list"}
                        </button>
                      ))}
                    </div>
                    <Input
                      aria-label={`Comment on ${a.title}`}
                      placeholder="Comment (optional)"
                      maxLength={1000}
                      value={r.comment}
                      onChange={(e) => setReview((cur) => ({ ...cur, [a.id]: { ...cur[a.id], comment: e.target.value } }))}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {form.kind === "appraisal" && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Their self-assessment</h2>
          {!selfAssessment ? (
            <p className="text-sm text-muted-foreground">
              None for this appraisal. Book the next one ahead and {personName} gets a short self-assessment to fill in first.
            </p>
          ) : !selfAssessment.submitted_at ? (
            <p className="text-sm text-amber-700">{personName} has not sent their self-assessment yet.</p>
          ) : (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-xs text-muted-foreground">Sent {fmt(selfAssessment.submitted_at)}</p>
                {selfAssessment.questions.map((q) => (
                  <div key={q.id}>
                    <p className="text-sm font-medium">{q.label}</p>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {selfAssessment.answers[q.id]?.trim() || "—"}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">The {noun}</h2>
        {form.questions.map((q) => (
          <div key={q.id} className="space-y-1">
            <Label htmlFor={`q-${q.id}`}>{q.label}</Label>
            {q.help && <p className="text-xs text-muted-foreground">{q.help}</p>}
            <textarea
              id={`q-${q.id}`}
              rows={3}
              maxLength={5000}
              className={textareaClass}
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswers((cur) => ({ ...cur, [q.id]: e.target.value }))}
            />
          </div>
        ))}
        {/* AI drafting goes here when it arrives with recruitment's AI release
            (STAFF-AUDITS.md, AI): Claude drafts this summary and suggests the
            actions below from the answers above, and the manager checks both
            before saving. Off by default, billed at 1.5 times cost. */}
        <div className="space-y-1">
          <Label htmlFor="sv-summary">Summary (optional)</Label>
          <textarea id="sv-summary" name="summary" rows={3} maxLength={5000} className={textareaClass} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor="sv-agreed">Actions agreed now — one per line</Label>
          <textarea
            id="sv-agreed"
            name="agreed"
            rows={3}
            className={textareaClass}
            placeholder={"Book onto moving and handling\nShadow a double-up call"}
          />
          <p className="text-xs text-muted-foreground">Each line goes onto their task list, and comes back at the next one.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sv-actions-due">Actions due by (optional)</Label>
          <Input id="sv-actions-due" name="actionsDue" type="date" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <CarerSignatureFields
          name={personName}
          idPrefix="sv"
          prompt={`Pass them the screen to sign that this is a fair record of the ${noun}.`}
        />
        <ManagerSignatureFields defaultName={managerName} idPrefix="sv" />
      </section>

      {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : `Save the ${noun}`}
      </Button>
    </form>
  );
}
