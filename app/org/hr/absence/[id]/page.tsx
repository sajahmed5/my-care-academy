import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import type { Answers } from "@/lib/recruitment-application";
import { daysOff, isLongTerm, needsFitNote, rtwDueOn, rtwFlags, welfareDueOn, type Absence } from "@/lib/hr/absence";
import { hrPerson, personName } from "@/lib/hr/server";
import { AbsenceForm, DeleteAbsence, FitNote, OhForm, RtwForm, WelfareForm } from "../absence-forms";

const fmt = (d: string | null) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * One absence: its dates and reason, the fit note, the return-to-work
 * interview, and for a long-term absence the welfare meetings and any
 * occupational health referral.
 */
export default async function AbsencePage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const admin = createAdminClient();
  const { data: a } = await admin.from("sickness_absences").select("*").eq("id", id).maybeSingle();
  if (!a || a.organisation_id !== context.organisationId) notFound();
  const person = await hrPerson(admin, context.organisationId, a.user_id as string);
  if (!person) notFound();
  const { data: meetings } = await admin.from("absence_welfare_meetings").select("id, held_on, how, notes").eq("absence_id", id).order("held_on");
  const today = new Date().toISOString().slice(0, 10);
  const absence = a as unknown as Absence;
  const days = daysOff(absence, today);
  const welfare = welfareDueOn(absence, (meetings ?? []).map((m) => m.held_on as string), today);
  const long = isLongTerm(absence, today) || (meetings ?? []).length > 0 || !!a.oh_referred_on;
  const flags = a.rtw_status === "held" ? rtwFlags(a.rtw_answers as Record<string, unknown>) : [];
  const card = "space-y-3 pt-6";

  return (
    <DashboardShell
      title={`Absence: ${personName(person)}`}
      context={context}
      back={{ href: `/org/staff/${person.id}?section=employment&sub=absence`, label: personName(person) }}
    >
      <div className="max-w-3xl space-y-4">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.returned_on ? "bg-muted text-muted-foreground" : "bg-rose-100 text-rose-700"}`}>
            {a.returned_on ? `Back ${fmt(a.returned_on as string)}` : "Still off"}
          </span>
          <span className="text-muted-foreground">
            {a.reason as string} · from {fmt(a.start_date as string)} · {days} day{days === 1 ? "" : "s"}
            {a.reported_by_self ? " · reported by them" : ""}
            {a.excluded_from_triggers ? ` · not counted in triggers (${a.exclusion_reason as string})` : ""}
          </span>
        </p>

        <Card>
          <CardContent className={card}>
            <h3 className="font-semibold">The absence</h3>
            <AbsenceForm
              absenceId={id}
              initial={{
                startDate: a.start_date as string,
                returnedOn: (a.returned_on as string | null) ?? "",
                reason: a.reason as string,
                reasonDetail: (a.reason_detail as string | null) ?? "",
                certification: a.certification as string,
                excluded: a.excluded_from_triggers as boolean,
                exclusionReason: (a.exclusion_reason as string | null) ?? "",
              }}
            />
            <DeleteAbsence id={id} userId={person.id} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className={card}>
            <h3 className="font-semibold">Fit note</h3>
            {needsFitNote(absence, today) && !a.fit_note_path && (
              <p className="text-sm text-amber-800">Off more than 7 days: a fit note is needed from the eighth day.</p>
            )}
            <FitNote id={id} held={!!a.fit_note_path} name={(a.fit_note_name as string | null) ?? null} until={a.fit_note_until ? fmt(a.fit_note_until as string) : null} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className={card}>
            <h3 className="font-semibold">Return-to-work interview</h3>
            {!a.returned_on ? (
              <p className="text-sm text-muted-foreground">Once they&apos;re back. It&apos;s due within 3 days of their first day back.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {a.rtw_status === "held" ? `Held ${fmt(a.rtw_held_on as string)}.` : `Due by ${fmt(rtwDueOn(absence))}.`}
                </p>
                {flags.length > 0 && (
                  <ul className="list-disc rounded-lg bg-amber-50 px-6 py-2 text-sm text-amber-950">
                    {flags.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
                <RtwForm id={id} initial={(a.rtw_answers as Answers) ?? {}} held={a.rtw_status === "held"} status={a.rtw_status as string} />
              </>
            )}
          </CardContent>
        </Card>

        {long && (
          <Card>
            <CardContent className={card}>
              <h3 className="font-semibold">Long-term sickness</h3>
              <p className="text-sm text-muted-foreground">
                Over 4 weeks off. Keep in touch with a welfare meeting every 4 weeks
                {welfare ? `: the next is due ${fmt(welfare)}` : ""}.
              </p>
              {(meetings ?? []).length > 0 && (
                <ul className="divide-y rounded-lg border text-sm">
                  {(meetings ?? []).map((m) => (
                    <li key={m.id as string} className="space-y-0.5 px-3 py-2">
                      <p className="font-medium">{fmt(m.held_on as string)}{m.how ? ` · ${m.how}` : ""}</p>
                      <p className="whitespace-pre-line text-muted-foreground">{m.notes as string}</p>
                    </li>
                  ))}
                </ul>
              )}
              {!a.returned_on && <WelfareForm id={id} />}
              <h4 className="pt-2 text-sm font-semibold">Occupational health</h4>
              <OhForm id={id} referredOn={(a.oh_referred_on as string | null) ?? ""} notes={(a.oh_notes as string | null) ?? ""} />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
