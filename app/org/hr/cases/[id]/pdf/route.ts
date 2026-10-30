import { NextResponse, type NextRequest } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { orgBranding } from "@/lib/branding";
import { logAudit } from "@/lib/audit";
import { renderHrPdf, ukDate, type HrBlock, type HrDoc } from "@/lib/hr-pdf";
import { appealLabel, kindLabel, outcomeLabel, recommendationLabel } from "@/lib/hr/cases";
import { loadCase } from "@/lib/hr/case-access";
import { hrPerson, personName } from "@/lib/hr/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MEETING: Record<string, string> = { investigation: "Investigation meeting", hearing: "Hearing", meeting: "Grievance meeting", appeal: "Appeal hearing" };
const paras = (t: string | null | undefined): HrBlock[] => String(t ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((text) => ({ type: "para", text }));

/**
 * The whole case file as one PDF (HR-PACK.md), for a tribunal: the case, the
 * timeline, the investigation, each set of minutes with how they were signed,
 * every witness statement, and every letter as sent. Evidence files are
 * listed by name. Each download is written to the audit log.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // MFA and the deactivated-account check, as every console page has.
  const context = await requireConsole();
  if (!context.organisationId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const admin = createAdminClient();
  const c = await loadCase(admin, context, id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const person = await hrPerson(admin, context.organisationId, c.user_id as string);
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });
  const [{ data: org }, { data: notes }, { data: meetings }, { data: statements }, { data: letters }, brand] = await Promise.all([
    admin.from("organisations").select("name").eq("id", context.organisationId).maybeSingle(),
    admin.from("hr_case_notes").select("kind, body, file_name, created_at, created_by").eq("case_id", id).order("created_at"),
    admin.from("hr_case_meetings").select("*").eq("case_id", id).order("held_on"),
    admin.from("hr_case_statements").select("*").eq("case_id", id).order("created_at"),
    admin.from("hr_letters").select("subject, body, fixed, status, sent_at, sent_to").eq("source_type", "case").eq("source_id", id).order("created_at"),
    orgBranding(context.organisationId),
  ]);
  // Only the people the file names: who wrote each note, and who held each part of the case.
  const named = [
    ...(notes ?? []).map((n) => n.created_by),
    c.about_user_id,
    c.investigator_id,
    c.decided_by,
    c.appeal_manager_id,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  const ids = [...new Set(named)];
  const { data: users } = ids.length
    ? await admin.from("users").select("id, full_name, email").eq("organisation_id", context.organisationId).in("id", ids)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const nameOf = (uid: unknown) => {
    const u = (users ?? []).find((x) => x.id === uid);
    return u ? personName(u as never) : "—";
  };
  const meta = (label: string, value: unknown): HrBlock[] => (value ? [{ type: "meta", label, value: String(value) }] : []);

  const docs: HrDoc[] = [
    {
      title: `Case file ${c.ref as string}`,
      subtitle: `${kindLabel(c.kind as string, c.subtype as string | null)} · ${personName(person)} · made ${ukDate(new Date().toISOString())}`,
      blocks: [
        ...meta("Employee", personName(person)),
        ...meta("About", c.about_user_id ? nameOf(c.about_user_id) : null),
        ...meta("Raised", ukDate(c.raised_on as string)),
        ...meta("Linked to", c.linked_label),
        ...meta("Suspended", c.suspended_on ? `${ukDate(c.suspended_on as string)}${c.suspension_ended_on ? ` to ${ukDate(c.suspension_ended_on as string)}` : ""}, on full pay` : null),
        ...meta("Investigator", c.investigator_id ? nameOf(c.investigator_id) : null),
        ...meta("Hearing or meeting", c.hearing_on ? ukDate(c.hearing_on as string) : null),
        ...meta("Outcome", c.outcome ? `${outcomeLabel(c.outcome as string)}, ${ukDate(c.outcome_on as string)}, by ${nameOf(c.decided_by)}` : null),
        ...meta("Warning active until", c.warning_expires_on ? ukDate(c.warning_expires_on as string) : null),
        ...meta("Appeal", c.appeal_received_on ? `Received ${ukDate(c.appeal_received_on as string)}, heard by ${nameOf(c.appeal_manager_id)}${c.appeal_outcome ? `: ${appealLabel(c.appeal_outcome as string)}` : ""}` : null),
        ...meta("Closed", c.closed_on ? ukDate(c.closed_on as string) : null),
        { type: "heading", text: c.kind === "grievance" ? "The grievance" : "The concern" },
        ...paras(c.summary as string),
        ...(c.suspension_reason ? [{ type: "heading" as const, text: "Reason for suspension" }, ...paras(c.suspension_reason as string)] : []),
        ...(c.investigation_report
          ? [
              { type: "heading" as const, text: "Investigation report" },
              ...paras(c.investigation_report as string),
              ...(c.recommendation ? [{ type: "para" as const, text: `Recommendation: ${recommendationLabel(c.recommendation as string)}.` }] : []),
            ]
          : []),
        ...(c.outcome_notes ? [{ type: "heading" as const, text: "Outcome: the reasons" }, ...paras(c.outcome_notes as string)] : []),
        ...(c.appeal_grounds ? [{ type: "heading" as const, text: "Grounds of appeal" }, ...paras(c.appeal_grounds as string)] : []),
        ...(c.appeal_outcome_notes ? [{ type: "heading" as const, text: "Appeal decision: the reasons" }, ...paras(c.appeal_outcome_notes as string)] : []),
        { type: "heading", text: "Legal reminders" },
        {
          type: "list",
          items: [
            ["DBS barring referral", c.dbs_referral, c.dbs_referral_on],
            ["CQC notified", c.cqc_notice, c.cqc_notice_on],
            ["Local authority safeguarding team", c.la_notice, c.la_notice_on],
          ].map(([l, st, on]) => `${l}: ${st === "done" ? `done ${ukDate(on as string)}` : st === "needed" ? "needed, not yet confirmed" : st === "not_needed" ? "not needed" : "not decided"}`),
        },
        { type: "heading", text: "Timeline" },
        { type: "list", items: (notes ?? []).filter((n) => n.kind !== "evidence").map((n) => `${ukDate(n.created_at as string)} · ${nameOf(n.created_by)}: ${n.body as string}`) },
        { type: "heading", text: "Evidence held" },
        { type: "list", items: (notes ?? []).filter((n) => n.kind === "evidence").map((n) => `${n.file_name as string}${n.body ? `: ${n.body as string}` : ""} (added ${ukDate(n.created_at as string)})`) },
      ],
    },
    ...(meetings ?? []).map(
      (m): HrDoc => ({
        title: `${MEETING[m.kind as string]}: minutes`,
        subtitle: `${c.ref as string} · ${ukDate(m.held_on as string)}`,
        blocks: [
          ...meta("Present", m.attendees),
          ...meta("Accompanied by", m.accompanied_by || "Nobody"),
          ...paras(m.minutes as string),
          m.employee_signed_at
            ? { type: "signature", name: m.employee_signed_name as string, title: "Signed as accurate by the employee", when: ukDate(m.employee_signed_at as string) }
            : m.refused_to_sign
              ? { type: "para", text: `The employee refused to sign these minutes. Recorded: ${m.refused_note as string}` }
              : { type: "para", text: "Not yet signed by the employee." },
        ],
      }),
    ),
    ...(statements ?? []).map(
      (w): HrDoc => ({
        title: `Witness statement: ${w.witness_name as string}`,
        subtitle: `${c.ref as string} · ${w.method === "link" ? "written by the witness" : "typed with the investigator"}`,
        blocks: w.status === "signed" ? [...paras(w.statement as string), { type: "signature", name: w.signed_name as string, title: "Signed by the witness", when: ukDate(w.signed_at as string) }] : [{ type: "para", text: "Asked for; not yet written." }],
      }),
    ),
    ...(letters ?? []).map(
      (l): HrDoc => ({
        title: l.subject as string,
        subtitle: l.status === "sent" ? `Letter sent to ${l.sent_to as string} on ${ukDate(l.sent_at as string)}` : "Draft: not sent",
        blocks: [...paras(l.body as string), ...(Array.isArray(l.fixed) ? (l.fixed as string[]).flatMap(paras) : [])],
      }),
    ),
  ];
  const pdf = await renderHrPdf((org?.name as string | undefined) ?? "", docs, brand?.logoUrl);
  await logAudit({ context, action: "hr.case_file_downloaded", entity: "hr_case", entityId: id });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${String(c.ref)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
