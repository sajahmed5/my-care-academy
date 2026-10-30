import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { PROBATION_STATUS_LABEL, outcomeLabel, probationFromRow, schedule, type ReviewRecord } from "@/lib/hr/probation";
import { templateFor } from "@/lib/hr/letters";
import { EmploymentForm, ProbationLine } from "./employment-forms";
import { AbsenceForm } from "@/app/org/hr/absence/absence-forms";
import { bradford, daysOff, needsFitNote, rtwOutstanding, sanitiseTriggers, type Absence } from "@/lib/hr/absence";
import { addDays } from "@/lib/hr/probation";
import { STATUS_LABEL, amountText, balance, canApprove, holidaySettingsFromRow, leaveTypeLabel, leaveTypesFor, leaveYear, type LeaveRequest } from "@/lib/hr/holidays";
import { AllowanceForm, CancelLeave, DecideLeave, LeaveForm } from "@/app/org/hr/holidays/holiday-forms";
import type { UserContext } from "@/lib/auth";
import { CHECKLIST, checklistDone, reasonLabel as leavingReasonLabel, sanitiseChecklist } from "@/lib/hr/leavers";
import { LeaverForm } from "@/app/org/hr/leavers/leaver-forms";
import { References } from "@/app/org/hr/leavers/references";
import { activeWarning, kindLabel as caseKindLabel, outcomeLabel as caseOutcomeLabel, stageLabel as caseStageLabel } from "@/lib/hr/cases";

const fmt = (d: string | null) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The Employment section's Probation page (HR-PACK.md): their start date and
 * job title, where probation stands, and each review — booked, held, or due.
 * Read under RLS: the section only renders when the company has the HR pack.
 */
