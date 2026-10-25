import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatDate } from "./dates";

export interface CertificateData {
  learnerName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: Date;
  expiresAt: Date | null;
  /** Optional footer line, e.g. the Care Certificate knowledge-only statement. */
  note?: string | null;
  /**
   * The organisation's own logo and name, with white-label (ROADMAP §2). The
   * certificate then leads with them; My Care Academy stays in the footer,
   * where the certificate is verified.
   */
  orgLogoUrl?: string | null;
  orgName?: string | null;
}

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 12,
    color: "#111827",
    fontFamily: "Helvetica",
  },
  border: {
    flex: 1,
    border: "2 solid #111827",
    borderRadius: 8,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 14, letterSpacing: 2, color: "#6366f1", marginBottom: 8 },
  orgLogo: { maxHeight: 56, maxWidth: 220, objectFit: "contain", marginBottom: 12 },
  heading: { fontSize: 26, fontFamily: "Helvetica-Bold", marginBottom: 24 },
  label: { fontSize: 11, color: "#6b7280", marginBottom: 4 },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 16 },
  course: { fontSize: 16, marginBottom: 24 },
  row: { flexDirection: "row", gap: 40, marginTop: 24 },
  meta: { alignItems: "center" },
  metaValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  number: { marginTop: 28, fontSize: 10, color: "#6b7280" },
  note: {
    marginTop: 14,
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
    maxWidth: 460,
  },
});

function fmt(date: Date): string {
  return formatDate(date, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function CertificateDoc({ data }: { data: CertificateData }) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          {data.orgLogoUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt
            <Image src={data.orgLogoUrl} style={styles.orgLogo} />
          )}
          <Text style={styles.brand}>
            {data.orgLogoUrl && data.orgName ? data.orgName.toUpperCase() : "MY CARE ACADEMY"}
          </Text>
          <Text style={styles.heading}>Certificate of Completion</Text>
          <Text style={styles.label}>This certifies that</Text>
          <Text style={styles.name}>{data.learnerName}</Text>
          <Text style={styles.label}>
            {data.note ? "has successfully completed the knowledge assessment for" : "has successfully completed"}
          </Text>
          <Text style={styles.course}>{data.courseTitle}</Text>

          <View style={styles.row}>
            <View style={styles.meta}>
              <Text style={styles.label}>Issued</Text>
              <Text style={styles.metaValue}>{fmt(data.issuedAt)}</Text>
            </View>
            <View style={styles.meta}>
              <Text style={styles.label}>Expires</Text>
              <Text style={styles.metaValue}>
                {data.expiresAt ? fmt(data.expiresAt) : "Does not expire"}
              </Text>
            </View>
          </View>

          <Text style={styles.number}>
            Certificate no. {data.certificateNumber} · verify at /verify
            {data.orgLogoUrl ? " · issued through My Care Academy" : ""}
          </Text>
          {data.note && <Text style={styles.note}>{data.note}</Text>}
        </View>
      </Page>
    </Document>
  );
}

export async function generateCertificatePdf(
  data: CertificateData,
): Promise<Buffer> {
  return renderToBuffer(<CertificateDoc data={data} />);
}

export interface TrainingRecordRow {
  courseTitle: string;
  certificateNumber: string;
  issuedAt: Date;
  expiresAt: Date | null;
  status: string; // Valid | Expired
}

const recStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  brand: { fontSize: 12, letterSpacing: 2, color: "#2b7a99" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 6 },
  sub: { color: "#6b7280", marginBottom: 16 },
  row: { flexDirection: "row", borderBottom: "1 solid #e5e7eb", paddingVertical: 6 },
  head: { flexDirection: "row", borderBottom: "1.5 solid #111827", paddingBottom: 6, fontFamily: "Helvetica-Bold" },
  cCourse: { width: "40%" },
  cNum: { width: "22%" },
  cDate: { width: "14%" },
  cStatus: { width: "10%" },
});

function fmtD(d: Date | null): string {
  return d
    ? formatDate(d, { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

function TrainingRecordDoc({
  learnerName,
  rows,
  generatedAt,
}: {
  learnerName: string;
  rows: TrainingRecordRow[];
  generatedAt: Date;
}) {
  return (
    <Document>
      <Page size="A4" style={recStyles.page}>
        <Text style={recStyles.brand}>MY CARE ACADEMY</Text>
        <Text style={recStyles.h1}>Training record — {learnerName}</Text>
        <Text style={recStyles.sub}>Generated {fmtD(generatedAt)}</Text>

        <View style={recStyles.head}>
          <Text style={recStyles.cCourse}>Course</Text>
          <Text style={recStyles.cNum}>Certificate</Text>
          <Text style={recStyles.cDate}>Issued</Text>
          <Text style={recStyles.cDate}>Expires</Text>
          <Text style={recStyles.cStatus}>Status</Text>
        </View>
        {rows.map((r, i) => (
          <View style={recStyles.row} key={i}>
            <Text style={recStyles.cCourse}>{r.courseTitle}</Text>
            <Text style={recStyles.cNum}>{r.certificateNumber}</Text>
            <Text style={recStyles.cDate}>{fmtD(r.issuedAt)}</Text>
            <Text style={recStyles.cDate}>{fmtD(r.expiresAt)}</Text>
            <Text style={recStyles.cStatus}>{r.status}</Text>
          </View>
        ))}
        {rows.length === 0 && (
          <Text style={{ marginTop: 12, color: "#6b7280" }}>
            No certificates yet.
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function generateTrainingRecordPdf(
  learnerName: string,
  rows: TrainingRecordRow[],
  generatedAt: Date,
): Promise<Buffer> {
  return renderToBuffer(
    <TrainingRecordDoc
      learnerName={learnerName}
      rows={rows}
      generatedAt={generatedAt}
    />,
  );
}
