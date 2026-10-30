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
import { CERTIFICATE_LOGO } from "./certificate-logo";
import { POWERED_BY } from "./pdf-brand";

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

/*
 * Redesigned 28 Oct 2026 (design review). It was black Helvetica in a plain
 * box with an indigo the brand doesn't use, and told an inspector to "verify
 * at /verify" — a path, which means nothing on paper. Now: the site's teal in
 * a double frame, our logo, a sand rule, and the full address to check it.
 */
const TEAL = "#0f8178";
const DEEP = "#0f2a2e";
const MUTED = "#587070";
const SAND = "#d9b98a";

/** Where a certificate is checked, as printed: no scheme, it's for reading. */
const VERIFY_AT = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.mycareacademy.co.uk")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "")}/verify`;

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 12,
    color: DEEP,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  outer: {
    flex: 1,
    border: `3 solid ${TEAL}`,
    borderRadius: 14,
    padding: 8,
  },
  inner: {
    flex: 1,
    border: `0.75 solid ${SAND}`,
    borderRadius: 9,
    paddingVertical: 34,
    paddingHorizontal: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fbfdfc",
  },
  logo: { width: 190, marginBottom: 18 },
  orgLogo: { maxHeight: 56, maxWidth: 220, objectFit: "contain", marginBottom: 12 },
  brand: { fontSize: 11, letterSpacing: 2.5, color: TEAL, marginBottom: 14 },
  heading: { fontSize: 30, fontFamily: "Helvetica-Bold", color: DEEP },
  rule: { width: 72, height: 2, backgroundColor: SAND, marginTop: 14, marginBottom: 22 },
  label: { fontSize: 11, color: MUTED, marginBottom: 5 },
  name: { fontSize: 26, fontFamily: "Helvetica-Bold", color: DEEP, marginBottom: 16 },
  course: { fontSize: 18, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 6, textAlign: "center" },
  row: { flexDirection: "row", gap: 56, marginTop: 24 },
  meta: { alignItems: "center" },
  metaValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: DEEP },
  footer: { marginTop: 30, alignItems: "center" },
  number: { fontSize: 10, color: DEEP, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  verify: { marginTop: 4, fontSize: 9.5, color: MUTED },
  note: {
    marginTop: 12,
    fontSize: 8,
    color: MUTED,
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
  const whiteLabel = !!data.orgLogoUrl;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.outer}>
          <View style={styles.inner}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt */}
            <Image src={whiteLabel ? data.orgLogoUrl! : CERTIFICATE_LOGO} style={whiteLabel ? styles.orgLogo : styles.logo} />
            {whiteLabel && data.orgName && (
              <Text style={styles.brand}>{data.orgName.toUpperCase()}</Text>
            )}
            <Text style={styles.heading}>Certificate of Completion</Text>
            <View style={styles.rule} />
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

            <View style={styles.footer}>
              <Text style={styles.number}>Certificate no. {data.certificateNumber}</Text>
              <Text style={styles.verify}>
                Check it is genuine at {VERIFY_AT}
                {whiteLabel ? " · issued through My Care Academy" : ""}
              </Text>
            </View>
            {data.note && <Text style={styles.note}>{data.note}</Text>}
          </View>
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

// The certificates' look carried onto the record (28 Oct 2026): logo, the
// teal rule, a status you can scan, and where to check any number on it.
const recStyles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, color: DEEP, fontFamily: "Helvetica" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2 solid ${TEAL}`, paddingBottom: 10, marginBottom: 14 },
  logo: { width: 150 },
  orgLogo: { maxHeight: 44, maxWidth: 200, objectFit: "contain" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: DEEP },
  sub: { color: MUTED, marginTop: 3, marginBottom: 16 },
  row: { flexDirection: "row", borderBottom: "1 solid #dcebe8", paddingVertical: 6 },
  head: { flexDirection: "row", borderBottom: `1.5 solid ${DEEP}`, paddingBottom: 6, fontFamily: "Helvetica-Bold" },
  valid: { color: "#15803d", fontFamily: "Helvetica-Bold" },
  expired: { color: "#be123c", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8.5, color: MUTED, textAlign: "center" },
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
  orgLogoUrl,
}: {
  learnerName: string;
  rows: TrainingRecordRow[];
  generatedAt: Date;
  /** The company's logo in place of ours, with white label. */
  orgLogoUrl?: string | null;
}) {
  return (
    <Document>
      <Page size="A4" style={recStyles.page}>
        <View style={recStyles.top}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- a PDF image has no alt */}
          <Image src={orgLogoUrl || CERTIFICATE_LOGO} style={orgLogoUrl ? recStyles.orgLogo : recStyles.logo} />
          <Text style={{ color: MUTED }}>Generated {fmtD(generatedAt)}</Text>
        </View>
        <Text style={recStyles.h1}>Training record — {learnerName}</Text>
        <Text style={recStyles.sub}>
          {rows.length} {rows.length === 1 ? "certificate" : "certificates"}
        </Text>

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
            <Text style={[recStyles.cStatus, r.status === "Expired" ? recStyles.expired : recStyles.valid]}>
              {r.status}
            </Text>
          </View>
        ))}
        {rows.length === 0 && (
          <Text style={{ marginTop: 12, color: MUTED }}>
            No certificates yet.
          </Text>
        )}
        <Text style={recStyles.footer} fixed>
          Any certificate number above can be checked at {VERIFY_AT}
          {orgLogoUrl ? ` · ${POWERED_BY}` : ""}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateTrainingRecordPdf(
  learnerName: string,
  rows: TrainingRecordRow[],
  generatedAt: Date,
  orgLogoUrl?: string | null,
): Promise<Buffer> {
  return renderToBuffer(
    <TrainingRecordDoc
      learnerName={learnerName}
      rows={rows}
      generatedAt={generatedAt}
      orgLogoUrl={orgLogoUrl}
    />,
  );
}
