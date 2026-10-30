import Link from "next/link";
import { FileText } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/learner-ui";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { PROBATION_STATUS_LABEL } from "@/lib/hr/probation";
import { ReportSick } from "./report-sick";
import { RaiseGrievance } from "./raise-grievance";
import { CancelMyLeave } from "./cancel-leave";
import { LeaveForm } from "@/app/org/hr/holidays/holiday-forms";
import { requestLeaveAction } from "./actions";
import { STATUS_LABEL, amountText, balance, holidaySettingsFromRow, leaveTypeLabel, leaveTypesFor, leaveYear, type LeaveRequest } from "@/lib/hr/holidays";

const fmt = (d: string) => formatDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const short = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

/**
 * A member of staff's own HR page (HR-PACK.md): the letters sent to them, and
 * the dates of their probation reviews. Never a manager's notes or a review
 * record — only what was sent to them, or booked with them.
 */
export default async function MyHrPage() {
  const context = await requireStaff();
  await requireFeature(context, "recruitment.tracker", "/learn");
  const supabase = await createClient();
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: letters }, { data: emp }, { data: booked }, { data: settings }, { data: absences }, { data: leave }] = await Promise.all([
    supabase.from("hr_letters").select("id, subject, sent_at").eq("user_id", context.userId).eq("status", "sent").order("sent_at", { ascending: false }).limit(100),
    supabase.from("staff_employment").select("start_date, job_title, probation_status, probation_ends_on").eq("user_id", context.userId).maybeSingle(),
    // Only the booked dates: the review itself is the manager's record.
    admin
      .from("probation_reviews")
      .select("due_on, booked_on, booked_time, is_final")
      .eq("user_id", context.userId)
      .neq("status", "held")
      .not("booked_on", "is", null)
      .gte("booked_on", new Date().toISOString().slice(0, 10))
      .order("booked_on"),
    admin
      .from("hr_settings")
      .select("self_report_sickness, leave_year_start, bank_holidays_from_allowance, max_off_at_once, leave_types")
      .eq("organisation_id", context.organisationId!)
      .maybeSingle(),
    // Their own absences: the dates and reason only, never the manager's notes.
    admin.from("sickness_absences").select("id, start_date, returned_on, reason").eq("user_id", context.userId).order("start_date", { ascending: false }).limit(20),
    supabase
      .from("leave_requests")
      .select("id, user_id, leave_type, start_date, end_date, amount, unit, status, decision_note")
      .eq("user_id", context.userId)
      .order("start_date", { ascending: false })
      .limit(100),
  ]);
  const hs = holidaySettingsFromRow(settings);
  const year = leaveYear(today, hs.yearStart);
  const { data: allowance } = await supabase.from("leave_allowances").select("amount, unit").eq("user_id", context.userId).eq("year_start", year.start).maybeSingle();
  const myLeave = (leave ?? []) as unknown as Array<LeaveRequest & { decision_note: string | null }>;
  const types = leaveTypesFor(hs.own);
  const unit = (allowance?.unit as string | undefined) ?? "days";
  const bal = balance(allowance ? { amount: Number(allowance.amount), unit } : null, myLeave, year, types, today);
  const offNow = (absences ?? []).find((a) => !a.returned_on);
  // Who a grievance can be about: anyone else in the company.
  const { data: colleagues } = await admin
    .from("users")
    .select("id, full_name, email")
    .eq("organisation_id", context.organisationId!)
    .neq("id", context.userId)
    .in("role", ["learner", "org_admin", "org_office"])
    .eq("status", "active")
    .order("full_name")
    .limit(1000);
  const inProbation = emp && (emp.probation_status === "in_probation" || emp.probation_status === "extended");

  return (
    <DashboardShell learn title="My HR" context={context}>
      <div className="space-y-6">
        {emp && (
          <Card>
            <CardContent className="space-y-1 pt-6 text-sm">
              {emp.job_title && <p className="font-medium">{emp.job_title as string}</p>}
              {emp.start_date && <p className="text-muted-foreground">Started {short(emp.start_date as string)}</p>}
              {inProbation && emp.probation_ends_on && (
                <p className="text-muted-foreground">
                  {PROBATION_STATUS_LABEL[emp.probation_status as string]}: it ends {short(emp.probation_ends_on as string)}.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Holidays</h2>
          <Card>
            <CardContent className="space-y-4 pt-6 text-sm">
              {bal.allowance !== null ? (
                <p>
                  <span className="text-lg font-semibold">{amountText(bal.left ?? 0, unit)} left</span>
                  <span className="ml-2 text-muted-foreground">
                    of {amountText(bal.allowance, unit)} this leave year · taken {amountText(bal.taken, unit)} · booked {amountText(bal.booked, unit)}
                    {bal.pending ? ` · waiting ${amountText(bal.pending, unit)}` : ""}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">The office hasn&apos;t set your allowance for this leave year yet.</p>
              )}
              <LeaveForm types={types} unit={unit} bankHolidaysFromAllowance={hs.bankHolidaysFromAllowance} submit={requestLeaveAction} submitLabel="Ask for this leave" />
              {myLeave.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {myLeave.slice(0, 20).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>
                        {leaveTypeLabel(r.leave_type, hs.own)}: {short(r.start_date)}
                        {r.end_date !== r.start_date ? ` to ${short(r.end_date)}` : ""} · {amountText(r.amount, r.unit)}
                        {r.decision_note ? <span className="block text-xs text-muted-foreground">{r.decision_note}</span> : null}
                      </span>
                      <span className="flex items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "requested" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                        {r.status === "requested" && <CancelMyLeave id={r.id} />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Sickness</h2>
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm">
              {offNow ? (
                <p>
                  You&apos;re off sick from {short(offNow.start_date as string)} ({offNow.reason as string}). The office records the day you&apos;re back.
                </p>
              ) : settings?.self_report_sickness ? (
                <ReportSick />
              ) : (
                <p className="text-muted-foreground">If you&apos;re too ill to work, ring the office or the on-call line as soon as you can.</p>
              )}
              {(absences ?? []).filter((a) => a.returned_on).length > 0 && (
                <ul className="space-y-0.5 text-muted-foreground">
                  {(absences ?? [])
                    .filter((a) => a.returned_on)
                    .slice(0, 5)
                    .map((a) => (
                      <li key={a.id as string}>
                        {short(a.start_date as string)}: {a.reason as string}, back {short(a.returned_on as string)}
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {(booked ?? []).length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Booked with you</h2>
            {(booked ?? []).map((b) => (
              <Card key={b.due_on as string}>
                <CardContent className="pt-6 text-sm">
                  <p className="font-semibold">{b.is_final ? "End of probation review" : "Probation review"}</p>
                  <p>
                    {fmt(b.booked_on as string)}
                    {b.booked_time ? ` at ${b.booked_time}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">A grievance</h2>
          <Card>
            <CardContent className="pt-6">
              <RaiseGrievance people={(colleagues ?? []).map((u) => ({ id: u.id as string, name: ((u.full_name as string | null) || (u.email as string)) ?? "" }))} />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Letters sent to you</h2>
          {(letters ?? []).length === 0 ? (
            <EmptyState icon={FileText} title="No letters">
              Letters from {"your employer"} about your job appear here, as well as in your email.
            </EmptyState>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {(letters ?? []).map((l) => (
                  <Link
                    key={l.id as string}
                    href={`/learn/hr/letters/${l.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium text-primary">{l.subject as string}</span>
                    <span className="text-xs text-muted-foreground">{short(l.sent_at as string)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
