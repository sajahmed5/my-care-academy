import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Complaint, ComplaintAction } from "./data";
import type { ComplaintStage } from "./stages";
import { kindLabel } from "./stages";
import { formForStage, meetingLabel } from "./forms";
import { formatAnswer, visibleQuestions, type AnswerMap } from "./schema";
import { concernFindingLines, findingLabel, recordFindings, type ConcernFinding } from "./findings";
import { LETTER_KINDS } from "./compute";
import type { ComplaintGuidance } from "./guidance";

/**
 * The complaint as paper: one stage at a time, or the whole response.
 *
 * Plain, like the evidence pack. A stage PDF is the form as it was filled in,
 * with the actions agreed under it — only what was asked and answered, since a
 * page of blank headings reads as a form nobody filled in. The response is the
 * document a council or the Ombudsman receives: the facts, each concern with
 * our finding beside it, what we did, how it ended, and the stage forms as
 * appendices.
 */

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  brand: { fontSize: 9, letterSpacing: 2, color: "#0f8178", marginBottom: 6 }, // the site's teal, not indigo
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 11, color: "#374151", marginBottom: 14 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 130, color: "#6b7280" },
  metaValue: { flex: 1 },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #d1d5db" },
  q: { fontSize: 9, color: "#4b5563", marginTop: 6, fontFamily: "Helvetica-Bold" },
  a: { fontSize: 10.5, marginTop: 1, lineHeight: 1.35 },
  para: { fontSize: 10.5, lineHeight: 1.4, marginBottom: 6 },
  bullet: { fontSize: 10, marginBottom: 3, paddingLeft: 8 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottom: "0.5 solid #e5e7eb" },
  cell1: { flex: 2, paddingRight: 8 },
  cell2: { width: 90, fontFamily: "Helvetica-Bold" },
  cell3: { flex: 2, color: "#374151" },
  small: { fontSize: 8, color: "#6b7280" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

const ukDate = (iso?: string | null) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : iso || "—";

function Footer({ left }: { left: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

/** A form's sections and answered questions. Hidden and empty ones are left out. */
function FormAnswers({ stage, answers, nameOf }: { stage: ComplaintStage; answers: AnswerMap; nameOf: (id: string) => string }) {
  const form = formForStage(stage);
  if (!form) return null;
  const withNames: AnswerMap = { ...answers };
  for (const s of form.sections) {
    for (const q of s.questions) {
      if (q.optionsSource === "staff" && Array.isArray(withNames[q.id])) {
        withNames[q.id] = (withNames[q.id] as string[]).map(nameOf);
      }
    }
  }
  return (
    <>
      {[...form.sections].sort((a, b) => a.order - b.order).map((section) => {
        const shown = visibleQuestions(section, withNames)
          .map((q) => ({ q, text: formatAnswer(q, withNames[q.id]) }))
          .filter((x) => x.text);
        if (shown.length === 0) return null;
        return (
          <View key={section.id}>
            <Text style={styles.heading}>{section.title}</Text>
            {shown.map(({ q, text }) => (
              <View key={q.id} wrap={false}>
                <Text style={styles.q}>{q.text}</Text>
                <Text style={styles.a}>{text}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}

function Findings({ list }: { list: ConcernFinding[] }) {
  if (list.length === 0) return null;
  return (
    <View>
      <Text style={styles.heading}>Our finding on each concern</Text>
      {list.map((f, i) => (
        <View key={f.id} style={styles.row} wrap={false}>
          <Text style={styles.cell1}>{i + 1}. {f.concern}</Text>
          <Text style={styles.cell2}>{findingLabel(f.finding)}</Text>
          <Text style={styles.cell3}>{f.why}</Text>
        </View>
      ))}
    </View>
  );
}

function Actions({ list, title = "Actions and who is responsible" }: { list: ComplaintAction[]; title?: string }) {
  if (list.length === 0) return null;
  return (
    <View>
      <Text style={styles.heading}>{title}</Text>
      {list.map((a) => (
        <Text key={a.id} style={styles.bullet}>
          • {a.title}
          {a.ownerName ? ` — ${a.ownerName}` : ""}
          {a.dueDate ? ` · by ${ukDate(a.dueDate)}` : ""}
          {a.completedAt ? " · done" : ""}
        </Text>
      ))}
    </View>
  );
}

function Letter({ answers }: { answers: Record<string, unknown> }) {
  const body = typeof answers.body === "string" ? answers.body : "";
  return (
    <View>
      <Meta label="Subject" value={typeof answers.subject === "string" ? answers.subject : null} />
      <Meta label="Sent to" value={typeof answers.sentTo === "string" ? answers.sentTo : null} />
      <Meta label="Sent on" value={typeof answers.sentOn === "string" ? ukDate(answers.sentOn) : "Not yet sent"} />
      <Text style={styles.heading}>The letter</Text>
      {body.split(/\n/).map((line, i) => (
        <Text key={i} style={line.trim() ? styles.para : { height: 6 }}>{line}</Text>
      ))}
    </View>
  );
}

export interface PdfContext {
  complaint: Complaint;
  stages: ComplaintStage[];
  organisationName: string;
  /** Resolve a user id to a name, for the people pickers' answers. */
  nameOf: (id: string) => string;
}

const tagFor = (stage: ComplaintStage) =>
  stage.kind === "incident_actions" ? "actions" : stage.kind === "sg_lessons" ? "lessons" : stage.kind === "action_plan" ? "plan" : stage.kind === "meeting_minutes" ? `meeting:${meetingLabel(stage.name) === "Triage" ? 1 : meetingLabel(stage.name) === "Findings" ? 2 : 3}` : null;

/** One stage: the form as filled in, its findings and actions. */
export function renderStagePdf(ctx: PdfContext, stage: ComplaintStage): Promise<Buffer> {
  const { complaint } = ctx;
  const entry = complaint.stageEntries.find((e) => e.stageId === stage.id);
  const answers = (entry?.formAnswers ?? {}) as AnswerMap;
  const tag = tagFor(stage);
  const findings = recordFindings([stage], () => entry?.formAnswers ?? null);
  const title = meetingLabel(stage.name);
  return renderToBuffer(
    <Document title={`${complaint.reference} — ${title}`} author={ctx.organisationName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{ctx.organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{kindLabel(complaint.kind)} {complaint.reference}</Text>
        <Meta label="Service user" value={complaint.aboutName} />
        <Meta label="Raised by" value={complaint.raisedByName} />
        <Meta label="Date raised" value={ukDate(complaint.reportedOn)} />
        <Meta label="Stage status" value={entry?.status === "done" ? "Done" : entry?.status === "na" ? `Not needed${entry.notes ? ` — ${entry.notes}` : ""}` : "Not finished"} />
        {LETTER_KINDS.has(stage.kind) ? (
          <Letter answers={entry?.formAnswers ?? {}} />
        ) : (
          <>
            <FormAnswers stage={stage} answers={answers} nameOf={ctx.nameOf} />
            <Findings list={findings} />
            {tag && <Actions list={complaint.actions.filter((a) => a.stageTag === tag)} />}
          </>
        )}
        <Footer left={`${ctx.organisationName} — ${complaint.reference} — ${title.toLowerCase()}`} />
      </Page>
    </Document>,
  );
}

/** The whole response: facts, findings, actions, outcome, and the forms as appendices. */
export function renderResponsePdf(ctx: PdfContext): Promise<Buffer> {
  const { complaint, stages } = ctx;
  const answersOf = (id: string) => complaint.stageEntries.find((e) => e.stageId === id)?.formAnswers ?? null;
  const findings = recordFindings(stages, answersOf);
  const formStages = stages.filter((s) => formForStage(s) && complaint.stageEntries.some((e) => e.stageId === s.id && Object.keys(e.formAnswers).length > 0));
  const letters = stages.filter((s) => LETTER_KINDS.has(s.kind) && typeof answersOf(s.id)?.sentOn === "string");
  const people = complaint.people.map((p) => `${p.name ?? "—"}${p.involvement !== "involved" ? ` (${p.involvement})` : ""}`).join(", ");
  const docs = complaint.documents;
  const footer = `${ctx.organisationName} — ${complaint.reference} — response`;

  return renderToBuffer(
    <Document title={`${complaint.reference} — response`} author={ctx.organisationName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{ctx.organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>{kindLabel(complaint.kind)} response</Text>
        <Text style={styles.subtitle}>Reference {complaint.reference}</Text>
        <Meta label="Raised by" value={complaint.raisedByName} />
        <Meta label="Service user" value={complaint.aboutName} />
        <Meta label="Date of incident" value={complaint.occurredOn ? ukDate(complaint.occurredOn) : null} />
        <Meta label="Date raised" value={ukDate(complaint.reportedOn)} />
        <Meta label="Response due" value={complaint.completeBy ? ukDate(complaint.completeBy) : null} />
        <Meta label="Staff named" value={people || null} />
        <Meta label="Status" value={`${complaint.status}${complaint.closedOn ? ` on ${ukDate(complaint.closedOn)}` : ""}`} />

        <Text style={styles.heading}>Detailed description</Text>
        <Text style={styles.para}>{complaint.description}</Text>
        {complaint.desiredOutcome && (
          <>
            <Text style={styles.q}>Desired outcome</Text>
            <Text style={styles.para}>{complaint.desiredOutcome}</Text>
          </>
        )}

        {findings.length > 0 ? (
          <Findings list={findings} />
        ) : (
          <>
            <Text style={styles.heading}>Our finding on each concern</Text>
            <Text style={styles.small}>No findings recorded yet.</Text>
          </>
        )}

        <Actions list={complaint.actions} title="What we did, and who was responsible" />

        {complaint.outcomeSummary && (
          <>
            <Text style={styles.heading}>How it ended</Text>
            <Text style={styles.para}>{complaint.outcomeSummary}</Text>
          </>
        )}
        {complaint.lessonsLearned && (
          <>
            <Text style={styles.heading}>What we have learned</Text>
            <Text style={styles.para}>{complaint.lessonsLearned}</Text>
          </>
        )}
        {complaint.pips.length > 0 && (
          <>
            <Text style={styles.heading}>Performance plans arising from this record</Text>
            {complaint.pips.map((p) => (
              <Text key={p.id} style={styles.bullet}>• {p.carerName} — {p.kind === "disciplinary" ? "disciplinary" : "performance improvement plan"}, {p.status}</Text>
            ))}
          </>
        )}
        {letters.length > 0 && (
          <>
            <Text style={styles.heading}>Correspondence</Text>
            {letters.map((s) => (
              <Text key={s.id} style={styles.bullet}>• {s.name} — sent {ukDate(String(answersOf(s.id)?.sentOn))}</Text>
            ))}
          </>
        )}
        {docs.length > 0 && (
          <>
            <Text style={styles.heading}>Documents held on file</Text>
            {/* Numbered as the evidence bundle numbers its files. */}
            {docs.map((d, i) => (
              <Text key={d.id} style={styles.bullet}>• Document {String(i + 1).padStart(2, "0")}: {d.fileName} — {stages.find((s) => s.id === d.stageId)?.name ?? "record"}, {ukDate(d.uploadedAt)}</Text>
            ))}
          </>
        )}
        <Footer left={footer} />
      </Page>

      {formStages.map((stage, i) => (
        <Page key={stage.id} size="A4" style={styles.page}>
          <Text style={styles.brand}>APPENDIX {String.fromCharCode(65 + i)}</Text>
          <Text style={styles.title}>{meetingLabel(stage.name)}</Text>
          <FormAnswers stage={stage} answers={(answersOf(stage.id) ?? {}) as AnswerMap} nameOf={ctx.nameOf} />
          {concernFindingLines(recordFindings([stage], answersOf)).length > 0 && <Findings list={recordFindings([stage], answersOf)} />}
          {tagFor(stage) && <Actions list={complaint.actions.filter((a) => a.stageTag === tagFor(stage))} />}
          <Footer left={footer} />
        </Page>
      ))}
    </Document>,
  );
}

// ---------------------------------------------------------------------------
// Brought across from MyRoster (29 Oct 2026): the interim update and the
// "what to do" guidance. MyRoster drew them with jsPDF in the browser; here
// they are rendered on the server like the rest of the record.
// ---------------------------------------------------------------------------

/**
 * The letter that goes on top when a council wants the file before the
 * enquiry is finished: it says plainly the review is not done, what is
 * enclosed, what is still to come and by when. The lists are worked out
 * from the file (lib/complaints/interim.ts); only "what we have found so
 * far" is written by a person.
 */
export function renderInterimPdf(
  ctx: PdfContext,
  opts: { done: string[]; outstanding: { label: string; because: string }[]; findings: string | null; preparedBy: string | null; targetDays: number },
): Promise<Buffer> {
  const { complaint } = ctx;
  const due = complaint.completeBy ? ukDate(complaint.completeBy) : "the date we have given you";
  const footer = `${ctx.organisationName} — ${complaint.reference} — interim update — confidential`;
  return renderToBuffer(
    <Document title={`${complaint.reference} — interim update`} author={ctx.organisationName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{ctx.organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>{kindLabel(complaint.kind)}: interim update</Text>
        <Text style={styles.subtitle}>Reference {complaint.reference}</Text>
        <Meta label="Person concerned" value={complaint.aboutName} />
        <Meta label="Received" value={ukDate(complaint.reportedOn)} />
        <Meta label="Full response due" value={complaint.completeBy ? ukDate(complaint.completeBy) : null} />

        <Text style={[styles.para, { marginTop: 12 }]}>
          Thank you for your patience while we look into this. Our enquiry is not finished and this is not our final response, but we know you need to see what we hold, so we are sending it now and will follow it with the rest.
        </Text>
        {complaint.completeBy && (
          <Text style={styles.para}>
            We look into complaints over {opts.targetDays} days from the day they reach us. This one came in on {ukDate(complaint.reportedOn)}, so our full written response is due by {due}. That time is what lets us speak to everyone involved, look at the records properly, and give a fair account rather than a quick one.
          </Text>
        )}

        {opts.findings && (
          <>
            <Text style={styles.heading}>What we have found so far</Text>
            {opts.findings.split(/\n/).map((line, i) => (
              <Text key={i} style={line.trim() ? styles.para : { height: 4 }}>{line}</Text>
            ))}
          </>
        )}

        {opts.done.length > 0 && (
          <>
            <Text style={styles.heading}>What is enclosed</Text>
            {opts.done.map((d) => (
              <Text key={d} style={styles.bullet}>• {d}</Text>
            ))}
          </>
        )}

        {opts.outstanding.length > 0 ? (
          <>
            <Text style={styles.heading}>What is still to come</Text>
            {opts.outstanding.map((o) => (
              <View key={o.label} wrap={false} style={{ marginBottom: 5 }}>
                <Text style={[styles.bullet, { fontFamily: "Helvetica-Bold" }]}>{o.label}</Text>
                <Text style={[styles.bullet, { color: "#4b5563", paddingLeft: 16 }]}>{o.because}</Text>
              </View>
            ))}
            <Text style={[styles.para, { marginTop: 6 }]}>
              We will send each of these as soon as it is complete, and in any event with our full response by {due}. If anything in it changes what we are telling you now, we will say so.
            </Text>
          </>
        ) : (
          <Text style={[styles.para, { marginTop: 8 }]}>Everything we hold on this is enclosed. Our full written response follows by {due}.</Text>
        )}

        <Text style={styles.heading}>If you need anything sooner</Text>
        <Text style={styles.para}>If there is something in particular you need before then, or you would like to talk any of it through, please contact us and we will get it to you.</Text>
        <Text style={[styles.para, { marginTop: 14 }]}>Yours sincerely</Text>
        <Text style={[styles.para, { fontFamily: "Helvetica-Bold", marginTop: 18 }]}>{opts.preparedBy ?? ctx.organisationName}</Text>
        {opts.preparedBy && <Text style={styles.small}>{ctx.organisationName}</Text>}
        <Footer left={footer} />
      </Page>
    </Document>,
  );
}

/** "What to do", as a PDF to hand to a client, a council or CQC. */
export function renderGuidancePdf(g: ComplaintGuidance, organisationName: string): Promise<Buffer> {
  const list = (items: string[]) => items.map((p) => <Text key={p} style={styles.bullet}>• {p}</Text>);
  return renderToBuffer(
    <Document title={g.title} author={organisationName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>{g.title}</Text>
        {g.intro.map((p) => (
          <Text key={p} style={styles.para}>{p}</Text>
        ))}
        <Text style={styles.heading}>Timescales</Text>
        {g.timescales.map((t) => (
          <Meta key={t.label} label={t.label} value={t.value} />
        ))}
        {g.steps.map((s) => (
          <View key={s.title} wrap={false}>
            <Text style={styles.heading}>{s.title}</Text>
            {list(s.points)}
          </View>
        ))}
        <View wrap={false}>
          <Text style={styles.heading}>If someone may be at risk</Text>
          {list(g.safeguarding)}
        </View>
        <View wrap={false}>
          <Text style={styles.heading}>What we do not investigate as a complaint</Text>
          {list(g.doNotInvestigate)}
        </View>
        <View wrap={false}>
          <Text style={styles.heading}>If you are not satisfied</Text>
          {list(g.escalation)}
        </View>
        <View wrap={false}>
          <Text style={styles.heading}>Contacts</Text>
          {g.contacts.map((c) => (
            <Meta key={c.name} label={c.name} value={c.detail} />
          ))}
        </View>
        <Footer left={`${organisationName} — how we handle complaints`} />
      </Page>
    </Document>,
  );
}
