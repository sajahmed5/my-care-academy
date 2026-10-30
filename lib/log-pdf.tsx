import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { FormField } from "./forms";
import { lineFlagged, logCell, logColumns, type LogEntry } from "./form-logs";
import { formatDate } from "./dates";

/**
 * A log as the table that gets printed or handed to an inspector: landscape,
 * one row a line, readings outside their range in red and marked with an
 * asterisk so they still show on a black-and-white printer.
 */

const styles = StyleSheet.create({
  page: { padding: 28, paddingBottom: 44, fontSize: 8.5, color: "#111827", fontFamily: "Helvetica" },
  brand: { fontSize: 8, letterSpacing: 2, color: "#0f8178", marginBottom: 4 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 9, color: "#4b5563", marginBottom: 10 },
  row: { flexDirection: "row", borderBottom: "0.5 solid #e5e7eb", paddingVertical: 3 },
  head: { flexDirection: "row", borderBottom: "1 solid #9ca3af", paddingBottom: 3, marginBottom: 1 },
  th: { fontFamily: "Helvetica-Bold", color: "#374151" },
  cell: { paddingRight: 5 },
  flagged: { color: "#be123c", fontFamily: "Helvetica-Bold" },
  note: { marginTop: 8, fontSize: 8, color: "#6b7280" },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, fontSize: 7.5, color: "#9ca3af", flexDirection: "row", justifyContent: "space-between" },
});

const fmt = (d: string) => formatDate(`${d}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" });

export function renderLogPdf(input: {
  organisationName: string;
  title: string;
  description: string | null;
  fields: FormField[];
  personLabel: string;
  withClient: boolean;
  entries: LogEntry[];
  from: string | null;
  to: string | null;
}): Promise<Buffer> {
  const cols = logColumns(input.fields);
  // Fixed columns are narrow; the log's own share what is left, long text getting more.
  const weight = (f: FormField) => (f.type === "textarea" ? 2.2 : f.type === "number" || f.type === "date" ? 0.9 : 1.3);
  const head = [
    { label: "Date", flex: 0.9 },
    { label: input.personLabel, flex: 1.2 },
    ...(input.withClient ? [{ label: "Client", flex: 1.2 }] : []),
    ...cols.map((c) => ({ label: c.label, flex: weight(c.fields[0]) })),
  ];
  const range =
    input.from || input.to
      ? `${input.from ? `From ${fmt(input.from)}` : "Up"} ${input.to ? `to ${fmt(input.to)}` : "to today"}`
      : "Every line on record";
  const anyFlagged = input.entries.some((e) => lineFlagged(input.fields, e.answers));
  return renderToBuffer(
    <Document title={input.title} author={input.organisationName}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.brand}>{input.organisationName.toUpperCase()}</Text>
        <Text style={styles.title}>{input.title}</Text>
        <Text style={styles.sub}>
          {range} · {input.entries.length} {input.entries.length === 1 ? "line" : "lines"}
        </Text>
        <View style={styles.head} fixed>
          {head.map((h) => (
            <Text key={h.label} style={[styles.cell, styles.th, { flex: h.flex }]}>{h.label}</Text>
          ))}
        </View>
        {input.entries.map((e) => (
          <View key={e.id} style={styles.row} wrap={false}>
            <Text style={[styles.cell, { flex: 0.9 }]}>{fmt(e.entry_date)}</Text>
            <Text style={[styles.cell, { flex: 1.2 }]}>{e.person}</Text>
            {input.withClient && <Text style={[styles.cell, { flex: 1.2 }]}>{e.client_name ?? "—"}</Text>}
            {cols.map((c) => {
              const cell = logCell(c, e.answers);
              return (
                <Text key={c.label} style={[styles.cell, { flex: weight(c.fields[0]) }, ...(cell.flagged ? [styles.flagged] : [])]}>
                  {cell.text}
                  {cell.flagged ? " *" : ""}
                </Text>
              );
            })}
          </View>
        ))}
        {input.entries.length === 0 && <Text style={styles.note}>No lines in this range.</Text>}
        {anyFlagged && <Text style={styles.note}>* Outside the safe range.</Text>}
        <View style={styles.footer} fixed>
          <Text>{`${input.organisationName} — ${input.title}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>,
  );
}
