import { NextResponse, type NextRequest } from "next/server";
import { requireConsole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enabledMap } from "@/lib/entitlements";
import { logAudit } from "@/lib/audit";
import { loadOrgLearnerTraining } from "@/lib/org-learner";
import { loadPersonActions } from "@/lib/person-tasks";
import { loadSupervisions, kindLabel } from "@/lib/supervisions";
import { areaLabel, loadCompetencyChecks, outcomeLabel } from "@/lib/competency";
import {
  categoryLabel,
  kindLabel as incidentKindLabel,
  loadIncidentsForPerson,
  statusLabel,
} from "@/lib/incidents";
import { packContents, since } from "@/lib/evidence-pack";
import { responseRows, type FormTemplateRecord } from "@/lib/form-library";
import { renderEvidencePack, type PackSectionData } from "@/lib/evidence-pack-pdf";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const INVALID = /[\\/:*?"<>|]/g;
const safeName = (s: string) => s.replace(INVALID, "").replace(/\s+/g, " ").trim();

function fmt(d: string | null): string {
  if (!d) return "—";
  return formatDate(d, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One carer's file as a single dated PDF — CARER-FILE.md §4.
 *
 * Everything is read through the RLS-scoped client, so a section the
 * organisation does not have comes back empty whatever this route asks for.
 * The entitlement map is read as well, because "you never bought this" and
 * "this carer has none" must appear differently on the cover: a pack that
 * silently omits supervisions reads as a provider with no supervisions.
 *
 *   /org/staff/<id>/evidence            everything on file
 *   /org/staff/<id>/evidence?from=…     since a date
 *
 * Source files are not bundled here. Certificates already have their own ZIP
 * (/org/certificates/pack), and one route that both renders a PDF and streams
 * a hundred attachments is the one that hits the 60-second function limit on
 * the carer who has been there four years.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const context = await requireConsole();
  const { userId } = await params;
  if (!context.organisationId) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const fromParam = req.nextUrl.searchParams.get("from");
  // A malformed date would silently filter everything out, which looks exactly
  // like a carer with no history. Ignore it instead.
  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : null;

  const supabase = await createClient();

  // All in one round: these were three sequential steps (entitlements, the
  // training record, then everything else). The gated sections still wait for
  // the entitlement answer — an unpaid section runs no query — but nothing
  // else waits for anything.
  const enabledRead = enabledMap(context);
  const [
    enabled,
    { profile, enrolments, certificates },
    { data: org },
    actions,
    [supervisions, checks, incidents, formResponses],
    { data: classroomRows },
  ] = await Promise.all([
    enabledRead,
    loadOrgLearnerTraining(supabase, userId),
    supabase.from("organisations").select("name").eq("id", context.organisationId).single(),
    loadPersonActions(supabase, userId),
    enabledRead.then((on) =>
      Promise.all([
        on["people.supervisions"] ? loadSupervisions(supabase, userId) : Promise.resolve([]),
        on["people.competency"] ? loadCompetencyChecks(supabase, userId) : Promise.resolve([]),
        on["complaints.register"]
          ? loadIncidentsForPerson(supabase, userId)
          : Promise.resolve([]),
        // Their completed library forms, with the questions to read them by.
        on["forms.builder"]
          ? supabase
              .from("form_responses")
              .select("answers, signed_name, submitted_at, template:form_templates (title, fields)")
              .eq("user_id", userId)
              .order("submitted_at", { ascending: false })
              .limit(200)
              .then((r) => r.data ?? [])
          : Promise.resolve([]),
      ]),
    ),
    // Face-to-face sessions they attended, printed with the training record.
    supabase
      .from("classroom_attendance")
      .select("certificate_id, session:classroom_sessions (title, held_on, trainer_name, duration_minutes)")
      .eq("user_id", userId)
      .limit(200),
  ]);
  if (!profile) return new NextResponse("Not found.", { status: 404 });

  // Each record is filtered on its own date, so "since her last supervision"
  // means the same thing in every section.
  const trainingRows = since(enrolments, (e) => e.assigned_at, from);
  const classroomSessions = since(
    (classroomRows ?? []).flatMap((r) => {
      const s = (Array.isArray(r.session) ? r.session[0] : r.session) as
        | { title: string; held_on: string; trainer_name: string | null; duration_minutes: number | null }
        | null;
      return s ? [{ ...s, certified: !!r.certificate_id }] : [];
    }),
    (s) => s.held_on,
    from,
  );
  const certificateRows = since(certificates, (c) => c.issued_at, from);
  const actionRows = since(actions, (a) => a.due_date ?? a.completed_at, from);
  const supervisionRows = since(supervisions, (s) => s.held_on, from);
  const checkRows = since(checks, (c) => c.checked_on, from);
  const incidentRows = since(incidents, (i) => i.occurred_on, from);
  const formRows = since(formResponses, (f) => f.submitted_at as string, from);

  const contents = packContents({
    enabled,
    counts: {
      training: trainingRows.length + classroomSessions.length,
      certificates: certificateRows.length,
      actions: actionRows.length,
      supervisions: supervisionRows.length,
      competency: checkRows.length,
      complaints: incidentRows.length,
      forms: formRows.length,
    },
  });

  const bySection: Record<string, PackSectionData["rows"]> = {
    training: [
      ...trainingRows.map((e) => ({
        when: fmt(e.assigned_at),
        what: e.title,
        detail: e.due_date ? `Due ${fmt(e.due_date)}` : null,
        status: e.status === "completed" ? "Completed" : e.status.replace("_", " "),
      })),
      ...classroomSessions.map((c) => ({
        when: fmt(c.held_on),
        what: `Classroom: ${c.title}`,
        detail: [c.trainer_name ? `Trainer: ${c.trainer_name}` : null, c.duration_minutes ? `${c.duration_minutes} minutes` : null]
          .filter(Boolean)
          .join(" · ") || null,
        status: c.certified ? "Attended · certificate issued" : "Attended",
      })),
    ],
    certificates: certificateRows.map((c) => ({
      when: fmt(c.issued_at),
      what: c.title,
      detail: c.number,
      status: c.expires_at ? `Expires ${fmt(c.expires_at)}` : "No expiry",
    })),
    actions: actionRows.map((a) => ({
      when: fmt(a.due_date),
      what: a.title,
      detail: a.detail,
      status: a.completed_at ? `Done ${fmt(a.completed_at)}` : "Outstanding",
    })),
    supervisions: supervisionRows.map((s) => ({
      when: fmt(s.held_on),
      what: `${kindLabel(s.kind)}${s.supervisor_name ? ` — held by ${s.supervisor_name}` : ""}`,
      // Whether the carer signed it at the time, or why not (CARER-FILE.md §9).
      detail: [
        s.summary,
        ...s.actions_review.map((a) => `Last time: ${a.title} — ${a.status === "done" ? "done" : "not yet"}${a.comment ? ` (${a.comment})` : ""}`),
        ...s.answers.filter((a) => a.answer).map((a) => `${a.label}: ${a.answer}`),
        s.manager_signed_name ? `Signed by ${s.manager_signed_name} for the company.` : null,
        s.carer_signed_name
          ? `Signed by ${s.carer_signed_name}${s.carer_signed_at ? ` on ${fmt(s.carer_signed_at)}` : ""}.`
          : s.carer_unsigned_reason
            ? `Not signed by the carer: ${s.carer_unsigned_reason}.`
            : null,
      ]
        .filter(Boolean)
        .join("\n") || null,
      status: s.next_due ? `Next ${fmt(s.next_due)}` : null,
    })),
    competency: checkRows.map((c) => ({
      when: fmt(c.checked_on),
      what: `${areaLabel(c.area)}${c.assessor_name ? ` — ${c.assessor_name}` : ""}`,
      detail: c.notes,
      status: outcomeLabel(c.outcome),
    })),
    complaints: incidentRows.map((i) => ({
      when: fmt(i.occurred_on),
      what: `${incidentKindLabel(i.kind)} — ${categoryLabel(i.category)}`,
      detail: i.outcome ? `${i.summary}\nOutcome: ${i.outcome}` : i.summary,
      status: statusLabel(i.status),
    })),
    forms: formRows.map((f) => {
      const t = (Array.isArray(f.template) ? f.template[0] : f.template) as Pick<FormTemplateRecord, "title" | "fields"> | null;
      const answers = (f.answers as Record<string, unknown> | null) ?? {};
      return {
        when: fmt(f.submitted_at as string),
        what: t?.title ?? "Form",
        detail:
          responseRows(t?.fields ?? [], answers)
            .map((r) => `${r.label}: ${r.value || "—"}`)
            .join("\n") || null,
        status: f.signed_name ? `Signed: ${f.signed_name}` : "Completed",
      };
    }),
  };

  const sections: PackSectionData[] = contents.included.map((s) => ({
    key: s.key,
    label: s.label,
    rows: bySection[s.key] ?? [],
  }));

  const name = profile.full_name ?? profile.email ?? "Carer";
  const pdf = await renderEvidencePack({
    personName: name,
    personEmail: profile.email ?? null,
    organisationName: (org?.name as string) ?? "This organisation",
    generatedAt: new Date(),
    generatedBy: context.email ?? "An administrator",
    from,
    contents,
    sections,
  });

  // A carer's file is personal data about a named person, and "we don't know
  // who downloaded it" is not an answer anyone wants to give an inspector.
  await logAudit({
    context,
    action: "evidence_pack.exported",
    entity: "user",
    entityId: userId,
    detail: { from, sections: contents.included.map((s) => s.key) },
  });

  const filename = safeName(`Evidence pack - ${name} - ${new Date().toISOString().slice(0, 10)}`);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
