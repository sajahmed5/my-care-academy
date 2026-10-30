import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/dates";
import { templateFor } from "@/lib/hr/letters";
import {
  activeWarning,
  appealLabel,
  appealable,
  caseSettingsFromRow,
  deadlines,
  kindLabel,
  legalReminders,
  outcomeLabel,
  recommendationLabel,
  stageLabel,
  stagesFor,
  type HrCase,
} from "@/lib/hr/cases";
import { loadCase } from "@/lib/hr/case-access";
import { hrPerson, personName } from "@/lib/hr/server";
import {
  AcknowledgeButton,
  AppealForm,
  AppealOutcomeForm,
  CloseCase,
  EvidenceLink,
  EvidenceUpload,
  InvestigatorPicker,
  InviteForm,
  LegalDuties,
  MeetingForm,
  NoteForm,
  OutcomeForm,
  ReportForm,
  SignMinutes,
  StatementForm,
  SuspendForm,
  SuspensionReview,
  WarningExpiry,
} from "./case-panels";

const fmt = (d: string | null | undefined) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

const MEETING_LABEL: Record<string, string> = {
  investigation: "Investigation meeting",
  hearing: "Hearing",
  meeting: "Grievance meeting",
  appeal: "Appeal hearing",
};

/**
 * One case file (HR-PACK.md): every step in order, each with what's been
 * done and the form for the next; the letters, minutes and statements; the
 * legal reminders; and the whole file as one PDF for a tribunal.
 */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const admin = createAdminClient();
  const row = await loadCase(admin, context, id);
  if (!row) notFound();
  const c = row as unknown as HrCase & Record<string, unknown>;
  const person = await hrPerson(admin, context.organisationId, c.user_id);
  if (!person) notFound();

  const [{ data: notes }, { data: meetings }, { data: statements }, { data: letters }, { data: staff }, { data: settingsRow }] = await Promise.all([
    admin.from("hr_case_notes").select("id, kind, body, file_name, created_at, created_by").eq("case_id", id).order("created_at"),
    admin.from("hr_case_meetings").select("*").eq("case_id", id).order("held_on"),
    admin.from("hr_case_statements").select("id, witness_name, witness_email, method, statement, signed_name, signed_at, status").eq("case_id", id).order("created_at"),
    admin.from("hr_letters").select("id, kind, subject, status, sent_at").eq("source_type", "case").eq("source_id", id).order("created_at"),
    admin.from("users").select("id, full_name, email, role").eq("organisation_id", context.organisationId!).in("role", ["org_admin", "org_office"]).eq("status", "active").order("full_name"),
    admin.from("hr_settings").select("*").eq("organisation_id", context.organisationId!).maybeSingle(),
  ]);
  const s = caseSettingsFromRow(settingsRow);
  const today = new Date().toISOString().slice(0, 10);
  const grievance = c.kind === "grievance";
  const closed = !!c.closed_on;
  const nameOf = (uid: string | null | undefined) => {
    const u = (staff ?? []).find((x) => x.id === uid);
    return u ? personName(u as never) : uid === person.id ? personName(person) : "—";
  };
  const consoleStaff = (staff ?? []).filter((u) => u.id !== c.user_id && u.id !== c.about_user_id).map((u) => ({ id: u.id as string, name: personName(u as never) }));
  const managers = (staff ?? []).filter((u) => u.role === "org_admin" && u.id !== c.user_id && u.id !== c.about_user_id).map((u) => ({ id: u.id as string, name: personName(u as never) }));
  const due = deadlines(c, s);
  const legal = legalReminders(c);
  const warning = activeWarning(c, today);
  const stageIndex = stagesFor(c.kind).findIndex((x) => x.key === c.stage);
  const section = "space-y-3 pt-6";

  return (
    <DashboardShell title={`${c.ref as string}: ${personName(person)}`} context={context} back={{ href: "/org/hr/cases", label: "Cases" }}>
      <div className="max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">{kindLabel(c.kind, c.subtype)}</span>
          <Link href={`/org/staff/${person.id}?section=employment&sub=cases`} className="font-medium text-primary hover:underline">{personName(person)}</Link>
          {c.about_user_id ? <span className="text-muted-foreground">· about {nameOf(c.about_user_id as string)}</span> : null}
          <span className="text-muted-foreground">· raised {fmt(c.raised_on)}{c.raised_via === "own_login" ? " from their login" : c.raised_via === "in_writing" ? " in writing" : ""}</span>
          {warning && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">{outcomeLabel(c.outcome)} active until {fmt(c.warning_expires_on)}</span>}
          <a href={`/org/hr/cases/${id}/pdf`} className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium hover:bg-accent">
            <Download className="size-4" /> The case file (PDF)
          </a>
        </div>

        <ol className="flex flex-wrap gap-1 text-xs">
          {stagesFor(c.kind).map((st, i) => (
            <li key={st.key} className={`rounded-full px-2.5 py-1 ${i === stageIndex ? "bg-primary text-primary-foreground" : i < stageIndex ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {st.label}
            </li>
          ))}
        </ol>

        {(due.length > 0 || legal.length > 0) && !closed && (
          <Card>
            <CardContent className="space-y-1 pt-6 text-sm">
              {due.map((d) => (
                <p key={d.what} className={d.on < today ? "font-medium text-rose-700" : ""}>
                  {d.on < today ? "Overdue: " : "Next: "}
                  {d.what}, {fmt(d.on)}
                </p>
              ))}
              {legal.map((l) => (
                <p key={l} className="font-medium text-amber-800">Legal reminder: {l}</p>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className={section}>
            <h3 className="font-semibold">{grievance ? "The grievance" : "The concern"}</h3>
            <p className="whitespace-pre-line text-sm">{c.summary as string}</p>
            {c.linked_label ? <p className="text-xs text-muted-foreground">Linked to: {c.linked_label as string}</p> : null}
            {grievance && c.stage === "raised" && !closed && <AcknowledgeButton caseId={id} />}
          </CardContent>
        </Card>

        {!grievance && (
          <Card>
            <CardContent className={section}>
              <h3 className="font-semibold">Suspension</h3>
              {c.suspended_on ? (
                <>
                  <p className="text-sm">
                    Suspended on full pay from {fmt(c.suspended_on)}
                    {c.suspension_ended_on ? `, ended ${fmt(c.suspension_ended_on)}` : `, review by ${fmt(c.suspension_review_on)}`}. {c.suspension_reason as string}
                  </p>
                  {!c.suspension_ended_on && !closed && <SuspensionReview caseId={id} />}
                </>
              ) : closed ? (
                <p className="text-sm text-muted-foreground">Not suspended.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Only if needed: on full pay, as a precaution, never a punishment, and reviewed regularly.</p>
                  <SuspendForm caseId={id} />
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className={section}>
            <h3 className="font-semibold">Investigation{grievance ? " (if needed)" : ""}</h3>
            {!closed && <InvestigatorPicker caseId={id} staff={consoleStaff} current={(c.investigator_id as string | null) ?? null} />}
            {closed && c.investigator_id ? <p className="text-sm">Investigator: {nameOf(c.investigator_id as string)}</p> : null}

            <h4 className="pt-2 text-sm font-semibold">Witness statements ({(statements ?? []).length})</h4>
            {(statements ?? []).map((w) => (
              <div key={w.id as string} className="space-y-1 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {w.witness_name as string}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {w.status === "signed" ? `signed ${formatDateTime(w.signed_at as string)}${w.method === "link" ? ", written by them" : ""}` : `asked by email (${w.witness_email as string}), not written yet`}
                  </span>
                </p>
                {w.statement ? <p className="whitespace-pre-line text-muted-foreground">{w.statement as string}</p> : null}
              </div>
            ))}
            {!closed && <StatementForm caseId={id} />}

            <h4 className="pt-2 text-sm font-semibold">Evidence</h4>
            <ul className="space-y-1 text-sm">
              {(notes ?? []).filter((n) => n.kind === "evidence").map((n) => (
                <li key={n.id as string}>
                  <EvidenceLink noteId={n.id as string} name={(n.file_name as string) ?? "File"} />
                  {n.body ? <span className="text-muted-foreground"> · {n.body as string}</span> : null}
                </li>
              ))}
            </ul>
            {!closed && <EvidenceUpload caseId={id} />}

            <h4 className="pt-2 text-sm font-semibold">Report</h4>
            {c.investigation_report && closed ? (
              <p className="whitespace-pre-line text-sm">{c.investigation_report as string} {c.recommendation ? `Recommends: ${recommendationLabel(c.recommendation as string)}.` : ""}</p>
            ) : !closed ? (
              <ReportForm caseId={id} disciplinary={!grievance} report={(c.investigation_report as string | null) ?? ""} recommendation={(c.recommendation as string | null) ?? ""} />
            ) : (
              <p className="text-sm text-muted-foreground">No report.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className={section}>
            <h3 className="font-semibold">{grievance ? "The meeting" : "The hearing"}</h3>
            {c.hearing_on ? (
              <p className="text-sm">
                {fmt(c.hearing_on)}
                {c.hearing_time ? ` at ${c.hearing_time as string}` : ""}
                {c.hearing_place ? `, ${c.hearing_place as string}` : ""}. Invitation started {fmt(c.invited_on)}.
              </p>
            ) : null}
            {!c.outcome && !closed && (
              <>
                {!grievance && c.recommendation && c.recommendation !== "hearing" && (
                  <p className="text-sm text-muted-foreground">The investigation recommends {recommendationLabel(c.recommendation as string).toLowerCase()}: you can still go to a hearing.</p>
                )}
                <InviteForm caseId={id} grievance={grievance} noticeDays={s.hearingNoticeDays} />
              </>
            )}
            <h4 className="pt-2 text-sm font-semibold">Minutes</h4>
            {(meetings ?? []).map((m) => (
              <div key={m.id as string} className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {MEETING_LABEL[m.kind as string]}, {fmt(m.held_on as string)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {[m.attendees, m.accompanied_by ? `accompanied by ${m.accompanied_by}` : "not accompanied"].filter(Boolean).join(" · ")}
                  </span>
                </p>
                <p className="whitespace-pre-line">{m.minutes as string}</p>
                {m.employee_signed_at ? (
                  <p className="text-xs text-green-700">Signed as accurate by {m.employee_signed_name as string}, {formatDateTime(m.employee_signed_at as string)}.</p>
                ) : m.refused_to_sign ? (
                  <p className="text-xs text-amber-800">They refused to sign: {m.refused_note as string}</p>
                ) : !closed ? (
                  <SignMinutes caseId={id} meetingId={m.id as string} name={personName(person)} />
                ) : null}
              </div>
            ))}
            {!closed && (
              <MeetingForm
                caseId={id}
                kinds={
                  grievance
                    ? [
                        { value: "meeting", label: "Grievance meeting" },
                        { value: "investigation", label: "Investigation meeting" },
                        { value: "appeal", label: "Appeal hearing" },
                      ]
                    : [
                        { value: "hearing", label: "Hearing" },
                        { value: "investigation", label: "Investigation meeting" },
                        { value: "appeal", label: "Appeal hearing" },
                      ]
                }
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className={section}>
            <h3 className="font-semibold">Outcome</h3>
            {c.outcome ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">{outcomeLabel(c.outcome)}</span>, {fmt(c.outcome_on)}, decided by {nameOf(c.decided_by as string | null)}.
                </p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{c.outcome_notes as string}</p>
                {c.warning_expires_on && !closed && <WarningExpiry caseId={id} on={c.warning_expires_on} />}
                {c.warning_expires_on && !warning && <p className="text-xs text-muted-foreground">Expired: on record, no longer active.</p>}
              </>
            ) : closed ? (
              <p className="text-sm text-muted-foreground">No outcome recorded.</p>
            ) : (
              <OutcomeForm caseId={id} grievance={grievance} firstMonths={s.warningFirstMonths} finalMonths={s.warningFinalMonths} />
            )}
          </CardContent>
        </Card>

        {appealable(c) && (
          <Card>
            <CardContent className={section}>
              <h3 className="font-semibold">Appeal</h3>
              {c.appeal_received_on ? (
                <>
                  <p className="text-sm">
                    Received {fmt(c.appeal_received_on)}; heard by {nameOf(c.appeal_manager_id as string | null)}
                    {c.appeal_hearing_on ? ` on ${fmt(c.appeal_hearing_on)}` : ""}.
                  </p>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{c.appeal_grounds as string}</p>
                  {c.appeal_outcome ? (
                    <>
                      <p className="text-sm font-medium">{appealLabel(c.appeal_outcome)}, {fmt(c.appeal_decided_on as string)}.</p>
                      <p className="whitespace-pre-line text-sm text-muted-foreground">{c.appeal_outcome_notes as string}</p>
                    </>
                  ) : !closed ? (
                    <AppealOutcomeForm caseId={id} />
                  ) : null}
                </>
              ) : closed ? (
                <p className="text-sm text-muted-foreground">No appeal.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">They have {s.appealDays} days from the outcome letter to appeal. Heard by a manager not involved so far, wherever possible.</p>
                  <AppealForm caseId={id} managers={managers} disciplinary={!grievance} />
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className={section}>
            <h3 className="font-semibold">Legal reminders</h3>
            <LegalDuties
              caseId={id}
              state={{
                dbs_referral: { status: c.dbs_referral, on: c.dbs_referral_on ? fmt(c.dbs_referral_on as string) : null },
                cqc_notice: { status: c.cqc_notice, on: c.cqc_notice_on ? fmt(c.cqc_notice_on as string) : null },
                la_notice: { status: c.la_notice, on: c.la_notice_on ? fmt(c.la_notice_on as string) : null },
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className={section}>
            <h3 className="font-semibold">Letters</h3>
            {(letters ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Letters are written from each step above.</p>
            ) : (
              <ul className="divide-y text-sm">
                {(letters ?? []).map((l) => (
                  <li key={l.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/org/hr/letters/${l.id}?back=${encodeURIComponent(`/org/hr/cases/${id}`)}`} className="font-medium text-primary hover:underline">
                      {templateFor(l.kind as string)?.label ?? (l.subject as string)}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === "sent" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {l.status === "sent" ? `Sent ${fmt(l.sent_at as string)}` : "Draft: not sent"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className={section}>
            <h3 className="font-semibold">Notes and what happened</h3>
            <ul className="space-y-1.5 text-sm">
              {(notes ?? []).filter((n) => n.kind !== "evidence").map((n) => (
                <li key={n.id as string}>
                  <span className="text-xs text-muted-foreground">{formatDateTime(n.created_at as string)} · {nameOf(n.created_by as string | null)}</span>
                  <p className={`whitespace-pre-line ${n.kind === "event" ? "text-muted-foreground" : ""}`}>{n.body as string}</p>
                </li>
              ))}
            </ul>
            {!closed && <NoteForm caseId={id} />}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <CloseCase caseId={id} closed={closed} />
          <span className="text-sm text-muted-foreground">Stage: {stageLabel(c.kind, c.stage)}{closed ? `, closed ${fmt(c.closed_on)}` : ""}</span>
        </div>
      </div>
    </DashboardShell>
  );
}
