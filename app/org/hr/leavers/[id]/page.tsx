import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConsole } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/dashboard-shell";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/dates";
import { answerText, type Answers } from "@/lib/recruitment-application";
import { CHECKLIST, EXIT_SECTIONS, asksAboutDbs, reasonLabel, sanitiseChecklist } from "@/lib/hr/leavers";
import { hrPerson, personName } from "@/lib/hr/server";
import { ChecklistRow, LeaverButtons, LeaverDbs, LeaverForm } from "../leaver-forms";
import { References } from "../references";

const fmt = (d: string | null | undefined) => (d ? formatDate(d, { day: "numeric", month: "short", year: "numeric" }) : "—");

/**
 * One person's leaving (HR-PACK.md): the record, the checklist, their login
 * and training record, the exit interview, references given, and the DBS
 * barring referral reminder where it applies.
 */
export default async function LeaverPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireConsole();
  await requireFeature(context, "recruitment.tracker");
  const { id } = await params;
  const admin = createAdminClient();
  const { data: l } = await admin.from("hr_leavers").select("*").eq("id", id).maybeSingle();
  if (!l || l.organisation_id !== context.organisationId) notFound();
  const person = await hrPerson(admin, context.organisationId, l.user_id as string);
  if (!person) notFound();
  const checklist = sanitiseChecklist(l.checklist);
  const answers = (l.exit_answers as Answers) ?? {};
  const card = "space-y-3 pt-6";
  return (
    <DashboardShell title={`Leaving: ${personName(person)}`} context={context} back={{ href: "/org/hr/leavers", label: "Leavers" }}>
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">
          <Link href={`/org/staff/${person.id}?section=employment&sub=leaving`} className="font-medium text-primary hover:underline">{personName(person)}</Link>
          {" · "}
          {reasonLabel(l.reason as string)} · last day {fmt(l.last_day as string)} ·{" "}
          {l.login_off_at ? `login switched off ${formatDateTime(l.login_off_at as string)}` : "login switches off the day after their last day"}
          {l.training_sent_at ? ` · training record emailed ${fmt(l.training_sent_at as string)}` : ""}
        </p>

        <Card>
          <CardContent className={card}>
            <h3 className="font-semibold">The record</h3>
            <LeaverForm
              leaverId={id}
              initial={{
                reason: l.reason as string,
                reasonDetail: (l.reason_detail as string | null) ?? "",
                noticeOn: (l.notice_on as string | null) ?? "",
                lastDay: l.last_day as string,
                reEmployable: l.re_employable as string,
                reEmployableNote: (l.re_employable_note as string | null) ?? "",
              }}
            />
            <LeaverButtons leaverId={id} exitStatus={l.exit_status as string} loginOff={!!l.login_off_at} trainingSent={!!l.training_sent_at} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold">Leaver checklist</h3>
            <div className="divide-y">
              {CHECKLIST.map((c) => (
                <ChecklistRow
                  key={c.key}
                  leaverId={id}
                  itemKey={c.key}
                  label={c.label}
                  hint={"hint" in c ? c.hint : undefined}
                  done={!!checklist[c.key]?.done}
                  on={checklist[c.key]?.on ? fmt(checklist[c.key]!.on!) : null}
                  note={checklist[c.key]?.note ?? null}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {asksAboutDbs(l.reason as string) && (
          <Card>
            <CardContent className={card}>
              <h3 className="font-semibold">Legal reminder</h3>
              <LeaverDbs leaverId={id} status={l.dbs_referral as string} on={l.dbs_referral_on ? fmt(l.dbs_referral_on as string) : null} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className={card}>
            <h3 className="font-semibold">Exit interview</h3>
            {l.exit_status === "done" ? (
              <dl className="space-y-2 text-sm">
                {EXIT_SECTIONS.flatMap((s) => s.fields)
                  .filter((f) => answers[f.id] !== undefined && answers[f.id] !== "")
                  .map((f) => (
                    <div key={f.id}>
                      <dt className="text-muted-foreground">{f.label}</dt>
                      <dd className="whitespace-pre-line">{answerText(f, answers[f.id])}</dd>
                    </div>
                  ))}
                <p className="text-xs text-muted-foreground">Answered {formatDateTime(l.exit_done_at as string)}.</p>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                {l.exit_status === "asked"
                  ? "Asked: they can answer on their login until their last day, or from the emailed link."
                  : l.exit_status === "declined"
                    ? "They'd rather not."
                    : "Optional. Ask, and they answer on their login or from a link."}
              </p>
            )}
          </CardContent>
        </Card>

        <References userId={person.id} context={context} />
      </div>
    </DashboardShell>
  );
}
