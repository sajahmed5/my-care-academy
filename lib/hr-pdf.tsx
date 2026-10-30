import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/**
 * Paper for the HR pack (HR-PACK.md): a record as it was filled in (a
 * reference, a DBS risk assessment, a probation review), a letter as it was
 * sent, or a whole case file. One shape for all of them, so a case bundle is
 * its parts one after another. The company's name heads it; My Care Academy
 * is only in the footer, as on every letter.
 *
 * Plain on purpose, like the evidence pack: it may be read by a tribunal.
 */

export type HrBlock =
  | { type: "heading"; text: string }
  | { type: "para"; text: string }
  | { type: "qa"; q: string; a: string }
  | { type: "list"; items: string[] }
  | { type: "meta"; label: string; value: string }
  | { type: "signature"; name: string; title?: string; when?: string; note?: string };

export interface HrDoc {
  /** Large, at the top. */
  title: string;
  /** Under the title: who it's about, the date. */
  subtitle?: string;
  blocks: HrBlock[];
}

const styles = StyleSheet.create({
  page: { padding: 44, paddingBottom: 56, fontSize: 10.5, color: "#111827", fontFamily: "Helvetica" },
  company: { fontSize: 14, fontFamily: "Helvetica-Bold", paddingBottom: 6, marginBottom: 14, borderBottom: "1.5 solid #1e293b" },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 10.5, color: "#374151", marginBottom: 12 },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5, paddingBottom: 3, borderBottom: "0.75 solid #d1d5db" },
  para: { lineHeight: 1.45, marginBottom: 7 },
  q: { fontSize: 9, color: "#4b5563", marginTop: 6, fontFamily: "Helvetica-Bold" },
  a: { marginTop: 1, lineHeight: 1.35 },
  bullet: { marginBottom: 3, paddingLeft: 10, lineHeight: 1.35 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 140, color: "#6b7280" },
  metaValue: { flex: 1 },
  sig: { marginTop: 14 },
  sigName: { fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8.5, color: "#6b7280" },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 8, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

function Block({ b }: { b: HrBlock }) {
  switch (b.type) {
    case "heading":
      return <Text style={styles.heading} minPresenceAhead={40}>{b.text}</Text>;
    case "para":
      return <Text style={styles.para}>{b.text}</Text>;
    case "qa":
      return (
        <View wrap={false}>
          <Text style={styles.q}>{b.q}</Text>
          <Text style={styles.a}>{b.a || "—"}</Text>
        </View>
      );
    case "list":
      return (
        <View style={{ marginBottom: 6 }}>
          {b.items.map((i, n) => (
            <Text key={n} style={styles.bullet}>• {i}</Text>
          ))}
        </View>
      );
    case "meta":
      return (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{b.label}</Text>
          <Text style={styles.metaValue}>{b.value}</Text>
        </View>
      );
    case "signature":
      return (
        <View style={styles.sig} wrap={false}>
          <Text style={styles.sigName}>{b.name}</Text>
          {b.title ? <Text>{b.title}</Text> : null}
          {b.when ? <Text style={styles.small}>{b.when}</Text> : null}
          {b.note ? <Text style={styles.small}>{b.note}</Text> : null}
        </View>
      );
  }
}

function HrDocument({ company, docs }: { company: string; docs: HrDoc[] }) {
  return (
    <Document>
      {docs.map((d, n) => (
        <Page key={n} size="A4" style={styles.page}>
          <Text style={styles.company}>{company || "—"}</Text>
          <Text style={styles.title}>{d.title}</Text>
          {d.subtitle ? <Text style={styles.subtitle}>{d.subtitle}</Text> : null}
          {d.blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
          <View style={styles.footer} fixed>
            <Text>{company ? `${company} · ` : ""}made with My Care Academy</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}

/** One PDF; each doc starts on a new page. */
export function renderHrPdf(company: string, docs: HrDoc[]): Promise<Buffer> {
  return renderToBuffer(<HrDocument company={company} docs={docs} />);
}

/** "12 March 2026" from an ISO date or timestamp; "—" for nothing. */
export function ukDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "—";
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
