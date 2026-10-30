import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { QA_HEADINGS } from "./client-qa";
import type { GovernanceReport } from "./governance";

/**
 * The monthly governance report as one PDF (SERVICE-AUDITS.md): for CQC's
 * well-led question, and for the manager's own meeting. Plain, like the
 * complaint response: the summary a person wrote, then each part with its
 * figures and the detail behind them.
 */

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  brand: { fontSize: 9, letterSpacing: 2, color: "#0f8178", marginBottom: 6 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 11, color: "#374151", marginBottom: 14 },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #d1d5db" },
  para: { fontSize: 10.5, lineHeight: 1.4, marginBottom: 6 },
  muted: { fontSize: 9.5, color: "#6b7280", marginBottom: 4 },
  tiles: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  tile: { width: "25%", paddingRight: 8, marginBottom: 6 },
  tileValue: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  tileLabel: { fontSize: 8.5, color: "#6b7280" },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: "0.5 solid #e5e7eb" },
  head: { flexDirection: "row", paddingVertical: 3, borderBottom: "1 solid #9ca3af" },
  c1: { flex: 3, paddingRight: 6 },
  c2: { flex: 2, paddingRight: 6, color: "#374151" },
  c3: { width: 70, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
  red: { color: "#b91c1c" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

const ukDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Tiles({ items }: { items: { value: string; label: string; red?: boolean }[] }) {
  return (
    <View style={styles.tiles}>
      {items.map((t) => (
        <View key={t.label} style={styles.tile}>
          <Text style={t.red ? [styles.tileValue, styles.red] : styles.tileValue}>{t.value}</Text>
          <Text style={styles.tileLabel}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Table({ head, rows }: { head: [string, string, string]; rows: { cells: [string, string, string]; red?: boolean }[] }) {
  return (
    <View>
      <View style={styles.head}>
        <Text style={[styles.c1, styles.bold]}>{head[0]}</Text>
        <Text style={[styles.c2, styles.bold]}>{head[1]}</Text>
        <Text style={[styles.c3, styles.bold]}>{head[2]}</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={styles.row} wrap={false}>
          <Text style={styles.c1}>{r.cells[0]}</Text>
          <Text style={styles.c2}>{r.cells[1]}</Text>
          <Text style={r.red ? [styles.c3, styles.red] : styles.c3}>{r.cells[2]}</Text>
        </View>
      ))}
    </View>
  );
}

const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

function GovernanceDocument({ g, generatedOn }: { g: GovernanceReport; generatedOn: string }) {
  const low = (n: number | null) => n !== null && n < g.reviewBelow;
  return (
    <Document title={`Governance report — ${g.range.label}`} author={g.organisationName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{g.organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>Governance report</Text>
        <Text style={styles.subtitle}>
          {g.range.label} · for CQC&apos;s well-led question · produced {ukDate(generatedOn)}
        </Text>

        {g.summary.trim() !== "" && (
          <View>
            <Text style={styles.heading}>Summary</Text>
            {g.summary
              .split(/\n\s*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, i) => (
                <Text key={i} style={styles.para}>
                  {p}
                </Text>
              ))}
          </View>
        )}

        <Text style={styles.heading}>Audits</Text>
        <Tiles
          items={[
            { value: String(g.audits.done.length), label: "audits carried out" },
            { value: String(g.audits.waitingReview), label: "waiting for a manager's review now", red: g.audits.waitingReview > 0 },
            ...g.audits.behind.map((b) => ({ value: String(b.count), label: `${b.title.toLowerCase()} behind now`, red: true })),
          ]}
        />
        {g.audits.byForm.length > 0 ? (
          <Table
            head={["Audit", "Carried out", "Average score"]}
            rows={g.audits.byForm.map((f) => ({ cells: [f.title, String(f.count), pct(f.average)], red: low(f.average) }))}
          />
        ) : (
          <Text style={styles.muted}>No audits were carried out this month.</Text>
        )}
        {g.audits.done.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Table
              head={["Each audit", "Date", "Score"]}
              rows={g.audits.done.map((a) => ({
                cells: [`${a.title}${a.about ? ` — ${a.about}` : ""}${a.review === "waiting" ? " (waiting for review)" : a.review === "reviewed" ? " (reviewed)" : ""}`, ukDate(a.heldOn), pct(a.score)],
                red: low(a.score),
              }))}
            />
          </View>
        )}

        <Text style={styles.heading}>Client QAs</Text>
        <Tiles
          items={[
            { value: String(g.qas.done), label: "QAs done" },
            { value: String(g.qas.attempted), label: "attempted, couldn't be done" },
            { value: pct(g.qas.score), label: "average score", red: low(g.qas.score) },
            { value: String(g.qas.low.length), label: `below ${g.reviewBelow}%`, red: g.qas.low.length > 0 },
          ]}
        />
        {g.qas.done > 0 && (
          <Table
            head={["Rating by heading", "Average out of 10", ""]}
            rows={QA_HEADINGS.map((h) => ({ cells: [h.label, String(g.qas.averages[h.key] ?? "–"), ""], red: (g.qas.averages[h.key] ?? 10) <= 6 }))}
          />
        )}
        {g.qas.low.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Table head={["Below the review level", "Date", "Score"]} rows={g.qas.low.map((q) => ({ cells: [q.client, ukDate(q.heldOn), `${q.score}%`], red: true }))} />
          </View>
        )}

        <Text style={styles.heading}>Actions still open</Text>
        <Tiles
          items={[
            { value: String(g.actions.open), label: `open at the end of ${g.range.label}` },
            { value: String(g.actions.overdue), label: "past their date", red: g.actions.overdue > 0 },
          ]}
        />
        {g.actions.bySource.length > 0 && (
          <Table head={["From", "Open", "Past their date"]} rows={g.actions.bySource.map((s) => ({ cells: [s.label, String(s.open), String(s.overdue)], red: s.overdue > 0 }))} />
        )}
        {g.actions.overdueList.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Table head={["Past its date", "Whose", "Due"]} rows={g.actions.overdueList.map((a) => ({ cells: [a.title, a.owner, ukDate(a.due)], red: true }))} />
          </View>
        )}

        {g.concerns && (
          <View>
            <Text style={styles.heading}>Concerns and compliments</Text>
            <Tiles
              items={[
                { value: String(g.concerns.raised), label: "concerns raised" },
                { value: String(g.concerns.safeguarding), label: "of them safeguarding", red: g.concerns.safeguarding > 0 },
                { value: String(g.concerns.closed), label: "closed this month" },
                { value: String(g.concerns.openNow), label: "open now" },
                { value: String(g.concerns.compliments), label: "compliments" },
              ]}
            />
            {g.concerns.byKind.length > 0 && <Table head={["Raised, by type", "", "Count"]} rows={g.concerns.byKind.map((k) => ({ cells: [k.label, "", String(k.count)] }))} />}
          </View>
        )}

        {g.staffAudits && (
          <View>
            <Text style={styles.heading}>Staff audits</Text>
            <Tiles
              items={[
                { value: String(g.staffAudits.supervisions), label: "supervisions held" },
                { value: String(g.staffAudits.appraisals), label: "appraisals held" },
                { value: String(g.staffAudits.spotChecks), label: "spot checks" },
                { value: String(g.staffAudits.spotChecksShort), label: "spot checks that fell short", red: g.staffAudits.spotChecksShort > 0 },
                { value: String(g.staffAudits.supervisionsBehind), label: "staff overdue a supervision now", red: g.staffAudits.supervisionsBehind > 0 },
                { value: String(g.staffAudits.spotChecksBehind), label: "carers overdue a spot check now", red: g.staffAudits.spotChecksBehind > 0 },
              ]}
            />
          </View>
        )}

        <Text style={styles.heading}>Training compliance</Text>
        <Tiles
          items={[
            { value: pct(g.training.compliance), label: "assigned courses completed and in date" },
            { value: `${g.training.upToDate} of ${g.training.people}`, label: "staff fully up to date" },
          ]}
        />
        {g.training.behind.length > 0 && (
          <Table head={["Behind", "", ""]} rows={g.training.behind.map((b) => ({ cells: [b.name, b.detail, ""], red: true }))} />
        )}
        <Text style={[styles.muted, { marginTop: 8 }]}>
          Training figures are as they stand on the day the report was produced; everything else is for {g.range.label}.
        </Text>

        <View style={styles.footer} fixed>
          <Text>
            {g.organisationName} · Governance report · {g.range.label}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderGovernancePdf(g: GovernanceReport, generatedOn = new Date().toISOString()): Promise<Buffer> {
  return renderToBuffer(<GovernanceDocument g={g} generatedOn={generatedOn} />);
}