export async function ProbationPanel({ supabase, userId, orgId }: { supabase: Supabase; userId: string; orgId: string }) {
  const [{ data: emp }, { data: settings }, { data: reviews }] = await Promise.all([
    supabase.from("staff_employment").select("start_date, job_title, probation_status, probation_ends_on").eq("user_id", userId).maybeSingle(),
    supabase.from("hr_settings").select("probation_months, probation_review_months").eq("organisation_id", orgId).maybeSingle(),
    supabase.from("probation_reviews").select("id, due_on, status, booked_on, booked_time, held_on, outcome, is_final").eq("user_id", userId).order("due_on"),
  ]);
  const s = probationFromRow(settings);
  const today = new Date().toISOString().slice(0, 10);
  const lines = emp && emp.probation_status !== "none" ? schedule(emp as never, s, (reviews ?? []) as ReviewRecord[], today) : [];
  const status = (emp?.probation_status as string | undefined) ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <EmploymentForm
            userId={userId}
            startDate={(emp?.start_date as string | null) ?? ""}
            jobTitle={(emp?.job_title as string | null) ?? ""}
            noProbation={status === "none"}
          />
        </CardContent>
      </Card>
      {!emp?.start_date ? (
        <p className="text-sm text-muted-foreground">Set their start date and their probation reviews appear here, {s.reviewMonths.slice(0, -1).join(", ")} and {s.months} months in.</p>
      ) : status === "none" ? (
        <p className="text-sm text-muted-foreground">Not on probation.</p>
      ) : (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{PROBATION_STATUS_LABEL[status ?? "in_probation"]}</span>
            <span className="text-muted-foreground">
              {status === "passed" || status === "not_passed" ? "" : `Ends ${fmt(emp.probation_ends_on as string | null)}`}
            </span>
          </p>
          <Card>
            <CardContent className="divide-y p-0">
              {lines.map((l) => (
                <div key={l.dueOn} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{l.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Due {fmt(l.dueOn)}
                      {l.review?.booked_on && l.state !== "held" ? ` · booked ${fmt(l.review.booked_on)}${l.review.booked_time ? ` at ${l.review.booked_time}` : ""}` : ""}
                      {l.state === "held" ? ` · held ${fmt(l.review!.held_on)} · ${outcomeLabel(l.review!.outcome)}` : ""}
                    </p>
                  </div>
                  {l.state === "held" ? (
                    <Link href={`/org/hr/probation/review/${l.review!.id}`} className="text-sm font-medium text-primary hover:underline">
                      Read the review
                    </Link>
                  ) : l.state === "skipped" ? (
                    <span className="text-xs text-muted-foreground">Not held</span>
                  ) : (
                    <ProbationLine userId={userId} dueOn={l.dueOn} state={l.state} draft={l.review?.status === "draft"} bookedOn={l.review?.booked_on ?? null} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Letters sent to them, and drafts waiting to be sent. */
export async function LettersPanel({ supabase, userId }: { supabase: Supabase; userId: string }) {
  const { data: letters } = await supabase
    .from("hr_letters")
    .select("id, kind, subject, status, sent_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!letters?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">No letters yet. Letters are written from a probation review, a case or their leaving.</CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {letters.map((l) => (
          <Link key={l.id as string} href={`/org/hr/letters/${l.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
            <span>
              <span className="font-medium">{l.subject as string}</span>
              <span className="ml-2 text-xs text-muted-foreground">{templateFor(l.kind as string)?.label ?? ""}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === "sent" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {l.status === "sent" ? `Sent ${fmt(l.sent_at as string)}` : "Draft: not sent"}
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

/** Their sickness absences, Bradford score, and a way to record one (HR-PACK.md). */
export async function AbsencePanel({ supabase, userId, orgId }: { supabase: Supabase; userId: string; orgId: string }) {
  const [{ data: rows }, { data: settings }] = await Promise.all([
    supabase
      .from("sickness_absences")
      .select("id, user_id, start_date, returned_on, reason, certification, fit_note_until, excluded_from_triggers, rtw_status, reported_by_self")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(500),
    supabase.from("hr_settings").select("bradford_triggers").eq("organisation_id", orgId).maybeSingle(),
  ]);
  const absences = (rows ?? []) as unknown as Absence[];
  const today = new Date().toISOString().slice(0, 10);
  const triggers = sanitiseTriggers(settings?.bradford_triggers);
  const b = bradford(absences, today, triggers);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <span className="font-semibold">Bradford score {b.score}</span>
          <span className="text-muted-foreground">
            {b.spells} spell{b.spells === 1 ? "" : "s"}, {b.days} day{b.days === 1 ? "" : "s"} in the last 52 weeks · trigger points {triggers.join(", ")}
          </span>
          {b.reached !== null && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Reached {b.reached}</span>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">Record an absence</h3>
          <AbsenceForm userId={userId} />
        </CardContent>
      </Card>
      {absences.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {absences.map((a) => (
              <Link key={a.id} href={`/org/hr/absence/${a.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                <span>
                  <span className="font-medium">{a.reason}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {fmt(a.start_date)} to {a.returned_on ? fmt(addDays(a.returned_on, -1)) : "now"} · {daysOff(a, today)} day{daysOff(a, today) === 1 ? "" : "s"}
                    {a.excluded_from_triggers ? " · not counted" : ""}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-xs">
                  {!a.returned_on && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700">Off now</span>}
                  {rtwOutstanding(a) && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Return to work due</span>}
                  {a.rtw_status === "held" && <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700">Return to work held</span>}
                  {needsFitNote(a, today) && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Fit note needed</span>}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Their allowance this leave year, what's taken and booked, and their leave (HR-PACK.md). */
export async function HolidaysPanel({ supabase, userId, orgId, me }: { supabase: Supabase; userId: string; orgId: string; me: { id: string; role: string } }) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: settingsRow }, { data: person }] = await Promise.all([
    supabase.from("hr_settings").select("leave_year_start, bank_holidays_from_allowance, max_off_at_once, leave_types").eq("organisation_id", orgId).maybeSingle(),
    supabase.from("users").select("id, role").eq("id", userId).maybeSingle(),
  ]);
  const s = holidaySettingsFromRow(settingsRow);
  const year = leaveYear(today, s.yearStart);
  const [{ data: allowance }, { data: rows }] = await Promise.all([
    supabase.from("leave_allowances").select("amount, unit").eq("user_id", userId).eq("year_start", year.start).maybeSingle(),
    supabase
      .from("leave_requests")
      .select("id, user_id, leave_type, start_date, end_date, amount, unit, status, note, decision_note")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(200),
  ]);
  const types = leaveTypesFor(s.own);
  const requests = (rows ?? []) as unknown as Array<LeaveRequest & { note: string | null; decision_note: string | null }>;
  const b = balance(allowance ? { amount: Number(allowance.amount), unit: allowance.unit as string } : null, requests, year, types, today);
  const unit = (allowance?.unit as string | undefined) ?? "days";
  const decides = person ? canApprove(me, { id: person.id as string, role: person.role as string }) : false;
  const yearLabel = `${fmt(year.start)} to ${fmt(year.end)}`;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6 text-sm">
          <AllowanceForm userId={userId} yearStart={year.start} yearLabel={yearLabel} amount={b.allowance} unit={unit} />
          {b.allowance !== null && (
            <p className="text-muted-foreground">
              Taken {amountText(b.taken, unit)} · booked {amountText(b.booked, unit)}
              {b.pending ? ` · waiting ${amountText(b.pending, unit)}` : ""} · <span className="font-medium text-foreground">{amountText(b.left ?? 0, unit)} left</span>
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h3 className="font-semibold">Add leave</h3>
          <LeaveForm types={types} unit={unit} bankHolidaysFromAllowance={s.bankHolidaysFromAllowance} userId={userId} canApproveNow={decides} />
        </CardContent>
      </Card>
      {requests.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{leaveTypeLabel(r.leave_type, s.own)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {fmt(r.start_date)}{r.end_date !== r.start_date ? ` to ${fmt(r.end_date)}` : ""} · {amountText(r.amount, r.unit)}
                    {r.decision_note ? ` · ${r.decision_note}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "requested" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  {r.status === "requested" && decides && <DecideLeave id={r.id} />}
                  {(r.status === "requested" || (r.status === "approved" && r.start_date > today)) && <CancelLeave id={r.id} />}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Their disciplinary and grievance cases, and any warning still active
 * (HR-PACK.md). Read under RLS: a manager, or an office worker given access,
 * sees them; anyone else sees nothing here.
 */
export async function CasesPanel({ supabase, userId }: { supabase: Supabase; userId: string }) {
  const { data: rows } = await supabase
    .from("hr_cases")
    .select("id, ref, kind, subtype, stage, outcome, outcome_on, warning_expires_on, appeal_outcome, raised_on, closed_on")
    .eq("user_id", userId)
    .order("raised_on", { ascending: false })
    .limit(100);
  const today = new Date().toISOString().slice(0, 10);
  const cases = rows ?? [];
  const active = cases.filter((c) => activeWarning(c as never, today));
  return (
    <div className="space-y-4">
      {active.map((c) => (
        <p key={c.id as string} className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {caseOutcomeLabel(c.outcome as string)} active until {fmt(c.warning_expires_on as string)} ({c.ref as string})
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        <Link href={`/org/hr/cases/new?user=${userId}`} className="inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium hover:bg-accent">
          Open a disciplinary or capability case
        </Link>
        <Link href={`/org/hr/cases/new?user=${userId}&kind=grievance`} className="inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium hover:bg-accent">
          Record a grievance they raised
        </Link>
      </div>
      {cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cases you can see.</p>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {cases.map((c) => (
              <Link key={c.id as string} href={`/org/hr/cases/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{c.ref as string}</span> <span className="font-medium">{caseKindLabel(c.kind as string, c.subtype as string | null)}</span>
                  <span className="ml-2 text-xs text-muted-foreground">raised {fmt(c.raised_on as string)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.closed_on ? `Closed${c.outcome ? `: ${caseOutcomeLabel(c.outcome as string)}` : ""}` : caseStageLabel(c.kind as string, c.stage as string)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Their leaving record, or the way to start one; and references given (HR-PACK.md). */
export async function LeavingPanel({ supabase, userId, context }: { supabase: Supabase; userId: string; context: UserContext }) {
  const { data: l } = await supabase.from("hr_leavers").select("id, reason, last_day, login_off_at, checklist").eq("user_id", userId).maybeSingle();
  return (
    <div className="space-y-4">
      {l ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
            <span>
              <span className="font-medium">{leavingReasonLabel(l.reason as string)}</span>
              <span className="ml-2 text-muted-foreground">
                last day {fmt(l.last_day as string)}
                {l.login_off_at ? " · login switched off" : ""} · checklist {checklistDone(sanitiseChecklist(l.checklist))} of {CHECKLIST.length}
              </span>
            </span>
            <Link href={`/org/hr/leavers/${l.id}`} className="font-medium text-primary hover:underline">Open the leaving record</Link>
          </CardContent>
        </Card>
      ) : userId === context.userId ? (
        <p className="text-sm text-muted-foreground">Another manager records your leaving.</p>
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <h3 className="font-semibold">Record that they&apos;re leaving</h3>
            <LeaverForm userId={userId} />
          </CardContent>
        </Card>
      )}
      <References userId={userId} context={context} />
    </div>
  );
}
