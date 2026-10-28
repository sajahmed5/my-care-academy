import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PIP_OUTCOMES, PIP_SUPPORT_TYPES, PIP_WEEK_RATINGS, label, type Pip } from "./plan";
import { formatDate } from "../dates";

/**
 * The plan as the document that gets filed: why, the concerns and standards,
 * the expectations, the support, the training, each week's review with the
 * carer's own reply, the outcome, and the signatures as captured — or lines
 * to sign by hand where they were not.
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
  para: { fontSize: 10.5, lineHeight: 1.4, marginBottom: 6 },
  bullet: { fontSize: 10, marginBottom: 3, paddingLeft: 8 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottom: "0.5 solid #e5e7eb" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#4b5563" },
  c1: { flex: 2, paddingRight: 6 },
  c2: { flex: 2, paddingRight: 6 },
  c3: { flex: 2 },
  week: { marginTop: 8, padding: 8, border: "0.5 solid #d1d5db", borderRadius: 4 },
  weekTitle: { fontFamily: "Helvetica-Bold", marginBottom: 3 },
  q: { fontSize: 9, color: "#4b5563", marginTop: 4, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: "#6b7280" },
  sigRow: { flexDirection: "row", marginTop: 20, gap: 24 },
  sigBox: { flex: 1 },
  sigImg: { height: 50, width: 160, objectFit: "contain", objectPosition: "left" },
  sigLine: { borderTop: "0.5 solid #111827", marginTop: 40, paddingTop: 3, fontSize: 9 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

// A plain date ("2026-10-23") is pinned to noon so no timezone can shift it;
// a timestamp is a real instant, and formatDate reads it in UK time.
const ukDate = (iso?: string | null) =>
  iso ? formatDate(iso.length === 10 ? `${iso}T12:00:00Z` : iso, { day: "numeric", month: "long", year: "numeric" }) : "—";

function Meta({ label: l, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{l}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export function renderPipPdf(pip: Pip, organisationName: string): Promise<Buffer> {
  const kind = pip.kind === "disciplinary" ? "Disciplinary record" : "Performance improvement plan";
  const footer = `${organisationName} — ${kind.toLowerCase()} — ${pip.carerName}`;
  return renderToBuffer(
    <Document title={`${kind} — ${pip.carerName}`} author={organisationName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>{kind}</Text>
        <Text style={styles.subtitle}>{pip.carerName}</Text>
        <Meta label="Runs" value={pip.startDate ? `${ukDate(pip.startDate)} to ${ukDate(pip.reviewUntil)}${pip.durationWeeks ? ` (${pip.durationWeeks} weeks)` : ""}` : null} />
        <Meta label="Reviewed" value={pip.reviewFrequency} />
        <Meta label="Plan owner" value={pip.ownerName} />
        <Meta label="Arising from" value={pip.complaintReference} />
        <Meta label="Status" value={pip.status === "completed" ? `Completed — ${label(PIP_OUTCOMES, pip.outcome)}` : pip.status} />

        <Text style={styles.heading}>Why this plan is in place</Text>
        <Text style={styles.para}>{pip.reason}</Text>

        <Text style={styles.heading}>Concerns, standards and how they are measured</Text>
        <View style={styles.row}>
          <Text style={[styles.c1, styles.th]}>Concern</Text>
          <Text style={[styles.c2, styles.th]}>Standard expected</Text>
          <Text style={[styles.c3, styles.th]}>Measured by</Text>
        </View>
        {pip.concerns.map((c) => (
          <View key={c.id} style={styles.row} wrap={false}>
            <Text style={styles.c1}>{c.concern}</Text>
            <Text style={styles.c2}>{c.standard}</Text>
            <Text style={styles.c3}>{c.measure}</Text>
          </View>
        ))}

        {pip.expectations.length > 0 && (
          <>
            <Text style={styles.heading}>Expectations going forward</Text>
            {pip.expectations.map((e, i) => <Text key={i} style={styles.bullet}>• {e}</Text>)}
          </>
        )}

        <Text style={styles.heading}>Support offered</Text>
        {pip.support.map((s) => (
          <Text key={s.id} style={styles.bullet}>• {label(PIP_SUPPORT_TYPES, s.type)}{s.detail ? ` — ${s.detail}` : ""}{s.arranged ? " (arranged)" : ""}</Text>
        ))}

        {pip.training.length > 0 && (
          <>
            <Text style={styles.heading}>Training schedule</Text>
            {pip.training.map((t) => (
              <Text key={t.id} style={styles.bullet}>
                • {ukDate(t.sessionDate)} — {t.topic}{t.trainerName ? `, ${t.trainerName}` : ""} · {t.attended === true ? "attended" : t.attended === false ? "did not attend" : "scheduled"}{t.assessmentResult ? ` · ${t.assessmentResult}` : ""}
              </Text>
            ))}
          </>
        )}

        <Text style={styles.heading}>Weekly reviews</Text>
        {pip.reviews.length === 0 && <Text style={styles.small}>No weeks recorded.</Text>}
        {pip.reviews.map((r) => (
          <View key={r.id} style={styles.week} wrap={false}>
            <Text style={styles.weekTitle}>
              Week {r.weekNumber} — {ukDate(r.periodStart)} to {ukDate(r.periodEnd)} — {r.completedAt ? label(PIP_WEEK_RATINGS, r.rating) : "not yet reviewed"}
            </Text>
            {r.managerNotes && (<><Text style={styles.q}>Manager</Text><Text style={styles.para}>{r.managerNotes}</Text></>)}
            {r.carerResponse && (<><Text style={styles.q}>{pip.carerName.split(" ")[0]}&apos;s response</Text><Text style={styles.para}>{r.carerResponse}</Text></>)}
            {r.actionsNext && (<><Text style={styles.q}>Actions for next week</Text><Text style={styles.para}>{r.actionsNext}</Text></>)}
          </View>
        ))}

        {pip.consequences && (
          <>
            <Text style={styles.heading}>If the standards are not met</Text>
            <Text style={styles.para}>{pip.consequences}</Text>
          </>
        )}

        {pip.status !== "open" && (
          <>
            <Text style={styles.heading}>Outcome</Text>
            <Text style={styles.para}>{pip.status === "completed" ? label(PIP_OUTCOMES, pip.outcome) : "Cancelled"}{pip.outcomeNotes ? ` — ${pip.outcomeNotes}` : ""}</Text>
            {pip.outcomeNextStep && <Text style={styles.para}>What follows: {pip.outcomeNextStep}</Text>}
            {pip.completionSummary && <Text style={styles.para}>{pip.completionSummary}</Text>}
          </>
        )}

        <View style={styles.sigRow} wrap={false}>
          <View style={styles.sigBox}>
            <Text style={styles.q}>{pip.carerName}</Text>
            {pip.carerSignature ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={pip.carerSignature} style={styles.sigImg} />
                <Text style={styles.small}>Signed {ukDate(pip.carerSignedAt)}{pip.carerSignedWitnessedBy ? ` · witnessed by ${pip.carerSignedWitnessedBy}` : ""}</Text>
              </>
            ) : (
              <Text style={styles.sigLine}>Signature and date</Text>
            )}
          </View>
          <View style={styles.sigBox}>
            <Text style={styles.q}>Manager{pip.managerSignedByName ? ` — ${pip.managerSignedByName}` : ""}</Text>
            {pip.managerSignature ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image src={pip.managerSignature} style={styles.sigImg} />
                <Text style={styles.small}>Signed {ukDate(pip.managerSignedAt)}</Text>
              </>
            ) : (
              <Text style={styles.sigLine}>Signature and date</Text>
            )}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>{footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
