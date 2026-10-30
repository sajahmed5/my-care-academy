import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ResponseRow } from "./form-library";
import { signerLabel, type DeviceSignature } from "./form-records";
import { formatDateTime } from "./dates";

/**
 * A completed form as the document that gets filed (FORMS.md: "every
 * completed form becomes a PDF"): who or what it is about, who filled it in
 * and when, each question with its answer, and the signatures as captured.
 */

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 56, fontSize: 10, color: "#111827", fontFamily: "Helvetica" },
  brand: { fontSize: 9, letterSpacing: 2, color: "#0f8178", marginBottom: 6 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 11, color: "#374151", marginBottom: 12 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 110, color: "#6b7280" },
  metaValue: { flex: 1 },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6, paddingBottom: 3, borderBottom: "1 solid #d1d5db" },
  qa: { paddingVertical: 5, borderBottom: "0.5 solid #e5e7eb" },
  q: { fontSize: 9, color: "#4b5563", fontFamily: "Helvetica-Bold", marginBottom: 2 },
  a: { fontSize: 10.5, lineHeight: 1.35 },
  blank: { fontSize: 10, color: "#9ca3af" },
  sig: { marginTop: 8 },
  sigImg: { height: 50, width: 180, objectFit: "contain", objectPosition: "left" },
  small: { fontSize: 8, color: "#6b7280" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

const ukDateTime = (iso: string) =>
  formatDateTime(iso, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export interface FormPdfInput {
  organisationName: string;
  title: string;
  /** "About Jane Smith", "Completed by Sam Carer", or null for a company form. */
  subject: string | null;
  filledBy: string;
  submittedAt: string;
  version: number;
  rows: ResponseRow[];
  signedName: string | null;
  signatures: DeviceSignature[];
  /** Extra lines for the header, such as the review date. */
  meta?: { label: string; value: string }[];
}

export function renderFormPdf(input: FormPdfInput): Promise<Buffer> {
  const footer = `${input.organisationName} — ${input.title}${input.subject ? ` — ${input.subject.replace(/^About /, "")}` : ""}`;
  return renderToBuffer(
    <Document title={input.title} author={input.organisationName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{input.organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>{input.title}</Text>
        {input.subject && <Text style={styles.subtitle}>{input.subject}</Text>}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Filled in by</Text>
          <Text style={styles.metaValue}>{input.filledBy}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>On</Text>
          <Text style={styles.metaValue}>{ukDateTime(input.submittedAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Form version</Text>
          <Text style={styles.metaValue}>{String(input.version)}</Text>
        </View>
        {(input.meta ?? []).map((m) => (
          <View key={m.label} style={styles.metaRow}>
            <Text style={styles.metaLabel}>{m.label}</Text>
            <Text style={styles.metaValue}>{m.value}</Text>
          </View>
        ))}

        <Text style={styles.heading}>Answers</Text>
        {input.rows.map((r) =>
          r.heading ? (
            <Text key={r.fieldId} style={styles.heading}>{r.label}</Text>
          ) : (
          <View key={r.fieldId} style={styles.qa} wrap={false}>
            <Text style={styles.q}>{r.label}</Text>
            {r.value ? (
              <Text style={styles.a}>{r.filePath ? `${r.value} (file kept on the system)` : r.value}</Text>
            ) : (
              <Text style={styles.blank}>Not answered</Text>
            )}
          </View>
          ),
        )}

        {(input.signedName || input.signatures.length > 0) && (
          <View wrap={false}>
            <Text style={styles.heading}>Signatures</Text>
            {input.signedName && (
              <Text style={styles.a}>
                Staff: {input.signedName} — signed by typing their name, {ukDateTime(input.submittedAt)}
              </Text>
            )}
            {input.signatures.map((s, i) => (
              <View key={i} style={styles.sig}>
                <Text style={styles.a}>
                  {signerLabel(s)}: {s.name} — {ukDateTime(s.signed_at)}
                </Text>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt */}
                {s.image && <Image src={s.image} style={styles.sigImg} />}
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
