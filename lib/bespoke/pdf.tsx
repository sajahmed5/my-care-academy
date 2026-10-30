import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDateTime } from "@/lib/dates";
import { CERTIFICATE_LOGO } from "@/lib/certificate-logo";
import { formatValue, type SectionResult, type Value } from "./run";
import type { ReportRun } from "./load";
import { withPoweredBy } from "@/lib/pdf-brand";

/**
 * A bespoke report as a PDF (BESPOKE-REPORTS.md): the company's logo and
 * name at the top, the date it was run, then each section — its count per
 * group as bars, and its table. Landscape when a table is wide.
 */

export interface PdfBranding {
  organisationName: string;
  /** The company's own logo (white label); ours when it has none. */
  logoUrl: string | null;
}

const TEAL = "#0f8178";

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 48, fontSize: 9, color: "#111827", fontFamily: "Helvetica" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 10, borderBottom: `2 solid ${TEAL}` },
  orgLogo: { maxWidth: 160, maxHeight: 54, objectFit: "contain" },
  ourLogo: { width: 120 },
  orgName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  meta: { fontSize: 9, color: "#4b5563", marginBottom: 2 },
  description: { fontSize: 10, color: "#374151", marginTop: 6, marginBottom: 4 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  basis: { fontSize: 8, color: "#6b7280", marginBottom: 6 },
  note: { fontSize: 9, color: "#374151", marginBottom: 6 },
  muted: { fontSize: 9, color: "#6b7280" },
  barRow: { flexDirection: "row", alignItems: "center", marginBottom: 3 },
  barLabel: { width: 150, paddingRight: 6 },
  barTrack: { flex: 1, height: 9, backgroundColor: "#eef2f1" },
  bar: { height: 9, backgroundColor: TEAL },
  barCount: { width: 70, textAlign: "right", color: "#374151" },
  tableHead: { flexDirection: "row", borderBottom: "1 solid #9ca3af", paddingBottom: 3, marginBottom: 1 },
  th: { fontFamily: "Helvetica-Bold", paddingRight: 4 },
  tr: { flexDirection: "row", paddingVertical: 2.5, borderBottom: "0.5 solid #e5e7eb" },
  td: { paddingRight: 4 },
  groupHead: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingVertical: 3, paddingHorizontal: 4, backgroundColor: "#f0f7f6", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

function Table({ section, rows }: { section: SectionResult; rows: Value[][] }) {
  return (
    <View>
      <View style={styles.tableHead}>
        {section.columns.map((c) => (
          <Text key={c.key} style={[styles.th, { flex: 1 }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={styles.tr} wrap={false}>
          {r.map((v, j) => (
            <Text key={j} style={[styles.td, { flex: 1 }]}>
              {formatValue(section.columns[j], v)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function SectionBlock({ section }: { section: SectionResult }) {
  const max = Math.max(1, ...(section.summary ?? []).map((g) => g.count));
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} minPresenceAhead={60}>
        {section.title}
      </Text>
      <Text style={styles.basis}>
        {section.basis}
        {section.unavailable ? "" : ` · ${section.total} ${section.total === 1 ? "row" : "rows"}`}
      </Text>
      {section.note && <Text style={styles.note}>{section.note}</Text>}
      {section.unavailable ? (
        <Text style={styles.muted}>Not included in your package.</Text>
      ) : section.total === 0 ? (
        <Text style={styles.muted}>Nothing to show.</Text>
      ) : (
        <>
          {section.summary && (
            <View style={{ marginBottom: 8 }}>
              {section.summary.map((g) => (
                <View key={g.label} style={styles.barRow} wrap={false}>
                  <Text style={styles.barLabel}>{g.label}</Text>
                  {section.chart ? (
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { width: `${(g.count / max) * 100}%` }]} />
                    </View>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                  <Text style={styles.barCount}>
                    {g.count} ({g.percent}%)
                  </Text>
                </View>
              ))}
            </View>
          )}
          {section.showTable &&
            (section.groups ? (
              section.groups.map((g) => (
                <View key={g.label}>
                  <View style={styles.groupHead} wrap={false} minPresenceAhead={30}>
                    <Text>{g.label}</Text>
                    <Text>{g.count}</Text>
                  </View>
                  <Table section={section} rows={g.rows} />
                </View>
              ))
            ) : (
              <Table section={section} rows={section.rows} />
            ))}
          {section.truncated && section.showTable && (
            <Text style={[styles.muted, { marginTop: 4 }]}>
              Only the first rows are shown here. The Excel download has all {section.total}.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

function ReportDoc({ run, brand, generatedAt }: { run: ReportRun; brand: PdfBranding; generatedAt: Date }) {
  const wide = run.sections.some((s) => s.columns.length > 5);
  return (
    <Document title={run.title} author={brand.organisationName} creator="My Care Academy">
      <Page size="A4" orientation={wide ? "landscape" : "portrait"} style={styles.page}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{run.title}</Text>
            <Text style={styles.meta}>{brand.organisationName}</Text>
            <Text style={styles.meta}>
              Run {formatDateTime(generatedAt, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </Text>
          </View>
          {brand.logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt
            <Image src={brand.logoUrl} style={styles.orgLogo} />
          ) : (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt
            <Image src={CERTIFICATE_LOGO} style={styles.ourLogo} />
          )}
        </View>
        {run.description && <Text style={styles.description}>{run.description}</Text>}
        {run.sections.map((s) => (
          <SectionBlock key={s.id} section={s} />
        ))}
        <View style={styles.footer} fixed>
          <Text>{withPoweredBy(`${brand.organisationName} · ${run.title} · confidential`, brand.logoUrl)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderReportPdf(run: ReportRun, brand: PdfBranding, generatedAt = new Date()): Promise<Buffer> {
  return renderToBuffer(<ReportDoc run={run} brand={brand} generatedAt={generatedAt} />);
}
