/**
 * Logs (FORMS.md): a form you add a line to each time — the date, who did
 * it, the result — read back as one table. A fridge check, a TMV reading, a
 * governance meeting. On a log about residents each line also names the
 * client, and shows on their page.
 *
 * The columns are the log's fields (lib/forms.ts's FormField), so a line is
 * validated by the same code as a form. A number with a safe range is
 * flagged when a reading falls outside it.
 *
 * Pure except for the loader.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isFieldVisible, isOutOfRange, type FormField } from "./forms";
import { formatDate } from "./dates";

export interface LogEntry {
  id: string;
  entry_date: string;
  done_by: string | null;
  person: string;
  client_id: string | null;
  client_name: string | null;
  answers: Record<string, unknown>;
  recorded_by: string;
  recorded_by_name: string;
  created_at: string;
}

function unwrap(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

const ENTRY_SELECT =
  "id, entry_date, done_by, done_by_name, client_id, answers, recorded_by, created_at, doer:users!form_log_entries_done_by_fkey (full_name, email), recorder:users!form_log_entries_recorded_by_fkey (full_name, email), client:clients (full_name)";

function toEntry(r: Record<string, unknown>): LogEntry {
  const d = unwrap(r.doer) as { full_name?: string | null; email?: string } | undefined;
  const rec = unwrap(r.recorder) as { full_name?: string | null; email?: string } | undefined;
  const c = unwrap(r.client) as { full_name?: string } | undefined;
  const recorder = rec?.full_name ?? rec?.email ?? "Unnamed";
  return {
    id: r.id as string,
    entry_date: r.entry_date as string,
    done_by: (r.done_by as string | null) ?? null,
    person: d?.full_name ?? d?.email ?? (r.done_by_name as string | null) ?? recorder,
    client_id: (r.client_id as string | null) ?? null,
    client_name: c?.full_name ?? null,
    answers: (r.answers as Record<string, unknown> | null) ?? {},
    recorded_by: r.recorded_by as string,
    recorded_by_name: recorder,
    created_at: r.created_at as string,
  };
}

/** A log's lines, newest first, optionally between two dates. */
export async function loadLogEntries(
  supabase: SupabaseClient,
  { organisationId, templateId, from, to, limit = 1000 }: { organisationId: string; templateId: string; from?: string | null; to?: string | null; limit?: number },
): Promise<LogEntry[]> {
  let q = supabase
    .from("form_log_entries")
    .select(ENTRY_SELECT)
    .eq("organisation_id", organisationId)
    .eq("template_id", templateId);
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);
  const { data } = await q.order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map(toEntry);
}

/** The lines about one client across every log, newest first, with the log's title. */
export async function loadLogEntriesForClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<(LogEntry & { template_code: string; template_title: string; fields: FormField[] })[]> {
  const { data } = await supabase
    .from("form_log_entries")
    .select(`${ENTRY_SELECT}, template:form_templates (code, title, fields)`)
    .eq("client_id", clientId)
    .order("entry_date", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => {
    const t = unwrap(r.template) as { code?: string; title?: string; fields?: FormField[] } | undefined;
    return { ...toEntry(r), template_code: t?.code ?? "", template_title: t?.title ?? "Log", fields: t?.fields ?? [] };
  });
}

export interface LogCell {
  text: string;
  /** A reading outside the field's safe range. */
  flagged: boolean;
  filePath?: string;
}

/**
 * The columns a log shows: its fields, merging fields that share a label
 * (a fridge's and a freezer's "Temperature", each shown on its own
 * condition) into one column, in the log's order.
 */
export function logColumns(fields: FormField[]): { label: string; fields: FormField[] }[] {
  const cols: { label: string; fields: FormField[] }[] = [];
  for (const f of [...fields].sort((a, b) => a.sort_order - b.sort_order)) {
    if (f.type === "signature") continue;
    const same = cols.find((c) => c.label === f.label);
    if (same) same.fields.push(f);
    else cols.push({ label: f.label, fields: [f] });
  }
  return cols;
}

function cellText(f: FormField, v: unknown): { text: string; filePath?: string } {
  if (v === undefined || v === null || v === "") return { text: "" };
  if (typeof v === "object" && !Array.isArray(v) && typeof (v as { file?: unknown }).file === "string") {
    const file = v as { file: string; name?: string };
    return { text: file.name ?? "File", filePath: file.file };
  }
  if (Array.isArray(v)) return { text: v.join(", ") };
  if (f.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { text: formatDate(`${v}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" }) };
  }
  return { text: String(v) };
}

/** One line's cell for a column: the answer to whichever of its fields was asked. */
export function logCell(column: { fields: FormField[] }, answers: Record<string, unknown>): LogCell {
  for (const f of column.fields) {
    if (!isFieldVisible(f, answers)) continue;
    const v = answers[f.id];
    if (v === undefined || v === null || v === "") continue;
    return { ...cellText(f, v), flagged: isOutOfRange(f, v) };
  }
  return { text: "", flagged: false };
}

/** Whether any reading on a line is outside its range. */
export function lineFlagged(fields: FormField[], answers: Record<string, unknown>): boolean {
  return fields.some((f) => isFieldVisible(f, answers) && isOutOfRange(f, answers[f.id]));
}

/** A plain number (a freezer at -18) stays a number; any other formula-looking text is defused. */
function csvCell(s: string): string {
  const formula = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);
  if (!formula && !/[",\n\r]/.test(s)) return s;
  return `"${formula ? "'" : ""}${s.replace(/"/g, '""')}"`;
}

/**
 * The log as a spreadsheet: date, who, (client), each column, and who typed
 * it. A cell that a spreadsheet would read as a formula is quoted and
 * prefixed, so opening the file runs nothing.
 */
export function logCsv(
  entries: LogEntry[],
  fields: FormField[],
  { personLabel, withClient }: { personLabel: string; withClient: boolean },
): string {
  const cols = logColumns(fields);
  const header = ["Date", personLabel, ...(withClient ? ["Client"] : []), ...cols.map((c) => c.label), "Out of range", "Recorded by"];
  const rows = entries.map((e) => [
    e.entry_date,
    e.person,
    ...(withClient ? [e.client_name ?? ""] : []),
    ...cols.map((c) => logCell(c, e.answers).text),
    lineFlagged(fields, e.answers) ? "Yes" : "",
    e.recorded_by_name,
  ]);
  return [header, ...rows].map((r) => r.map((c) => csvCell(String(c))).join(",")).join("\r\n") + "\r\n";
}
